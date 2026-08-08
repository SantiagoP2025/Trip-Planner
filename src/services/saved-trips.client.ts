import { requestJson } from './api-client.ts';
import type {
  DeleteSavedTripResponseBody,
  ProposalType,
  SavedTrip,
  SavedTripsResponseBody,
  SaveTripResponseBody,
} from '../types/api.ts';

// Fase 8: las tres operaciones sobre `/api/trips/saved`.
//
// Regla 9 de CLAUDE.md: la fuente de verdad de los viajes guardados es el
// servidor. Este fichero es lo único que habla con él; `saved-trips.cache.ts` es
// una copia local que nunca decide nada.
//
// Sección 8.2, "No confiar en cálculos enviados por el frontend": al guardar no
// se manda la propuesta, se manda de qué búsqueda y cuál de las tres. El
// servidor la lee de su propia base de datos tal como la calculó él.

const SAVED_ENDPOINT = '/api/trips/saved';

export interface SaveTripInput {
  tripId: string;
  proposalType: ProposalType;
  title?: string;
}

export async function listSavedTrips(
  accessToken: string,
  options: { signal?: AbortSignal } = {},
): Promise<SavedTrip[]> {
  const body = await requestJson<SavedTripsResponseBody>(SAVED_ENDPOINT, {
    accessToken,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  return body.savedTrips;
}

export async function saveTrip(accessToken: string, input: SaveTripInput): Promise<SavedTrip> {
  const body = await requestJson<SaveTripResponseBody>(SAVED_ENDPOINT, {
    method: 'POST',
    accessToken,
    body: input,
  });

  return body.savedTrip;
}

export async function deleteSavedTrip(accessToken: string, id: string): Promise<string> {
  const body = await requestJson<DeleteSavedTripResponseBody>(
    `${SAVED_ENDPOINT}?id=${encodeURIComponent(id)}`,
    { method: 'DELETE', accessToken },
  );

  return body.deletedId;
}
