import type { Currency } from './common.js';

// Sección 14.1: petición que recibe FlightProvider.searchFlights().
export interface FlightSearchRequest {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  adults: number;
  children: number;
  currency: Currency;
}

// Sección 14.1: petición que recibe AccommodationProvider.searchAccommodations().
export interface AccommodationSearchRequest {
  destination: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  currency: Currency;
}

// Sección 14.1: petición que recibe PlacesProvider.searchActivities(). El filtrado
// por afinidad de preferencias es del motor de puntuación (fase 3), no del proveedor.
export interface ActivitySearchRequest {
  destination: string;
  limit?: number;
}

export type RouteTransportMode = 'walking' | 'driving' | 'transit';

// Sección 12.3: punto de entrada/salida para calculateTravelMatrix().
export interface RoutePoint {
  id: string;
  latitude: number;
  longitude: number;
}

// Sección 14.1: petición que recibe RoutesProvider.calculateMatrix().
export interface RouteMatrixRequest {
  origins: RoutePoint[];
  destinations: RoutePoint[];
  mode?: RouteTransportMode;
}

// Sección 14.1: una celda de la matriz de desplazamientos.
export interface RouteMatrixEntry {
  originId: string;
  destinationId: string;
  distanceKm: number;
  durationMinutes: number;
  mode: RouteTransportMode;
}
