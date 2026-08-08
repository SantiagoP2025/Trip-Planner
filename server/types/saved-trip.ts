import type { TripProposal } from './trip.ts';

// Fase 11: lo que el usuario ha reescrito de un bloque del itinerario.
//
// Solo lo editado. El texto original sigue en la propuesta, intacto, y por eso
// se puede distinguir lo editado de lo generado y volver atrás. Un campo
// ausente significa "esto no lo he tocado", no "esto está vacío".
export interface ItineraryEdit {
  // El identificador del elemento del itinerario (sección 12.2).
  itemId: string;
  title?: string;
  description?: string;
  updatedAt: string;
}

// Fase 8: un viaje guardado es una propuesta que el servidor ya calculó, con el
// contexto mínimo de la búsqueda que la produjo para poder listarla sin abrir
// cada viaje.
//
// La propuesta viaja entera y tal cual salió del motor. Regla 1 de CLAUDE.md: el
// frontend la pinta, no la reconstruye.
export interface SavedTrip {
  id: string;
  // Lo escribe el usuario, o lo compone el servidor si no lo escribe.
  title: string;
  savedAt: string;
  // La solicitud de la que salió, para poder recuperarla más adelante.
  tripRequestId: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  proposal: TripProposal;
  // Fase 11. Viaja aparte de la propuesta, no aplicada encima: el frontend
  // necesita las dos versiones para marcar lo editado y ofrecer volver al
  // original. Vacío en un viaje que nadie ha tocado.
  edits: ItineraryEdit[];
}
