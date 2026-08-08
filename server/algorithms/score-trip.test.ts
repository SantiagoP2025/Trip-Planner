import { describe, expect, it } from 'vitest';
import type { TripScoreBreakdown } from '../types/trip.js';
import {
  DEFAULT_TRIP_SCORE_WEIGHTS,
  PROFILE_SCORE_WEIGHTS,
  buildTripScoringContext,
  calculateTripScore,
  rescoreForProfile,
} from './score-trip.js';

const context = buildTripScoringContext([800, 1200, 1600]);

const base = {
  totalCost: 1200,
  accommodationQuality: 80,
  location: 70,
  transportComfort: 60,
  usableTime: 50,
  preferenceMatch: 90,
};

// Sección 10.2: puntuación global recomendada.
describe('calculateTripScore', () => {
  it('normaliza el precio contra el conjunto de combinaciones', () => {
    expect(calculateTripScore({ ...base, totalCost: 800 }, context).price).toBe(100);
    expect(calculateTripScore({ ...base, totalCost: 1600 }, context).price).toBe(0);
    expect(calculateTripScore(base, context).price).toBe(50);
  });

  it('aplica los pesos de la sección 10.2', () => {
    const scores = calculateTripScore(base, context);
    const esperado =
      50 * DEFAULT_TRIP_SCORE_WEIGHTS.price +
      80 * DEFAULT_TRIP_SCORE_WEIGHTS.accommodationQuality +
      70 * DEFAULT_TRIP_SCORE_WEIGHTS.location +
      60 * DEFAULT_TRIP_SCORE_WEIGHTS.transportComfort +
      50 * DEFAULT_TRIP_SCORE_WEIGHTS.usableTime +
      90 * DEFAULT_TRIP_SCORE_WEIGHTS.preferenceMatch;

    expect(scores.total).toBeCloseTo(esperado, 2);
  });

  it('los pesos de cada perfil suman 1', () => {
    for (const weights of Object.values(PROFILE_SCORE_WEIGHTS)) {
      const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
      expect(total).toBeCloseTo(1, 6);
    }
  });
});

// Sección 10.6: cada perfil pondera distinto la misma combinación.
describe('rescoreForProfile', () => {
  const barata: TripScoreBreakdown = {
    price: 100,
    accommodationQuality: 50,
    location: 45,
    transportComfort: 45,
    usableTime: 50,
    preferenceMatch: 55,
    total: 0,
  };
  const comoda: TripScoreBreakdown = {
    price: 20,
    accommodationQuality: 100,
    location: 95,
    transportComfort: 90,
    usableTime: 80,
    preferenceMatch: 80,
    total: 0,
  };

  it('el perfil económico prefiere la barata', () => {
    expect(rescoreForProfile(barata, 'economical')).toBeGreaterThan(rescoreForProfile(comoda, 'economical'));
  });

  it('el perfil confort prefiere la cómoda', () => {
    expect(rescoreForProfile(comoda, 'comfort')).toBeGreaterThan(rescoreForProfile(barata, 'comfort'));
  });

  it('el perfil recomendado usa los pesos de la sección 10.2', () => {
    const scores = calculateTripScore(base, context);
    expect(rescoreForProfile(scores, 'recommended')).toBeCloseTo(scores.total, 2);
  });
});
