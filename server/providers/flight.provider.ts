import type { FlightOffer } from '../types/flight.js';
import type { FlightSearchRequest } from '../types/provider.js';

// Sección 14.1: contrato común para el proveedor simulado y el real (p.ej.
// Amadeus). Sustituir la implementación no debe tocar el motor de puntuación.
export interface FlightProvider {
  searchFlights(request: FlightSearchRequest): Promise<FlightOffer[]>;
}
