import type { AccommodationOffer } from '../types/accommodation.js';
import type { OpeningPeriod } from '../types/common.js';
import type { FlightOffer } from '../types/flight.js';
import type { ItineraryItem } from '../types/itinerary.js';
import type { BudgetBreakdown, TripScoreBreakdown } from '../types/trip.js';
import { calculateUsableHours } from './score-flight.js';
import { checkOpeningHours, detectOverlaps } from './schedule-itinerary.js';

// Sección 10.4: una media alta no debe ocultar una deficiencia grave.
export const MINIMUM_SCORES = {
  location: 45,
  accommodationQuality: 55,
  transportComfort: 40,
  preferenceMatch: 50,
} as const;

export interface ConstraintCheckResult {
  passed: boolean;
  // Motivos en español: acaban en la respuesta al usuario (sección 10.7).
  failures: string[];
}

export interface ScheduledActivity {
  item: ItineraryItem;
  openingHours?: OpeningPeriod[];
}

export interface HardConstraintInput {
  budgetLimit: number;
  travelers: number;
  // Fechas del formulario en formato AAAA-MM-DD (sección 5).
  departureDate: string;
  returnDate: string;
  flight: FlightOffer;
  accommodation: AccommodationOffer;
  budget: BudgetBreakdown;
  minimumFoodBudget: number;
  minimumEmergencyReserve: number;
  // Solo llegan cuando ya hay itinerario construido; hasta entonces las dos
  // últimas restricciones de la sección 10.1 no aplican.
  itinerary?: readonly ItineraryItem[];
  scheduledActivities?: readonly ScheduledActivity[];
  checkedBaggageRequired?: boolean;
}

function dateOf(isoDateTime: string | undefined): string | undefined {
  return isoDateTime?.slice(0, 10);
}

// Sección 10.1: restricciones duras. Se comprueban todas y se devuelven todos
// los motivos, no solo el primero: la sección 10.7 pide poder explicar por qué
// se descartó una combinación.
export function checkHardConstraints(input: HardConstraintInput): ConstraintCheckResult {
  const failures: string[] = [];

  if (input.budget.totalTripCost > input.budgetLimit) {
    failures.push('El coste total supera el presupuesto indicado.');
  }

  if (input.accommodation.capacity < input.travelers) {
    failures.push('El alojamiento no tiene capacidad para todos los viajeros.');
  }

  if (dateOf(input.flight.outbound[0]?.departureTime) !== input.departureDate) {
    failures.push('El vuelo de ida no sale en la fecha solicitada.');
  }

  if (dateOf(input.flight.inbound?.[0]?.departureTime) !== input.returnDate) {
    failures.push('El vuelo de vuelta no sale en la fecha solicitada.');
  }

  if (calculateUsableHours(input.flight) <= 0) {
    failures.push('El vuelo de vuelta sale antes de llegar al destino.');
  }

  if (input.budget.foodBudget < input.minimumFoodBudget) {
    failures.push('No queda presupuesto suficiente para las comidas del viaje.');
  }

  if (input.budget.localTransportCost <= 0) {
    failures.push('El transporte local y los traslados no están cubiertos.');
  }

  if (input.budget.emergencyReserve < input.minimumEmergencyReserve) {
    failures.push('No se ha reservado el margen mínimo para imprevistos.');
  }

  if (input.checkedBaggageRequired && !input.flight.baggageIncluded) {
    failures.push('El vuelo no incluye el equipaje facturado que necesitas.');
  }

  if (input.itinerary && detectOverlaps(input.itinerary).length > 0) {
    failures.push('El itinerario tiene actividades solapadas.');
  }

  if (input.scheduledActivities) {
    const outsideHours = input.scheduledActivities.some(
      (scheduled) =>
        !checkOpeningHours(scheduled.openingHours, scheduled.item.startTime, scheduled.item.endTime),
    );
    if (outsideHours) {
      failures.push('Alguna visita queda fuera del horario de apertura.');
    }
  }

  return { passed: failures.length === 0, failures };
}

// Sección 10.4: umbrales mínimos por criterio esencial.
export function meetsMinimumScores(
  scores: TripScoreBreakdown,
  thresholds: typeof MINIMUM_SCORES = MINIMUM_SCORES,
): ConstraintCheckResult {
  const failures: string[] = [];

  if (scores.location < thresholds.location) {
    failures.push('La ubicación del alojamiento está por debajo del mínimo aceptable.');
  }
  if (scores.accommodationQuality < thresholds.accommodationQuality) {
    failures.push('La calidad del alojamiento está por debajo del mínimo aceptable.');
  }
  if (scores.transportComfort < thresholds.transportComfort) {
    failures.push('La comodidad del transporte está por debajo del mínimo aceptable.');
  }
  if (scores.preferenceMatch < thresholds.preferenceMatch) {
    failures.push('La afinidad con tus preferencias está por debajo del mínimo aceptable.');
  }

  return { passed: failures.length === 0, failures };
}
