import type { ItineraryEdit, SavedTrip } from '../types/saved-trip.js';
import type { ProposalType } from '../types/trip.js';

// Sección 14.1, mismo patrón que con los proveedores y con `TripRepository`: el
// endpoint habla con esta interfaz y no con Supabase.
//
// Diferencia importante con `TripRepository`: aquí no hay best-effort. Guardar
// es la operación entera, no un extra que acompaña a otra cosa, así que un fallo
// sube como excepción y el usuario lo ve (regla 15). Un viaje que el usuario
// cree haber guardado y no está es exactamente lo que la regla 9 viene a evitar.

// Lo que el servidor necesita saber de la solicitud antes de dejar guardar nada:
// de quién es y qué buscó. Es lo que decide entre 403 y 200 (sección 16.1).
export interface TripRequestOwnership {
  userId: string | null;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
}

export interface NewSavedTrip {
  userId: string;
  tripRequestId: string;
  tripProposalId: string;
  title: string;
}

export interface SavedTripRepository {
  // `null` cuando la solicitud no existe. Que exista pero sea de otro no se
  // decide aquí: eso es una decisión de autorización y vive en el handler.
  findTripRequest(tripRequestId: string): Promise<TripRequestOwnership | null>;
  // El navegador pide guardar "la económica" o "la recomendada", no una fila
  // concreta: los identificadores de la base de datos no salen de aquí.
  findProposalId(tripRequestId: string, proposalType: ProposalType): Promise<string | null>;
  // Para saber si guardar creará una fila nueva o solo cambiará el título de una
  // que ya existe. Sin esta comprobación, un usuario que ha llegado al tope no
  // podría ni renombrar lo que ya tiene guardado.
  findSavedTripId(userId: string, tripProposalId: string): Promise<string | null>;
  countByUser(userId: string): Promise<number>;
  save(record: NewSavedTrip): Promise<SavedTrip>;
  listByUser(userId: string, limit: number): Promise<SavedTrip[]>;
  // `false` cuando no había nada que borrar con ese identificador *para ese
  // usuario*: el handler lo traduce a 404 sin distinguir entre "no existe" y "es
  // de otro", que es lo que evita usar este endpoint para averiguar qué viajes
  // tienen los demás.
  deleteById(savedTripId: string, userId: string): Promise<boolean>;

  // --- Fase 11: ediciones del itinerario ---

  // El viaje entero, con su propuesta, para poder comparar lo que escribe el
  // usuario con el texto original. Acotado por usuario: el handler traduce el
  // `null` a 404 sin distinguir entre "no existe" y "es de otro".
  findSavedTripForUser(savedTripId: string, userId: string): Promise<SavedTrip | null>;
  // Crea o actualiza la edición de un bloque. Devuelve lo guardado, que es lo
  // que el frontend pinta: nada de suponer que se guardó lo que se mandó.
  upsertEdit(savedTripId: string, edit: Omit<ItineraryEdit, 'updatedAt'>): Promise<ItineraryEdit>;
  // Volver al original es borrar la fila, no dejarla vacía. `false` cuando no
  // había ninguna edición que deshacer.
  deleteEdit(savedTripId: string, itemId: string): Promise<boolean>;
}
