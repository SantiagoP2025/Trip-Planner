import type { AccommodationOffer } from '../types/accommodation.ts';
import type { AccommodationSearchRequest } from '../types/provider.ts';

// Sección 14.1: contrato común para el proveedor simulado y el real (p.ej.
// Booking). Sustituir la implementación no debe tocar el motor de puntuación.
export interface AccommodationProvider {
  searchAccommodations(request: AccommodationSearchRequest): Promise<AccommodationOffer[]>;
}
