import type { FlightOffer } from '../types/flight.ts';
import type { FlightSearchRequest } from '../types/provider.ts';

// Sección 14.1: contrato común para el proveedor simulado y el real (p.ej.
// Amadeus). Sustituir la implementación no debe tocar el motor de puntuación.
export interface FlightProvider {
  searchFlights(request: FlightSearchRequest): Promise<FlightOffer[]>;
}
