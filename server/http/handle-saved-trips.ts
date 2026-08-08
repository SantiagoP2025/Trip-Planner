import { readBearerToken, type SessionVerifier, type AuthenticatedUser } from '../auth/session.ts';
import { MAX_SAVED_TRIPS_PER_USER } from '../config/trip-limits.ts';
import { defaultSavedTripTitle } from '../repositories/saved-trip-rows.ts';
import type { SavedTripRepository } from '../repositories/saved-trip.repository.ts';
import { validateDeleteSavedTrip, validateSaveTrip } from '../schemas/saved-trip.schema.ts';
import type {
  DeleteSavedTripResponseBody,
  SaveTripResponseBody,
  SavedTripsResponseBody,
} from '../types/api.ts';
import type { RequestHandler } from './handler.ts';
import { logError, logRequest } from './logger.ts';
import { messageForJsonBodyFailure, readJsonBody } from './read-json-body.ts';
import { rateLimitHeaders, type RateLimiter } from './rate-limit.ts';
import { createRequestId, resolveClientIp } from './request-context.ts';
import { errorResponse, jsonResponse } from './responses.ts';

// Fase 8: GET, POST y DELETE de /api/trips/saved.
//
// Sección 8.2: "Añadir autenticación antes de permitir acceso a viajes
// privados". Las tres operaciones exigen sesión; no hay lectura pública ni
// "modo invitado" que pueda dejarse abierto por descuido, porque el control está
// antes de repartir por método y no dentro de cada uno.
//
// Regla 9 de CLAUDE.md: esto es la fuente de verdad de los viajes guardados. El
// `localStorage` del navegador es una caché de esta lista y nunca al revés.
//
// A diferencia de la persistencia de la fase 6, aquí **no** hay best-effort. Al
// generar, guardar es un extra y el usuario tiene su viaje igual; al guardar,
// guardar es la operación entera. Un fallo sube, se registra y se le enseña al
// usuario (regla 15).

const ROUTE = '/api/trips/saved';
const ALLOWED_METHODS = 'GET, POST, DELETE';

export interface SavedTripsHandlerDependencies {
  repository: SavedTripRepository;
  sessionVerifier: SessionVerifier;
  rateLimiter: RateLimiter;
  newRequestId?: () => string;
}

export function createSavedTripsHandler(
  dependencies: SavedTripsHandlerDependencies,
): RequestHandler {
  const { repository, sessionVerifier, rateLimiter } = dependencies;
  const newRequestId = dependencies.newRequestId ?? createRequestId;

  return async function handleSavedTrips(request: Request): Promise<Response> {
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
    if (request.method !== 'GET' && request.method !== 'POST' && request.method !== 'DELETE') {
      return respond(
        errorResponse('METHOD_NOT_ALLOWED', requestId, { headers: { allow: ALLOWED_METHODS } }),
        'method_not_allowed',
      );
    }

    // Antes de comprobar la sesión, que es la parte cara: comprobarla cuesta una
    // ida y vuelta a Supabase, y quien insiste no debería poder pagarla con
    // nuestro presupuesto de peticiones.
    const decision = rateLimiter.check(resolveClientIp(request));
    const limitHeaders = rateLimitHeaders(decision);
    if (!decision.allowed) {
      return respond(
        errorResponse('RATE_LIMITED', requestId, { headers: limitHeaders }),
        'rate_limited',
      );
    }

    const session = await sessionVerifier.verify(readBearerToken(request));

    if (session.status === 'unavailable') {
      // No es culpa del usuario y no puede decírsele que su sesión no vale: no
      // hemos podido comprobarla. Sección 16.1: 500, "error interno controlado".
      logError(requestId, 'auth.verifier_unavailable', session.error);
      return respond(
        errorResponse('INTERNAL_ERROR', requestId, { headers: limitHeaders }),
        'auth_unavailable',
      );
    }

    if (session.status === 'anonymous') {
      return respond(
        errorResponse('UNAUTHORIZED', requestId, {
          headers: { ...limitHeaders, 'www-authenticate': 'Bearer' },
        }),
        'unauthorized',
      );
    }

    const { user } = session;

    try {
      if (request.method === 'GET') {
        return respond(await list(repository, requestId, user, limitHeaders), 'listed');
      }

      if (request.method === 'POST') {
        const result = await save(repository, request, requestId, user, limitHeaders);
        return respond(result.response, result.outcome);
      }

      const result = await remove(repository, request, requestId, user, limitHeaders);
      return respond(result.response, result.outcome);
    } catch (error) {
      // El detalle técnico se queda en el log con el identificador de petición
      // (sección 16.3); al usuario le llega el mensaje en español de siempre.
      logError(requestId, 'saved_trips.internal_error', error);
      return respond(
        errorResponse('INTERNAL_ERROR', requestId, { headers: limitHeaders }),
        'internal_error',
      );
    }
  };
}

interface HandledOperation {
  response: Response;
  outcome: string;
}

async function list(
  repository: SavedTripRepository,
  requestId: string,
  user: AuthenticatedUser,
  headers: Record<string, string>,
): Promise<Response> {
  // El tope no es decorativo: es el mismo número que impide guardar más, así que
  // la lista no puede crecer por encima de él ni con filas metidas a mano.
  const savedTrips = await repository.listByUser(user.id, MAX_SAVED_TRIPS_PER_USER);

  const body: SavedTripsResponseBody = { requestId, savedTrips };
  return jsonResponse(200, body, headers);
}

async function save(
  repository: SavedTripRepository,
  request: Request,
  requestId: string,
  user: AuthenticatedUser,
  headers: Record<string, string>,
): Promise<HandledOperation> {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return {
      response: errorResponse('INVALID_REQUEST', requestId, {
        message: messageForJsonBodyFailure(body.reason),
        headers,
      }),
      outcome: `invalid_body:${body.reason}`,
    };
  }

  const validation = validateSaveTrip(body.value);
  if (!validation.success) {
    return {
      response: errorResponse('VALIDATION_ERROR', requestId, {
        details: validation.errors,
        headers,
      }),
      outcome: 'validation_error',
    };
  }

  const { tripId, proposalType, title } = validation.data;

  // Las dos consultas dependen del mismo identificador pero no la una de la
  // otra, así que van a la vez en vez de sumar sus idas y vueltas.
  const [tripRequest, proposalId] = await Promise.all([
    repository.findTripRequest(tripId),
    repository.findProposalId(tripId, proposalType),
  ]);

  if (!tripRequest) {
    return {
      response: errorResponse('NOT_FOUND', requestId, { headers }),
      outcome: 'trip_not_found',
    };
  }

  // Sección 16.1: 403, "usuario sin permiso". La clave de servicio con la que
  // escribe el servidor salta Row Level Security, así que esta comprobación es
  // la que de verdad impide guardarse el viaje de otro.
  if (tripRequest.userId !== user.id) {
    return {
      response: errorResponse('FORBIDDEN', requestId, {
        headers,
        // Un viaje sin dueño es uno generado sin sesión iniciada. Decirlo con
        // estas palabras convierte un "no puedes" en algo que el usuario sabe
        // resolver, y no revela nada de nadie.
        ...(tripRequest.userId === null
          ? {
              message:
                'Este viaje se generó sin haber iniciado sesión. Vuelve a buscarlo con tu cuenta abierta para poder guardarlo.',
            }
          : {}),
      }),
      outcome: tripRequest.userId === null ? 'trip_not_owned' : 'forbidden',
    };
  }

  if (!proposalId) {
    return {
      response: errorResponse('NOT_FOUND', requestId, { headers }),
      outcome: 'proposal_not_found',
    };
  }

  const [existingId, savedCount] = await Promise.all([
    repository.findSavedTripId(user.id, proposalId),
    repository.countByUser(user.id),
  ]);

  // Regla 5: tope duro también aquí. Solo se aplica cuando la operación crea una
  // fila nueva; cambiarle el título a un viaje que ya estaba guardado no hace
  // crecer nada y no tiene por qué chocar contra el límite.
  if (existingId === null && savedCount >= MAX_SAVED_TRIPS_PER_USER) {
    return {
      response: errorResponse('SAVED_TRIPS_LIMIT', requestId, { headers }),
      outcome: 'limit_reached',
    };
  }

  const savedTrip = await repository.save({
    userId: user.id,
    tripRequestId: tripId,
    tripProposalId: proposalId,
    title: title ?? defaultSavedTripTitle(tripRequest.origin, tripRequest.destination),
  });

  // Sección 16.1: 201, "viaje generado y guardado". Aquí sí se puede prometer,
  // al revés que en la generación: si hemos llegado a esta línea, está guardado.
  const responseBody: SaveTripResponseBody = { requestId, savedTrip };
  return { response: jsonResponse(201, responseBody, headers), outcome: 'saved' };
}

async function remove(
  repository: SavedTripRepository,
  request: Request,
  requestId: string,
  user: AuthenticatedUser,
  headers: Record<string, string>,
): Promise<HandledOperation> {
  // El identificador viaja en la consulta y no en la ruta a propósito: mantiene
  // una sola función de servidor —un solo sitio con el control de método, el
  // límite de peticiones y la comprobación de sesión— en vez de duplicar todo
  // eso en un fichero de ruta dinámica para una única operación.
  const id = new URL(request.url).searchParams.get('id');

  const validation = validateDeleteSavedTrip({ id });
  if (!validation.success) {
    return {
      response: errorResponse('VALIDATION_ERROR', requestId, {
        details: validation.errors,
        headers,
      }),
      outcome: 'validation_error',
    };
  }

  const deleted = await repository.deleteById(validation.data.id, user.id);

  // Borrar algo que no existe y borrar algo de otro se contestan igual: si el
  // 404 y el 403 se distinguieran aquí, este endpoint serviría para averiguar
  // qué identificadores existen.
  if (!deleted) {
    return {
      response: errorResponse('NOT_FOUND', requestId, { headers }),
      outcome: 'not_found',
    };
  }

  const body: DeleteSavedTripResponseBody = { requestId, deletedId: validation.data.id };
  return { response: jsonResponse(200, body, headers), outcome: 'deleted' };
}
