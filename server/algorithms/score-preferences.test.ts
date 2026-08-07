import { describe, expect, it } from 'vitest';
import type { PreferenceProfile } from '../types/common.ts';
import type { ActivityCandidate } from '../types/activity.ts';
import {
  NEUTRAL_PREFERENCE_SCORE,
  calculateActivitiesPreferenceScore,
  calculatePreferenceScore,
} from './score-preferences.ts';

function profile(overrides: Partial<PreferenceProfile> = {}): PreferenceProfile {
  return {
    beach: 0,
    culture: 0,
    gastronomy: 0,
    nightlife: 0,
    nature: 0,
    shopping: 0,
    family: 0,
    relax: 0,
    ...overrides,
  };
}

function activity(id: string, activityProfile: PreferenceProfile): ActivityCandidate {
  return {
    id,
    name: `Actividad ${id}`,
    category: 'Museo',
    profile: activityProfile,
    latitude: 40.4,
    longitude: -3.7,
    estimatedDurationMinutes: 90,
    verificationStatus: 'unverified',
  };
}

// Sección 17.1: "Cálculo de afinidad".
describe('calculatePreferenceScore', () => {
  it('da 100 cuando la opción cubre al máximo lo que el usuario pide', () => {
    const user = profile({ culture: 3, gastronomy: 2 });
    const option = profile({ culture: 3, gastronomy: 3 });
    expect(calculatePreferenceScore(user, option)).toBe(100);
  });

  it('da 0 cuando la opción no cubre nada de lo que el usuario pide', () => {
    const user = profile({ beach: 3 });
    const option = profile({ culture: 3 });
    expect(calculatePreferenceScore(user, option)).toBe(0);
  });

  it('ignora las preferencias con nivel 0', () => {
    const user = profile({ culture: 2 });
    const conNightlife = profile({ culture: 3, nightlife: 3 });
    const sinNightlife = profile({ culture: 3 });
    expect(calculatePreferenceScore(user, conNightlife)).toBe(calculatePreferenceScore(user, sinNightlife));
  });

  // Sección 6.2: el valor de reserva cuando no hay ninguna preferencia marcada.
  it('devuelve 50 cuando el usuario no marca ninguna preferencia', () => {
    expect(calculatePreferenceScore(profile(), profile({ culture: 3 }))).toBe(NEUTRAL_PREFERENCE_SCORE);
  });

  it('pondera más las preferencias imprescindibles que las secundarias', () => {
    const user = profile({ culture: 3, shopping: 1 });
    const cubreCultura = profile({ culture: 3, shopping: 0 });
    const cubreCompras = profile({ culture: 0, shopping: 3 });
    expect(calculatePreferenceScore(user, cubreCultura)).toBeGreaterThan(
      calculatePreferenceScore(user, cubreCompras),
    );
  });

  it('se mantiene siempre en la escala 0-100', () => {
    const user = profile({ culture: 3, beach: 1, relax: 2 });
    const option = profile({ culture: 2, beach: 1, relax: 3 });
    const score = calculatePreferenceScore(user, option);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('calculateActivitiesPreferenceScore', () => {
  it('promedia la afinidad de las actividades de la propuesta', () => {
    const user = profile({ culture: 3 });
    const score = calculateActivitiesPreferenceScore(user, [
      activity('a', profile({ culture: 3 })),
      activity('b', profile({ culture: 0 })),
    ]);
    expect(score).toBe(50);
  });

  it('devuelve el valor neutro sin actividades', () => {
    expect(calculateActivitiesPreferenceScore(profile({ culture: 3 }), [])).toBe(NEUTRAL_PREFERENCE_SCORE);
  });
});
