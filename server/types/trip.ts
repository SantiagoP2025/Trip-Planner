import type { Currency, PreferenceProfile } from './common.js';
import type { FlightOffer } from './flight.js';
import type { AccommodationOffer } from './accommodation.js';
import type { ActivityCandidate } from './activity.js';
import type { ItineraryDay } from './itinerary.js';

export type TravelStyle = 'economical' | 'balanced' | 'comfort';

// Sección 5: campos opcionales que afinan la generación sin ser obligatorios.
export interface TripConstraints {
  reducedMobility?: boolean;
  dietaryRestrictions?: string[];
  earliestStartTime?: string;
  latestEndTime?: string;
  maxWalkingMinutes?: number;
  checkedBaggageRequired?: boolean;
}

// Sección 5: contrato de datos del formulario, compartido entre frontend y backend.
export interface TripRequest {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  travelers: {
    adults: number;
    children: number;
  };
  budget: number;
  currency: Currency;
  travelStyle: TravelStyle;
  preferences: PreferenceProfile;
  constraints?: TripConstraints;
}

// Sección 9: desglose que debe sumar como máximo el presupuesto del usuario.
export interface BudgetBreakdown {
  mainTransportCost: number;
  accommodationCost: number;
  foodBudget: number;
  activityCost: number;
  localTransportCost: number;
  insuranceCost: number;
  emergencyReserve: number;
  totalTripCost: number;
  currency: Currency;
}

// Sección 10.2: puntuaciones parciales normalizadas a 0-100 antes de ponderar.
export interface TripScoreBreakdown {
  price: number;
  accommodationQuality: number;
  location: number;
  transportComfort: number;
  usableTime: number;
  preferenceMatch: number;
  total: number;
}

// Sección 10: combinación candidata antes de filtrar dominadas y elegir las tres finales.
export interface TripCombination {
  flight: FlightOffer;
  accommodation: AccommodationOffer;
  activities: ActivityCandidate[];
  budget: BudgetBreakdown;
  scores: TripScoreBreakdown;
}

export type ProposalType = 'economical' | 'recommended' | 'comfort';

// Sección 10.7: cada propuesta final debe poder explicar por qué se eligió.
export interface TripProposal {
  id: string;
  type: ProposalType;
  rank: number;
  score: number;
  estimatedTotal: number;
  currency: Currency;
  budget: BudgetBreakdown;
  flight: FlightOffer;
  accommodation: AccommodationOffer;
  itinerary: ItineraryDay[];
  evaluatedCombinations: number;
  discardedCombinations: number;
  reasons: string[];
  warnings: string[];
}

// Sección 16.3: lo que hay que poder registrar de cada generación. Es material
// de log, no de respuesta: el endpoint decide qué parte devuelve al navegador.
export interface TripGenerationDiagnostics {
  flightsFound: number;
  accommodationsFound: number;
  activitiesFound: number;
  evaluatedCombinations: number;
  discardedCombinations: number;
  // "Registrar descartes y causas": cuántas combinaciones descartó cada motivo.
  discardReasons: Record<string, number>;
  // "Registrar duración de cada proveedor", en milisegundos.
  providerDurationsMs: Record<string, number>;
}

// Salida del motor de generación. `proposals` viene vacío cuando ninguna
// combinación supera las restricciones de la sección 10.1: no es un error, es un
// resultado legítimo que el endpoint traduce a un mensaje para el usuario.
export interface TripGenerationResult {
  proposals: TripProposal[];
  diagnostics: TripGenerationDiagnostics;
}

// Sección 16.1: forma común de un error de validación de campo, en español.
export interface ValidationError {
  field: string;
  message: string;
}
