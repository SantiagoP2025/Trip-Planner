import type { HealthResponseBody } from '../types/api.ts';
import { logRequest } from './logger.ts';
import { rateLimitHeaders, type RateLimiter } from './rate-limit.ts';
import { createRequestId, resolveClientIp } from './request-context.ts';
import { errorResponse, jsonResponse } from './responses.ts';
import type { RequestHandler } from './handler.ts';

// Sección 7.1: GET /api/health. Demuestra que Vercel reconoce la carpeta `api`,
// compila TypeScript y ejecuta código de servidor. Criterio de aceptación de la
// sección 17.3: "/api/health responde correctamente en producción".

const ROUTE = '/api/health';
const SERVICE_NAME = 'trip-planner-backend';

export interface HealthHandlerDependencies {
  rateLimiter: RateLimiter;
  now?: () => Date;
  newRequestId?: () => string;
}

export function createHealthHandler(dependencies: HealthHandlerDependencies): RequestHandler {
  const now = dependencies.now ?? (() => new Date());
  const newRequestId = dependencies.newRequestId ?? createRequestId;

  return async function handleHealth(request: Request): Promise<Response> {
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

    // No consulta proveedores, pero es público: sin tope sirve de amplificador.
    const decision = dependencies.rateLimiter.check(resolveClientIp(request));
    const limitHeaders = rateLimitHeaders(decision);
    if (!decision.allowed) {
      return respond(
        errorResponse('RATE_LIMITED', requestId, { headers: limitHeaders }),
        'rate_limited',
      );
    }

    // Sección 8.2: "No exponer secretos ni respuestas brutas sensibles". La
    // respuesta de salud dice que el servicio está vivo y nada más: ni versiones
    // de dependencias, ni configuración, ni estado de los proveedores.
    const body: HealthResponseBody = {
      status: 'ok',
      service: SERVICE_NAME,
      timestamp: now().toISOString(),
    };

    return respond(jsonResponse(200, body, limitHeaders), 'ok');
  };
}
