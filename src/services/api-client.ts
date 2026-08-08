import type { ApiErrorBody, ValidationError } from '../types/api.ts';

// Única puerta del frontend hacia el backend. Todo lo que sale de aquí a `/api`
// pasa por esta función: un solo sitio que decide cómo se manda el token, cómo
// se leen los errores y qué mensaje acaba en pantalla.
//
// Regla 1 de CLAUDE.md: lo que devuelve el servidor es lo que se pinta. No hay
// una segunda fuente, ni un respaldo local, ni un generador "para ir viendo la
// pantalla mientras". Si el endpoint falla, se enseña el error (regla 15).

// CLAUDE.md: al usuario, mensaje claro en español y sin detalles técnicos. Los
// mensajes de esta clase son los que acaban en pantalla, así que el detalle
// técnico se queda en `cause`, para la consola.
export class TripApiError extends Error {
  readonly status: number | null;
  readonly requestId: string | null;
  readonly fieldErrors: ValidationError[];

  constructor(
    message: string,
    options: {
      status?: number | null;
      requestId?: string | null;
      fieldErrors?: ValidationError[];
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'TripApiError';
    this.status = options.status ?? null;
    this.requestId = options.requestId ?? null;
    this.fieldErrors = options.fieldErrors ?? [];
  }
}

const NETWORK_MESSAGE =
  'No hemos podido conectar con el servidor. Comprueba tu conexión y vuelve a intentarlo.';
const UNEXPECTED_MESSAGE = 'Ha ocurrido un error inesperado. Inténtalo de nuevo en unos minutos.';

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const error = (value as { error?: unknown }).error;
  return typeof error === 'object' && error !== null && 'message' in error;
}

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  // El token de acceso de la sesión de Supabase. Va en la cabecera y nunca en la
  // URL: las URL acaban en logs de servidor, en historiales y en cabeceras
  // `Referer`.
  accessToken?: string | null;
  signal?: AbortSignal;
}

export async function requestJson<T>(url: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.accessToken) headers.authorization = `Bearer ${options.accessToken}`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    // Un `AbortError` no es un fallo que enseñar: es que el usuario se ha ido de
    // la pantalla o ha lanzado otra petición. Sube tal cual y quien llama lo
    // ignora.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new TripApiError(NETWORK_MESSAGE, { cause: error });
  }

  // Un cuerpo que no es JSON no debería ocurrir, pero si ocurre no puede acabar
  // en una pantalla en blanco: se trata como un error más.
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new TripApiError(UNEXPECTED_MESSAGE, { status: response.status, cause: error });
  }

  if (!response.ok) {
    if (isApiErrorBody(payload)) {
      // El mensaje viene ya redactado en español desde el servidor, que es quien
      // sabe qué ha pasado. El frontend no lo reescribe.
      throw new TripApiError(payload.error.message, {
        status: response.status,
        requestId: payload.error.requestId ?? null,
        fieldErrors: payload.error.details ?? [],
      });
    }

    throw new TripApiError(UNEXPECTED_MESSAGE, { status: response.status });
  }

  return payload as T;
}
