import type { ProposalType, TripScoreBreakdown } from '../types/trip.js';
import { calculateRange, clampScore, normalizeLowerIsBetter, roundScore, type ValueRange } from './normalize-score.js';

export interface TripScoreWeights {
  price: number;
  accommodationQuality: number;
  location: number;
  transportComfort: number;
  usableTime: number;
  preferenceMatch: number;
}

// Sección 10.2: puntuación global recomendada.
export const DEFAULT_TRIP_SCORE_WEIGHTS: TripScoreWeights = {
  price: 0.25,
  accommodationQuality: 0.2,
  location: 0.15,
  transportComfort: 0.15,
  usableTime: 0.1,
  preferenceMatch: 0.15,
};

// Sección 10.6: cada perfil usa pesos distintos, o las tres propuestas salen
// prácticamente idénticas.
export const PROFILE_SCORE_WEIGHTS: Record<ProposalType, TripScoreWeights> = {
  // "Precio, pero manteniendo mínimos de calidad": los mínimos los garantizan
  // los umbrales de la sección 10.4, no estos pesos.
  economical: {
    price: 0.45,
    accommodationQuality: 0.15,
    location: 0.1,
    transportComfort: 0.1,
    usableTime: 0.1,
    preferenceMatch: 0.1,
  },
  // "Equilibrio global y mejor puntuación total": los pesos de la sección 10.2.
  recommended: DEFAULT_TRIP_SCORE_WEIGHTS,
  // "Alojamiento, ubicación, horarios y comodidad".
  comfort: {
    price: 0.1,
    accommodationQuality: 0.3,
    location: 0.2,
    transportComfort: 0.2,
    usableTime: 0.1,
    preferenceMatch: 0.1,
  },
};

// Regla 6 de CLAUDE.md: el rango de costes de todas las combinaciones se calcula
// una vez, fuera del bucle que puntúa cada combinación.
export interface TripScoringContext {
  totalCost: ValueRange;
}

export function buildTripScoringContext(totalCosts: readonly number[]): TripScoringContext {
  return { totalCost: calculateRange(totalCosts, (cost) => cost) };
}

export interface TripScoreInput {
  totalCost: number;
  accommodationQuality: number;
  location: number;
  transportComfort: number;
  usableTime: number;
  preferenceMatch: number;
}

// Sección 10.2: los criterios ya vienen normalizados a 0-100 (sección 10.3);
// aquí solo se pondera. El precio se normaliza contra el conjunto porque solo
// tiene sentido comparado con las demás combinaciones.
export function calculateTripScore(
  input: TripScoreInput,
  context: TripScoringContext,
  weights: TripScoreWeights = DEFAULT_TRIP_SCORE_WEIGHTS,
): TripScoreBreakdown {
  const price = normalizeLowerIsBetter(input.totalCost, context.totalCost.min, context.totalCost.max);
  const accommodationQuality = clampScore(input.accommodationQuality);
  const location = clampScore(input.location);
  const transportComfort = clampScore(input.transportComfort);
  const usableTime = clampScore(input.usableTime);
  const preferenceMatch = clampScore(input.preferenceMatch);

  const total =
    price * weights.price +
    accommodationQuality * weights.accommodationQuality +
    location * weights.location +
    transportComfort * weights.transportComfort +
    usableTime * weights.usableTime +
    preferenceMatch * weights.preferenceMatch;

  return {
    price: roundScore(price),
    accommodationQuality: roundScore(accommodationQuality),
    location: roundScore(location),
    transportComfort: roundScore(transportComfort),
    usableTime: roundScore(usableTime),
    preferenceMatch: roundScore(preferenceMatch),
    total: roundScore(total),
  };
}

// Sección 10.6: la misma combinación puntúa distinto según el perfil. Se
// reponderan las puntuaciones parciales ya calculadas; no se recalcula nada.
export function rescoreForProfile(scores: TripScoreBreakdown, profile: ProposalType): number {
  const weights = PROFILE_SCORE_WEIGHTS[profile];
  return roundScore(
    scores.price * weights.price +
      scores.accommodationQuality * weights.accommodationQuality +
      scores.location * weights.location +
      scores.transportComfort * weights.transportComfort +
      scores.usableTime * weights.usableTime +
      scores.preferenceMatch * weights.preferenceMatch,
  );
}
