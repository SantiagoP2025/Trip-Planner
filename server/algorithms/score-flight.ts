import type { FlightOffer } from '../types/flight.js';
import {
  calculateRange,
  clampScore,
  normalizeHigherIsBetter,
  normalizeLowerIsBetter,
  roundScore,
  type ValueRange,
} from './normalize-score.js';

// Sección 11.2: pesos orientativos de la puntuación de vuelo.
export const FLIGHT_SCORE_WEIGHTS = {
  price: 0.4,
  duration: 0.2,
  stops: 0.15,
  schedule: 0.15,
  conditions: 0.1,
} as const;

export interface FlightScoreBreakdown {
  price: number;
  duration: number;
  stops: number;
  schedule: number;
  conditions: number;
  total: number;
}

// Regla 6 de CLAUDE.md: los agregados del conjunto de ofertas viven aquí, se
// calculan una vez y se pasan a scoreFlight(). Ninguna puntuación individual
// vuelve a recorrer la lista completa.
export interface FlightScoringContext {
  price: ValueRange;
  duration: ValueRange;
  stops: ValueRange;
  usableHours: ValueRange;
}

const MINUTES_PER_HOUR = 60;
const MS_PER_HOUR = 60 * 60 * 1000;

// Sin zona horaria del aeropuerto no se puede saber la hora local; los
// proveedores simulados emiten en UTC y el real deberá normalizar a UTC igual.
function hourOfDay(isoDateTime: string): number {
  const date = new Date(isoDateTime);
  return date.getUTCHours() + date.getUTCMinutes() / MINUTES_PER_HOUR;
}

// Sección 11.2, criterio "Horarios": penaliza salidas de madrugada y llegadas
// nocturnas, que son las que arruinan un día de viaje.
function hourComfortScore(hour: number): number {
  if (hour >= 8 && hour < 12) return 100;
  if (hour >= 12 && hour < 18) return 80;
  if (hour >= 6 && hour < 8) return 65;
  if (hour >= 18 && hour < 22) return 50;
  return 20;
}

function firstSegmentDeparture(offer: FlightOffer): string | undefined {
  return offer.outbound[0]?.departureTime;
}

function lastSegmentArrival(segments: FlightOffer['outbound'] | undefined): string | undefined {
  if (!segments || segments.length === 0) return undefined;
  return segments[segments.length - 1].arrivalTime;
}

// Sección 10.2, criterio "Aprovechamiento del tiempo": horas reales en destino,
// desde que se aterriza hasta que despega el vuelo de vuelta.
export function calculateUsableHours(offer: FlightOffer): number {
  const arrival = lastSegmentArrival(offer.outbound);
  const departureBack = offer.inbound?.[0]?.departureTime;
  if (!arrival || !departureBack) return 0;

  const hours = (new Date(departureBack).getTime() - new Date(arrival).getTime()) / MS_PER_HOUR;
  return hours > 0 ? Math.round(hours * 100) / 100 : 0;
}

export function calculateScheduleScore(offer: FlightOffer): number {
  const departure = firstSegmentDeparture(offer);
  const arrivalBack = lastSegmentArrival(offer.inbound);

  const scores: number[] = [];
  if (departure) scores.push(hourComfortScore(hourOfDay(departure)));
  if (arrivalBack) scores.push(hourComfortScore(hourOfDay(arrivalBack)));

  if (scores.length === 0) return 50;
  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

// Sección 11.2, criterio "Equipaje y condiciones".
export function calculateConditionsScore(offer: FlightOffer): number {
  return (offer.baggageIncluded ? 60 : 0) + (offer.refundable ? 40 : 0);
}

// Regla 6: un único recorrido del conjunto para todos los rangos que necesitan
// las puntuaciones individuales.
export function buildFlightScoringContext(offers: readonly FlightOffer[]): FlightScoringContext {
  return {
    price: calculateRange(offers, (offer) => offer.totalPrice),
    duration: calculateRange(offers, (offer) => offer.totalDurationMinutes),
    stops: calculateRange(offers, (offer) => offer.stops),
    usableHours: calculateRange(offers, calculateUsableHours),
  };
}

// Sección 11.2: puntuación de una oferta de vuelo contra el contexto del
// conjunto. No recibe la lista: no puede recorrerla aunque quisiera.
export function scoreFlight(offer: FlightOffer, context: FlightScoringContext): FlightScoreBreakdown {
  const price = normalizeLowerIsBetter(offer.totalPrice, context.price.min, context.price.max);
  const duration = normalizeLowerIsBetter(
    offer.totalDurationMinutes,
    context.duration.min,
    context.duration.max,
  );
  const stops = normalizeLowerIsBetter(offer.stops, context.stops.min, context.stops.max);
  const schedule = clampScore(calculateScheduleScore(offer));
  const conditions = clampScore(calculateConditionsScore(offer));

  const total =
    price * FLIGHT_SCORE_WEIGHTS.price +
    duration * FLIGHT_SCORE_WEIGHTS.duration +
    stops * FLIGHT_SCORE_WEIGHTS.stops +
    schedule * FLIGHT_SCORE_WEIGHTS.schedule +
    conditions * FLIGHT_SCORE_WEIGHTS.conditions;

  return {
    price: roundScore(price),
    duration: roundScore(duration),
    stops: roundScore(stops),
    schedule: roundScore(schedule),
    conditions: roundScore(conditions),
    total: roundScore(total),
  };
}

// Peso conjunto de los criterios de la sección 11.2 que no son el precio.
const COMFORT_WEIGHT_TOTAL =
  FLIGHT_SCORE_WEIGHTS.duration +
  FLIGHT_SCORE_WEIGHTS.stops +
  FLIGHT_SCORE_WEIGHTS.schedule +
  FLIGHT_SCORE_WEIGHTS.conditions;

// Sección 10.2, criterio "Comodidad del transporte". El precio ya entra en la
// puntuación global como criterio propio (25 %) y calculado sobre el coste total
// del viaje, así que aquí se excluye y se reponderan los demás criterios de la
// sección 11.2 para que vuelvan a sumar 1. Si no, el precio contaría dos veces.
export function calculateTransportComfortScore(breakdown: FlightScoreBreakdown): number {
  return roundScore(
    (breakdown.duration * FLIGHT_SCORE_WEIGHTS.duration +
      breakdown.stops * FLIGHT_SCORE_WEIGHTS.stops +
      breakdown.schedule * FLIGHT_SCORE_WEIGHTS.schedule +
      breakdown.conditions * FLIGHT_SCORE_WEIGHTS.conditions) /
      COMFORT_WEIGHT_TOTAL,
  );
}

// Sección 10.2, criterio "Aprovechamiento del tiempo", ya normalizado.
export function scoreUsableTime(offer: FlightOffer, context: FlightScoringContext): number {
  return roundScore(
    normalizeHigherIsBetter(
      calculateUsableHours(offer),
      context.usableHours.min,
      context.usableHours.max,
    ),
  );
}
