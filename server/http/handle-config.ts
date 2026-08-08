import { readSupabasePublicConfig } from '../config/env.ts';
import type { RuntimeConfigResponseBody } from '../types/api.ts';
import type { RequestHandler } from './handler.ts';
import { logRequest } from './logger.ts';
import { rateLimitHeaders, type RateLimiter } from './rate-limit.ts';
import { createRequestId, resolveClientIp } from './request-context.ts';
import { errorResponse, jsonResponse } from './responses.ts';

// Fase 8: GET /api/config. Configuración de ejecución para el navegador.
//
// Regla 4 de CLAUDE.md: ninguna variable lleva prefijo `VITE_`, y por eso hace
// falta este endpoint. La clave anónima de Supabase no es un secreto —lo que
// decide qué puede tocar cada quien son las políticas Row Level Security— pero
// servirla en tiempo de ejecución en vez de hornearla en el bundle es lo que
// permite tener valores distintos en Development, Preview y Production con el
// mismo compilado (sección 8.2, "Separar claves de Development, Preview y
// Production").
//
// Lo que sí es un secreto, `SUPABASE_SERVICE_ROLE_KEY`, no se lee siquiera en
// este fichero: `readSupabasePublicConfig` no lo mira, así que no hay forma de
// que acabe en la respuesta ni por descuido.

const ROUTE = '/api/config';

export interface ConfigHandlerDependencies {
  rateLimiter: RateLimiter;
  env?: Record<string, string | undefined>;
  newRequestId?: () => string;
}

export function createConfigHandler(dependencies: ConfigHandlerDependencies): RequestHandler {
  const newRequestId = dependencies.newRequestId ?? createRequestId;
  const env = dependencies.env ?? process.env;

  return async function handleConfig(request: Request): Promise<Response> {
    const requestId = newRequestId();
    const startedAt = Date.now();

    const respond = (response: Response, outcome: string): Response => {
      logRequest({
        requestId,
        route: ROUTE,
        method: request.method,
        status: response.status,
        durationMs: Date.now() - startedAt,
        outcome,
      });
      return response;
    };

    // Sección 8.2: "Aceptar únicamente métodos HTTP previstos".
    if (request.method !== 'GET') {
      return respond(
        errorResponse('METHOD_NOT_ALLOWED', requestId, { headers: { allow: 'GET' } }),
        'method_not_allowed',
      );
    }

    const decision = dependencies.rateLimiter.check(resolveClientIp(request));
    const limitHeaders = rateLimitHeaders(decision);
    if (!decision.allowed) {
      return respond(
        errorResponse('RATE_LIMITED', requestId, { headers: limitHeaders }),
        'rate_limited',
      );
    }

    const result = readSupabasePublicConfig(env);

    // Una configuración a medias se contesta como "sin cuentas" y no como error:
    // el frontend enseña que las cuentas no están disponibles y la aplicación
    // sigue generando viajes. Que alguien tenga que arreglarlo se dice en el log
    // de arranque del propio endpoint, no en la cara del usuario.
    const body: RuntimeConfigResponseBody = {
      supabase:
        result.status === 'configured'
          ? { url: result.config.url, anonKey: result.config.anonKey }
          : null,
    };

    return respond(jsonResponse(200, body, limitHeaders), `supabase:${result.status}`);
  };
}
