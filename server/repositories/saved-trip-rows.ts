import type { ItineraryEdit, SavedTrip } from '../types/saved-trip.js';
import type { TripProposal } from '../types/trip.js';
import type { NewSavedTrip } from './saved-trip.repository.js';

// Traducción entre las filas de `saved_trips` y el tipo del dominio, aparte del
// repositorio y sin dependencias del cliente de Supabase. Es donde se cuelan los
// errores silenciosos, así que es lo que hay que poder probar sin base de datos.

export interface SavedTripRow {
  user_id: string;
  trip_request_id: string;
  trip_proposal_id: string;
  title: string;
}

export function toSavedTripRow(record: NewSavedTrip): SavedTripRow {
  return {
    user_id: record.userId,
    trip_request_id: record.tripRequestId,
    trip_proposal_id: record.tripProposalId,
    title: record.title,
  };
}

// Título por defecto cuando el usuario no escribe ninguno. Se compone en el
// servidor y no en el navegador para que sea el mismo texto se guarde desde
// donde se guarde.
export function defaultSavedTripTitle(origin: string, destination: string): string {
  return `${origin} → ${destination}`;
}

// PostgREST devuelve las relaciones incrustadas como objeto cuando la
// cardinalidad es "de muchos a uno", pero devuelve un array cuando no puede
// deducirla. Aceptar las dos formas cuesta tres líneas y evita que un cambio de
// versión deje la lista de viajes vacía sin decir por qué.
function firstOf(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'object' && first !== null ? (first as Record<string, unknown>) : null;
  }

  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// Devuelve `null` en vez de lanzar: una fila rota —porque alguien borró la
// propuesta a mano, porque una migración a medias— no puede tumbar la lista
// entera del usuario. El repositorio la descarta y el resto se enseña.
export function toSavedTrip(row: unknown): SavedTrip | null {
  const record = firstOf(row);
  if (!record) return null;

  const id = asString(record.id);
  const title = asString(record.title);
  const tripRequestId = asString(record.trip_request_id);
  const savedAt = asString(record.created_at);
  if (!id || !title || !tripRequestId || !savedAt) return null;

  const request = firstOf(record.trip_requests);
  const proposalRow = firstOf(record.trip_proposals);
  if (!request || !proposalRow) return null;

  const origin = asString(request.origin);
  const destination = asString(request.destination);
  const departureDate = asString(request.departure_date);
  const returnDate = asString(request.return_date);
  if (!origin || !destination || !departureDate || !returnDate) return null;

  // La propuesta se guardó en JSONB tal como salió del motor (sección 13.2), así
  // que vuelve entera. Lo único que se comprueba aquí es que siga siendo un
  // objeto: validarla campo a campo sería reimplementar el motor en la capa de
  // lectura.
  const data = proposalRow.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;

  return {
    id,
    title,
    savedAt,
    tripRequestId,
    origin,
    destination,
    departureDate,
    returnDate,
    proposal: data as TripProposal,
    // Fase 11: las ediciones viajan aparte de la propuesta, sin aplicarse
    // encima. El frontend necesita las dos versiones para marcar lo editado y
    // ofrecer volver al original.
    edits: toItineraryEdits(record.saved_trip_edits),
  };
}

// Una edición sin identificador de elemento, o sin ningún texto, no se puede
// pintar ni deshacer: se descarta en vez de arrastrarla hasta la pantalla.
export function toItineraryEdits(value: unknown): ItineraryEdit[] {
  if (!Array.isArray(value)) return [];

  const edits: ItineraryEdit[] = [];

  for (const row of value) {
    const record = firstOf(row);
    if (!record) continue;

    const itemId = asString(record.item_id);
    if (!itemId) continue;

    const title = asString(record.title);
    const description = asString(record.description);
    if (!title && !description) continue;

    edits.push({
      itemId,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      updatedAt: asString(record.updated_at) ?? '',
    });
  }

  return edits;
}
