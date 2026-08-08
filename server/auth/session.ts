import { withinTimeout } from '../services/with-timeout.js';

// Sección 8.2: "Añadir autenticación antes de permitir acceso a viajes
// privados". Este módulo es el único sitio del servidor que decide si una
// petición viene de un usuario identificado.
//
// El navegador manda el token de acceso de Supabase en la cabecera
// `Authorization`. El servidor no se fía de él por venir bien formado: lo
// comprueba contra Supabase, que es quien lo firmó y quien sabe si sigue vivo.
// Un token caducado, revocado o de otro proyecto se rechaza aquí.

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

// Tres resultados y no dos, porque "no hay sesión" y "no he podido comprobarlo"
// no se contestan igual: lo primero es un 401 y lo segundo un 500. Confundirlos
// haría que una caída de Supabase le dijera al usuario que su contraseña ya no
// vale.
export type SessionResult =
  | { status: 'authenticated'; user: AuthenticatedUser }
  | { status: 'anonymous' }
  | { status: 'unavailable'; error: unknown };

export interface SessionVerifier {
  verify(token: string | null): Promise<SessionResult>;
}

// Sección 8.2, "Validar tamaño y contenido del body", aplicado a la cabecera: un
// token de Supabase ronda el kilobyte. Lo que llegue muy por encima de eso no es
// una sesión, y no hay por qué reenviarlo a nadie para averiguarlo.
export const MAX_ACCESS_TOKEN_LENGTH = 4_096;

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

export function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;

  const token = BEARER_PATTERN.exec(header.trim())?.[1];
  if (!token || token.length > MAX_ACCESS_TOKEN_LENGTH) return null;

  return token;
}

// Forma mínima del cliente de Supabase que necesita el verificador. Estar
// escrita aquí es lo que permite probarlo con un doble de tres líneas en vez de
// levantar un proyecto de Supabase.
export interface SupabaseAuthApi {
  auth: {
    getUser(token: string): PromiseLike<{
      data: { user: { id: string; email?: string | null } | null };
      error: { message: string; status?: number; code?: string } | null;
    }>;
  };
}

export const DEFAULT_SESSION_TIMEOUT_MS = 3_000;

// Un token que Supabase rechaza es un usuario anónimo; cualquier otro fallo es
// una caída del servicio de autenticación, que no puede convertirse en "tu
// sesión ha caducado".
const REJECTION_CODES = new Set(['bad_jwt', 'session_not_found', 'user_not_found']);

function isRejection(error: { status?: number; code?: string }): boolean {
  if (error.status === 401 || error.status === 403) return true;
  return error.code !== undefined && REJECTION_CODES.has(error.code);
}

export class SupabaseSessionVerifier implements SessionVerifier {
  private readonly client: SupabaseAuthApi;
  private readonly timeoutMs: number;

  constructor(client: SupabaseAuthApi, timeoutMs: number = DEFAULT_SESSION_TIMEOUT_MS) {
    this.client = client;
    this.timeoutMs = timeoutMs;
  }

  async verify(token: string | null): Promise<SessionResult> {
    // Sin token no se llama a nadie: la mayoría de las peticiones del endpoint
    // de generación son anónimas y no tienen por qué pagar una ida y vuelta.
    if (token === null) return { status: 'anonymous' };

    try {
      const { data, error } = await withinTimeout(
        Promise.resolve(this.client.auth.getUser(token)),
        this.timeoutMs,
        `El servicio de autenticación no respondió en ${this.timeoutMs} ms.`,
      );

      if (error) {
        return isRejection(error)
          ? { status: 'anonymous' }
          : { status: 'unavailable', error: new Error(error.message) };
      }

      if (!data.user) return { status: 'anonymous' };

      // Del usuario solo se toma lo que hace falta. Sección 8.2: "No guardar
      // datos personales innecesarios"; tampoco pasearlos por el servidor.
      return {
        status: 'authenticated',
        user: { id: data.user.id, email: data.user.email ?? null },
      };
    } catch (error) {
      return { status: 'unavailable', error };
    }
  }
}

// Sin Supabase configurado no hay forma de comprobar una sesión. Decirlo así
// —`unavailable` y no `anonymous`— es lo que hace que el endpoint de viajes
// guardados devuelva un error de servidor en vez de un 401 que culparía al
// usuario de una configuración que le falta al despliegue.
export class UnavailableSessionVerifier implements SessionVerifier {
  private readonly reason: string;

  constructor(reason: string) {
    this.reason = reason;
  }

  async verify(token: string | null): Promise<SessionResult> {
    // Sin token no hace falta comprobar nada para saber que no hay sesión: es
    // anónimo, y así el endpoint de generación sigue funcionando sin cuentas.
    if (token === null) return { status: 'anonymous' };

    return { status: 'unavailable', error: new Error(this.reason) };
  }
}
