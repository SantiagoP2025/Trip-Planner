import { requestJson } from './api-client.ts';
import type {
  DeleteItineraryEditResponseBody,
  ItineraryEdit,
  ItineraryEditResponseBody,
} from '../types/api.ts';

// Fase 11: guardar y deshacer las ediciones del itinerario.
//
// Regla 14 de PLAN-2.md: lo que el usuario escribe va contra el servidor, no a
// `localStorage`. La caché local de `saved-trips.cache.ts` guarda una copia de
// lo que ya está guardado en el servidor; nunca es el sitio donde vive lo que
// alguien acaba de escribir.

const EDITS_ENDPOINT = '/api/trips/itinerary-edits';

export interface ItineraryEditFields {
  title?: string;
  description?: string;
}

// Devuelve `null` cuando lo escrito no cambiaba nada respecto al original: el
// servidor lo trata como una vuelta al original, y quien llama tiene que quitar
// la marca de "editado" en vez de suponer que se guardó algo.
export async function saveItineraryEdit(
  accessToken: string,
  savedTripId: string,
  itemId: string,
  fields: ItineraryEditFields,
): Promise<ItineraryEdit | null> {
  const body = await requestJson<ItineraryEditResponseBody>(EDITS_ENDPOINT, {
    method: 'PUT',
    accessToken,
    body: { savedTripId, itemId, ...fields },
  });

  return body.edit;
}

export async function revertItineraryEdit(
  accessToken: string,
  savedTripId: string,
  itemId: string,
): Promise<string> {
  const query = `savedTripId=${encodeURIComponent(savedTripId)}&itemId=${encodeURIComponent(itemId)}`;

  const body = await requestJson<DeleteItineraryEditResponseBody>(`${EDITS_ENDPOINT}?${query}`, {
    method: 'DELETE',
    accessToken,
  });

  return body.itemId;
}
