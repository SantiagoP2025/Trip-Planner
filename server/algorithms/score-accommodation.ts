import type { AccommodationOffer } from '../types/accommodation.ts';
import {
  calculateRange,
  clampScore,
  normalizeLowerIsBetter,
  roundScore,
  type ValueRange,
} from './normalize-score.ts';

// Sección 11.4: pesos orientativos de la puntuación de alojamiento.
export const ACCOMMODATION_SCORE_WEIGHTS = {
  price: 0.3,
  location: 0.25,
  rating: 0.2,
  conditions: 0.1,
  groupFit: 0.1,
  services: 0.05,
} as const;

export interface AccommodationScoreBreakdown {
  price: number;
  location: number;
  rating: number;
  conditions: number;
  groupFit: number;
  services: number;
  total: number;
}

// Regla 6 de CLAUDE.md: agregados del conjunto, calculados una sola vez.
export interface AccommodationScoringContext {
  price: ValueRange;
  distanceToCenterKm: ValueRange;
}

const MAX_RATING = 5;
// Número de valoraciones a partir del cual se da crédito completo a la nota.
const FULL_CONFIDENCE_REVIEWS = 100;
const NEUTRAL_SCORE = 50;

// Un alojamiento sin distancia al centro no puede puntuar mejor que uno que sí
// la declara: se le asigna la peor del conjunto. Sección 9.1, "mostrar
// claramente conceptos estimados y verificados": el dato ausente no premia.
function distanceOf(offer: AccommodationOffer, context: AccommodationScoringContext): number {
  return offer.distanceToCenterKm ?? context.distanceToCenterKm.max;
}

// Sección 11.4, criterio "Valoración". Una nota de 4,8 con 11 opiniones no vale
// lo que la misma nota con 2.000, así que la confianza acerca la puntuación al
// valor neutro cuando hay pocas opiniones.
export function calculateRatingScore(offer: AccommodationOffer): number {
  if (offer.rating === undefined) return NEUTRAL_SCORE;

  const rawScore = clampScore((offer.rating / MAX_RATING) * 100);
  const confidence = Math.min(offer.reviewCount ?? 0, FULL_CONFIDENCE_REVIEWS) / FULL_CONFIDENCE_REVIEWS;
  return NEUTRAL_SCORE + (rawScore - NEUTRAL_SCORE) * confidence;
}

// Sección 11.4, criterio "Adecuación al grupo". Capacidad insuficiente es una
// restricción dura (sección 10.1) y aquí puntúa 0; una capacidad muy por encima
// del grupo penaliza poco, porque se paga espacio que no se usa.
export function calculateGroupFitScore(offer: AccommodationOffer, travelers: number): number {
  if (offer.capacity < travelers) return 0;
  const surplus = offer.capacity - travelers;
  return clampScore(100 - surplus * 10);
}

export function buildAccommodationScoringContext(
  offers: readonly AccommodationOffer[],
): AccommodationScoringContext {
  return {
    price: calculateRange(offers, (offer) => offer.totalPrice),
    distanceToCenterKm: calculateRange(offers, (offer) => offer.distanceToCenterKm ?? Number.NaN),
  };
}

// Sección 11.4: puntuación de una oferta de alojamiento contra el contexto del
// conjunto, nunca contra la lista entera.
export function scoreAccommodation(
  offer: AccommodationOffer,
  context: AccommodationScoringContext,
  travelers: number,
): AccommodationScoreBreakdown {
  const price = normalizeLowerIsBetter(offer.totalPrice, context.price.min, context.price.max);
  const location = normalizeLowerIsBetter(
    distanceOf(offer, context),
    context.distanceToCenterKm.min,
    context.distanceToCenterKm.max,
  );
  const rating = clampScore(calculateRatingScore(offer));
  const conditions = offer.freeCancellation ? 100 : 0;
  const groupFit = calculateGroupFitScore(offer, travelers);
  const services = offer.breakfastIncluded ? 100 : 0;

  const total =
    price * ACCOMMODATION_SCORE_WEIGHTS.price +
    location * ACCOMMODATION_SCORE_WEIGHTS.location +
    rating * ACCOMMODATION_SCORE_WEIGHTS.rating +
    conditions * ACCOMMODATION_SCORE_WEIGHTS.conditions +
    groupFit * ACCOMMODATION_SCORE_WEIGHTS.groupFit +
    services * ACCOMMODATION_SCORE_WEIGHTS.services;

  return {
    price: roundScore(price),
    location: roundScore(location),
    rating: roundScore(rating),
    conditions: roundScore(conditions),
    groupFit: roundScore(groupFit),
    services: roundScore(services),
    total: roundScore(total),
  };
}
