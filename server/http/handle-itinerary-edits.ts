import { readBearerToken, type AuthenticatedUser, type SessionVerifier } from '../auth/session.js';
import type { SavedTripRepository } from '../repositories/saved-trip.repository.js';
import {
  validateDeleteItineraryEdit,
  validateItineraryEdit,
} from '../schemas/itinerary-edit.schema.js';
import { findItineraryItem, toStoredEdit } from '../services/itinerary-edits.js';
import type { DeleteItineraryEditResponseBody, ItineraryEditResponseBody } from '../types/api.js';
import type { RequestHandler } from './handler.js';
import { logError, logRequest } from './logger.js';
import { messageForJsonBodyFailure, readJsonBody } from './read-json-body.js';
import { rateLimitHeaders, type RateLimiter } from './rate-limit.js';
import { createRequestId, resolveClientIp } from './request-context.js';
import { errorResponse, jsonResponse } from './responses.js';

// Fase 11: PUT y DELETE de /api/trips/itinerary-edits.
//
// Regla 14 de PLAN-2.md: lo que el usuario escribe se guarda contra el servidor.
// Aquí no hay best-effort ni "ya se guardará luego": si la escritura falla, el
// usuario lo ve (regla 15). Perder en silencio lo que alguien acaba de escribir
// es peor que perder un dato generado, porque no se puede volver a calcular.
//
// PUT y no POST: editar el mismo bloque dos veces deja el mismo estado que
// editarlo una. El navegador puede reintentar sin duplicar nada.

const ROUTE = '/api/trips/itinerary-edits';
const ALLOWED_METHODS = 'PUT, DELETE';

export interface ItineraryEditsHandlerDependencies {
  repository: SavedTripRepository;
  sessionVerifier: SessionVerifier;
  rateLimiter: RateLimiter;
  newRequestId?: () => string;
}

interface HandledOperation {
  response: Response;
  outcome: string;
}

export function createItineraryEditsHandler(
  dependencies: ItineraryEditsHandlerDependencies,
): RequestHandler {
  const { repository, sessionVerifier, rateLimiter } = dependencies;
  const newRequestId = dependencies.newRequestId ?? createRequestId;

  return async function handleItineraryEdits(request: Request): Promise<Response> {
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
    if (request.method !== 'PUT' && request.method !== 'DELETE') {
      return respond(
        errorResponse('METHOD_NOT_ALLOWED', requestId, { headers: { allow: ALLOWED_METHODS } }),
        'method_not_allowed',
      );
    }

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

    try {
      const result =
        request.method === 'PUT'
          ? await saveEdit(repository, request, requestId, session.user, limitHeaders)
          : await removeEdit(repository, request, requestId, session.user, limitHeaders);

      return respond(result.response, result.outcome);
    } catch (error) {
      logError(requestId, 'itinerary_edits.internal_error', error);
      return respond(
        errorResponse('INTERNAL_ERROR', requestId, { headers: limitHeaders }),
        'internal_error',
      );
    }
  };
}

async function saveEdit(
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

  const validation = validateItineraryEdit(body.value);
  if (!validation.success) {
    return {
      response: errorResponse('VALIDATION_ERROR', requestId, {
        details: validation.errors,
        headers,
      }),
      outcome: 'validation_error',
    };
  }

  const { savedTripId, itemId, title, description } = validation.data;

  // El viaje se lee acotado por usuario: no existe y es de otro se contestan
  // igual, para que este endpoint no sirva de censo de viajes ajenos.
  const savedTrip = await repository.findSavedTripForUser(savedTripId, user.id);
  if (!savedTrip) {
    return {
      response: errorResponse('NOT_FOUND', requestId, { headers }),
      outcome: 'trip_not_found',
    };
  }

  // Solo se edita lo que el motor ha generado. Es la comprobación que impide
  // llenar la tabla con identificadores inventados, y la que acota cuántas
  // ediciones puede tener un viaje sin necesidad de un tope aparte.
  const original = findItineraryItem(savedTrip.proposal.itinerary, itemId);
  if (!original) {
    return {
      response: errorResponse('NOT_FOUND', requestId, {
        message: 'Ese bloque no existe en el itinerario de este viaje.',
        headers,
      }),
      outcome: 'item_not_found',
    };
  }

  // "Una edición vacía o idéntica al original no cuenta como edición". Cuando no
  // queda nada que guardar, la operación es una vuelta al original: se borra la
  // fila. Dejarla vacía marcaría el bloque como editado para siempre.
  const stored = toStoredEdit(original, { title, description });
  if (!stored) {
    await repository.deleteEdit(savedTripId, itemId);
    const body: ItineraryEditResponseBody = { requestId, edit: null };
    return { response: jsonResponse(200, body, headers), outcome: 'reverted' };
  }

  const edit = await repository.upsertEdit(savedTripId, { itemId, ...stored });

  const responseBody: ItineraryEditResponseBody = { requestId, edit };
  return { response: jsonResponse(200, responseBody, headers), outcome: 'saved' };
}

async function removeEdit(
  repository: SavedTripRepository,
  request: Request,
  requestId: string,
  user: AuthenticatedUser,
  headers: Record<string, string>,
): Promise<HandledOperation> {
  const url = new URL(request.url);

  const validation = validateDeleteItineraryEdit({
    savedTripId: url.searchParams.get('savedTripId'),
    itemId: url.searchParams.get('itemId'),
  });
  if (!validation.success) {
    return {
      response: errorResponse('VALIDATION_ERROR', requestId, {
        details: validation.errors,
        headers,
      }),
      outcome: 'validation_error',
    };
  }

  const { savedTripId, itemId } = validation.data;

  const savedTrip = await repository.findSavedTripForUser(savedTripId, user.id);
  if (!savedTrip) {
    return {
      response: errorResponse('NOT_FOUND', requestId, { headers }),
      outcome: 'trip_not_found',
    };
  }

  // Deshacer algo que ya está deshecho no es un error: el resultado es el que el
  // usuario quería. Contestar 404 obligaría al frontend a distinguir dos casos
  // que para él son el mismo.
  await repository.deleteEdit(savedTripId, itemId);

  const body: DeleteItineraryEditResponseBody = { requestId, itemId };
  return { response: jsonResponse(200, body, headers), outcome: 'reverted' };
}
