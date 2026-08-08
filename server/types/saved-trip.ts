import type { TripProposal } from './trip.ts';

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
}
