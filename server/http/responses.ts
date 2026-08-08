import type { ApiErrorBody, ApiErrorCode } from '../types/api.js';
import type { ValidationError } from '../types/trip.js';

// Sección 16.1: la tabla de códigos HTTP de la especificación.
//
// `SAVED_TRIPS_LIMIT` no tiene fila propia en esa tabla: haber alcanzado el
// máximo de viajes guardados no es un fallo de servidor ni un permiso que falte,
// es una solicitud que no se puede atender tal como viene. Sale como 400, que es
// la fila que le corresponde ("Solicitud inválida"), con su propio mensaje para
// que el usuario sepa qué hacer.
const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  INVALID_REQUEST: 400,
  VALIDATION_ERROR: 400,
  SAVED_TRIPS_LIMIT: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  RATE_LIMITED: 429,
  PROVIDER_ERROR: 502,
  INTERNAL_ERROR: 500,
};

// CLAUDE.md: al usuario, mensaje claro en español y sin detalles técnicos. El
// detalle del fallo va al log con el identificador de petición, nunca aquí.
const MESSAGE_BY_CODE: Record<ApiErrorCode, string> = {
  INVALID_REQUEST: 'La solicitud no tiene el formato esperado.',
  VALIDATION_ERROR: 'Algunos datos del viaje no son válidos. Revisa los campos marcados.',
  SAVED_TRIPS_LIMIT:
    'Has alcanzado el máximo de viajes guardados. Borra alguno para poder guardar otro.',
  UNAUTHORIZED: 'Inicia sesión para ver y guardar tus viajes.',
  // Ni aquí ni en el 404 se dice de quién es lo que se ha pedido: el mensaje
  // sería, él solo, una forma de averiguar qué viajes existen y de quién son.
  FORBIDDEN: 'Este viaje no es tuyo.',
  NOT_FOUND: 'No hemos encontrado este viaje.',
  METHOD_NOT_ALLOWED: 'Este método no está permitido en esta dirección.',
  RATE_LIMITED: 'Has hecho demasiadas peticiones seguidas. Espera unos segundos y vuelve a intentarlo.',
  PROVIDER_ERROR:
    'No hemos podido consultar la información de viajes en este momento. Inténtalo de nuevo en unos minutos.',
  INTERNAL_ERROR: 'Ha ocurrido un error inesperado. Inténtalo de nuevo en unos minutos.',
};

export function statusForErrorCode(code: ApiErrorCode): number {
  return STATUS_BY_CODE[code];
}

export function messageForErrorCode(code: ApiErrorCode): string {
  return MESSAGE_BY_CODE[code];
}

// `no-store` en todas las respuestas: una propuesta de viaje depende de quién
// pregunta y de cuándo, y no debe quedarse en ninguna caché intermedia.
export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

export interface ErrorResponseOptions {
  message?: string;
  details?: ValidationError[];
  headers?: Record<string, string>;
}

export function errorResponse(
  code: ApiErrorCode,
  requestId: string,
  options: ErrorResponseOptions = {},
): Response {
  const body: ApiErrorBody = {
    error: {
      code,
      message: options.message ?? MESSAGE_BY_CODE[code],
      requestId,
      ...(options.details && options.details.length > 0 ? { details: options.details } : {}),
    },
  };

  return jsonResponse(STATUS_BY_CODE[code], body, options.headers);
}
