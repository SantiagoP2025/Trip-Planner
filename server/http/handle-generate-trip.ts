import { validateTripRequest, type TripRequestInput } from '../schemas/trip.schema.ts';
import {
  generateTripProposals,
  TripProviderError,
  type TripPlannerProviders,
} from '../services/trip-planner.service.ts';
import type { GenerateTripResponseBody } from '../types/api.ts';
import type { TripRequest } from '../types/trip.ts';
import { logError, logGenerationDiagnostics, logRequest } from './logger.ts';
import { messageForJsonBodyFailure, readJsonBody } from './read-json-body.ts';
import { rateLimitHeaders, type RateLimiter } from './rate-limit.ts';
import { createRequestId, resolveClientIp } from './request-context.ts';
import { errorResponse, jsonResponse } from './responses.ts';
import type { RequestHandler } from './handler.ts';

// Sección 7.2: POST /api/trips/generate. Valida, ejecuta y responde.
//
// Regla 1 de CLAUDE.md: este endpoint es el único camino de datos. Lo que
// devuelve aquí es lo que pinta el frontend; no hay una segunda generación en
// el cliente ni la habrá.

const ROUTE = '/api/trips/generate';

export interface GenerateTripHandlerDependencies {
  providers: TripPlannerProviders;
  rateLimiter: RateLimiter;
  now?: () => Date;
  newRequestId?: () => string;
}

// El esquema convierte las fechas a `Date` para poder compararlas; el motor
// trabaja con la fecha en formato ISO corto, que es también lo que alimenta la
// semilla de los mocks. La conversión vive aquí, en la frontera.
function toTripRequest(input: TripRequestInput): TripRequest {
  return {
    origin: input.origin,
    destination: input.destination,
    departureDate: input.departureDate.toISOString().slice(0, 10),
    returnDate: input.returnDate.toISOString().slice(0, 10),
    travelers: input.travelers,
    budget: input.budget,
    currency: input.currency,
    travelStyle: input.travelStyle,
    preferences: input.preferences,
    ...(input.constraints ? { constraints: input.constraints } : {}),
  };
}

export function createGenerateTripHandler(
  dependencies: GenerateTripHandlerDependencies,
): RequestHandler {
  const now = dependencies.now ?? (() => new Date());
  const newRequestId = dependencies.newRequestId ?? createRequestId;

  return async function handleGenerateTrip(request: Request): Promise<Response> {
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

    // Sección 8.2: "Aceptar únicamente métodos HTTP previstos". Se comprueba lo
    // primero porque es lo más barato y no necesita leer nada del cuerpo.
    if (request.method !== 'POST') {
      return respond(
        errorResponse('METHOD_NOT_ALLOWED', requestId, { headers: { allow: 'POST' } }),
        'method_not_allowed',
      );
    }

    // El límite se comprueba antes de leer y validar el cuerpo: si la idea es
    // frenar a quien insiste, no tiene sentido hacer el trabajo caro primero.
    const decision = dependencies.rateLimiter.check(resolveClientIp(request));
    const limitHeaders = rateLimitHeaders(decision);
    if (!decision.allowed) {
      return respond(
        errorResponse('RATE_LIMITED', requestId, { headers: limitHeaders }),
        'rate_limited',
      );
    }

    const body = await readJsonBody(request);
    if (!body.ok) {
      // La tabla de la sección 16.1 no contempla 413 ni 415, así que los tres
      // fallos de formato del cuerpo salen como 400 "Solicitud inválida", con
      // el mensaje diciendo cuál de ellos ha sido.
      return respond(
        errorResponse('INVALID_REQUEST', requestId, {
          message: messageForJsonBodyFailure(body.reason),
          headers: limitHeaders,
        }),
        `invalid_body:${body.reason}`,
      );
    }

    // Sección 8.2: "No confiar en cálculos enviados por el frontend". Del cuerpo
    // solo se acepta lo que describe el esquema; costes, puntuaciones y
    // propuestas los calcula el servidor desde cero.
    const validation = validateTripRequest(body.value);
    if (!validation.success) {
      return respond(
        errorResponse('VALIDATION_ERROR', requestId, {
          details: validation.errors,
          headers: limitHeaders,
        }),
        'validation_error',
      );
    }

    try {
      const result = await generateTripProposals(
        toTripRequest(validation.data),
        dependencies.providers,
      );

      logGenerationDiagnostics(requestId, result.diagnostics);

      const responseBody: GenerateTripResponseBody = {
        requestId,
        generatedAt: now().toISOString(),
        proposals: result.proposals,
        // Que no salga ninguna propuesta viable no es un error: es la respuesta
        // correcta a un presupuesto o unas restricciones que no dan de sí.
        ...(result.proposals.length === 0
          ? {
              message:
                'No hemos encontrado ninguna propuesta que encaje con estos datos. Prueba a ampliar el presupuesto o a cambiar las fechas.',
            }
          : {}),
      };

      // 200 y no 201: la sección 16.1 reserva el 201 para "Viaje generado y
      // guardado", y todavía no se guarda nada (llega en la fase 6).
      return respond(jsonResponse(200, responseBody, limitHeaders), 'generated');
    } catch (error) {
      // Sección 16.1: el fallo de un proveedor externo es un 502, no un 500.
      if (error instanceof TripProviderError) {
        logError(requestId, 'trip.provider_error', error);
        return respond(
          errorResponse('PROVIDER_ERROR', requestId, { headers: limitHeaders }),
          'provider_error',
        );
      }

      logError(requestId, 'trip.internal_error', error);
      return respond(
        errorResponse('INTERNAL_ERROR', requestId, { headers: limitHeaders }),
        'internal_error',
      );
    }
  };
}
