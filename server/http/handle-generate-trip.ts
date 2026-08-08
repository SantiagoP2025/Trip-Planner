import { readBearerToken, type SessionVerifier } from '../auth/session.js';
import { NoopTripRepository } from '../repositories/noop-trip.repository.js';
import { validateTripRequest, type TripRequestInput } from '../schemas/trip.schema.js';
import {
  BestEffortTripPersistence,
  type TripPersistence,
} from '../services/trip-persistence.service.js';
import {
  generateTripProposals,
  TripProviderError,
  type TripPlannerProviders,
} from '../services/trip-planner.service.js';
import type { GenerateTripResponseBody } from '../types/api.js';
import type { TripRequest } from '../types/trip.js';
import { logError, logGenerationDiagnostics, logRequest } from './logger.js';
import { messageForJsonBodyFailure, readJsonBody } from './read-json-body.js';
import { rateLimitHeaders, type RateLimiter } from './rate-limit.js';
import { createRequestId, resolveClientIp } from './request-context.js';
import { errorResponse, jsonResponse } from './responses.js';
import type { RequestHandler } from './handler.js';

// Sección 7.2: POST /api/trips/generate. Valida, ejecuta y responde.
//
// Regla 1 de CLAUDE.md: este endpoint es el único camino de datos. Lo que
// devuelve aquí es lo que pinta el frontend; no hay una segunda generación en
// el cliente ni la habrá.

const ROUTE = '/api/trips/generate';

export interface GenerateTripHandlerDependencies {
  providers: TripPlannerProviders;
  rateLimiter: RateLimiter;
  // Sin persistencia configurada el endpoint funciona igual y no guarda nada:
  // es el criterio best-effort de la fase 6, también cuando no hay base de datos.
  persistence?: TripPersistence;
  // Fase 8. La sesión es *opcional* en este endpoint: generar un viaje no exige
  // cuenta y no va a exigirla. Sirve para poner nombre al dueño de la solicitud,
  // que es lo que después permite guardarla.
  sessionVerifier?: SessionVerifier;
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
  const persistence =
    dependencies.persistence ?? new BestEffortTripPersistence(new NoopTripRepository());

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

    const tripRequest = toTripRequest(validation.data);

    // Fase 8: si la petición trae sesión, la solicitud queda a nombre de su
    // dueño y podrá guardarse después. Sin sesión sigue generándose igual, a
    // nombre de nadie: pedir cuenta para ver tres propuestas sería cambiar el
    // producto, no protegerlo.
    //
    // Que no se pueda comprobar la sesión tampoco puede impedir la generación.
    // Se registra y se sigue: la fila queda anónima, como cualquier otra visita.
    let userId: string | null = null;
    if (dependencies.sessionVerifier) {
      const session = await dependencies.sessionVerifier.verify(readBearerToken(request));
      if (session.status === 'authenticated') {
        userId = session.user.id;
      } else if (session.status === 'unavailable') {
        logError(requestId, 'auth.verifier_unavailable', session.error);
      }
    }

    // La fila de la solicitud se crea a la vez que se genera el viaje, no antes:
    // no depende del resultado, así que su ida y vuelta a la base de datos se
    // esconde detrás del trabajo del motor en vez de sumarse a él.
    //
    // `begin` es best-effort y nunca rechaza, así que esta promesa suelta no
    // puede convertirse en un rechazo sin atender.
    const pendingTripId = persistence.begin(requestId, {
      request: tripRequest,
      userId,
    });

    try {
      const result = await generateTripProposals(tripRequest, dependencies.providers);

      logGenerationDiagnostics(requestId, result.diagnostics);

      const tripId = await pendingTripId;
      await persistence.complete(requestId, tripId, {
        status: result.proposals.length > 0 ? 'completed' : 'empty',
        proposals: result.proposals,
        diagnostics: result.diagnostics,
        failure: null,
      });

      const responseBody: GenerateTripResponseBody = {
        requestId,
        generatedAt: now().toISOString(),
        proposals: result.proposals,
        // Solo cuando de verdad hay fila que recuperar después. Si la base de
        // datos falló, el viaje se devuelve igual y sin identificador.
        ...(tripId !== null ? { tripId } : {}),
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
      // guardado", y guardarlo aquí es best-effort. Prometer en el código de
      // estado algo que puede no haber ocurrido sería mentir.
      return respond(jsonResponse(200, responseBody, limitHeaders), 'generated');
    } catch (error) {
      // Sección 13.1: la solicitud se cierra como fallida, con la causa, para
      // que no quede en `pending` como si la generación siguiera viva.
      await persistence.complete(requestId, await pendingTripId, {
        status: 'failed',
        proposals: [],
        diagnostics: null,
        failure: {
          provider: error instanceof TripProviderError ? error.provider : null,
          message: error instanceof Error ? error.message : String(error),
        },
      });

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
