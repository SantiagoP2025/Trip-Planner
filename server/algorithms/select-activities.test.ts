import { describe, expect, it } from 'vitest';
import type { ActivityCandidate } from '../types/activity.ts';
import type { PreferenceLevel, PreferenceProfile } from '../types/common.ts';
import { NEUTRAL_PREFERENCE_SCORE } from './score-preferences.ts';
import {
  calculateVisitsPerDay,
  MAX_VISITS_PER_DAY,
  REDUCED_VISITS_PER_DAY,
  selectActivities,
} from './select-activities.ts';

const NO_PREFERENCES: PreferenceProfile = {
  beach: 0,
  culture: 0,
  gastronomy: 0,
  nightlife: 0,
  nature: 0,
  shopping: 0,
  family: 0,
  relax: 0,
};

function preferences(overrides: Partial<PreferenceProfile>): PreferenceProfile {
  return { ...NO_PREFERENCES, ...overrides };
}

interface ActivityOptions {
  id: string;
  profile: Partial<PreferenceProfile>;
  pricePerPerson?: number;
}

function buildActivity(options: ActivityOptions): ActivityCandidate {
  return {
    id: options.id,
    name: `Actividad ${options.id}`,
    category: 'Museo',
    profile: preferences(options.profile),
    latitude: 38.72,
    longitude: -9.14,
    pricePerPerson: options.pricePerPerson,
    estimatedDurationMinutes: 90,
    verificationStatus: 'unverified',
  };
}

const MAX_LEVEL: PreferenceLevel = 3;

// Sección 12.1: "Máximo tres visitas principales al día".
describe('calculateVisitsPerDay', () => {
  it('permite tres visitas al día en un viaje normal', () => {
    expect(calculateVisitsPerDay(preferences({ culture: MAX_LEVEL }))).toBe(MAX_VISITS_PER_DAY);
  });

  // Sección 12.1: "Reducir intensidad si la preferencia Relax o Familia es alta".
  it('baja la intensidad cuando el descanso es imprescindible', () => {
    expect(calculateVisitsPerDay(preferences({ relax: MAX_LEVEL }))).toBe(REDUCED_VISITS_PER_DAY);
  });

  it('baja la intensidad cuando los planes en familia son imprescindibles', () => {
    expect(calculateVisitsPerDay(preferences({ family: MAX_LEVEL }))).toBe(REDUCED_VISITS_PER_DAY);
  });
});

// Sección 17.1: "Cálculo de afinidad", aplicado a la selección de actividades.
describe('selectActivities', () => {
  const cultural = buildActivity({ id: 'a-cultural', profile: { culture: 3 }, pricePerPerson: 10 });
  const gastronomica = buildActivity({ id: 'b-gastro', profile: { gastronomy: 3 }, pricePerPerson: 10 });
  const irrelevante = buildActivity({ id: 'c-compras', profile: { shopping: 3 }, pricePerPerson: 10 });

  it('elige las actividades más afines a las preferencias del usuario', () => {
    const selection = selectActivities({
      candidates: [irrelevante, cultural, gastronomica],
      preferences: preferences({ culture: 3 }),
      days: 1,
      travelers: 1,
      maxTotalCost: 1000,
    });

    expect(selection.activities[0].id).toBe(cultural.id);
    expect(selection.activities).toHaveLength(MAX_VISITS_PER_DAY);
  });

  it('no propone más visitas de las que caben en el viaje', () => {
    const candidates = Array.from({ length: 40 }, (_, index) =>
      buildActivity({ id: `a-${index}`, profile: { culture: 3 }, pricePerPerson: 1 }),
    );

    const selection = selectActivities({
      candidates,
      preferences: preferences({ culture: 3 }),
      days: 3,
      travelers: 2,
      maxTotalCost: 1000,
    });

    expect(selection.activities).toHaveLength(MAX_VISITS_PER_DAY * 3);
  });

  // Sección 9.1: el coste es para todos los viajeros, no por persona.
  it('calcula el coste total para todos los viajeros', () => {
    const selection = selectActivities({
      candidates: [cultural],
      preferences: preferences({ culture: 3 }),
      days: 1,
      travelers: 4,
      maxTotalCost: 1000,
    });

    expect(selection.totalCost).toBe(40);
  });

  // Sección 9: el reparto orientativo acota el gasto en actividades.
  it('respeta el tope de gasto y sigue admitiendo las que sí caben', () => {
    const cara = buildActivity({ id: 'a-cara', profile: { culture: 3 }, pricePerPerson: 500 });
    const gratuita = buildActivity({ id: 'b-gratuita', profile: { culture: 3 }, pricePerPerson: 0 });

    const selection = selectActivities({
      candidates: [cara, gratuita],
      preferences: preferences({ culture: 3 }),
      days: 1,
      travelers: 1,
      maxTotalCost: 100,
    });

    expect(selection.activities.map((activity) => activity.id)).toEqual([gratuita.id]);
    expect(selection.totalCost).toBe(0);
  });

  it('trata una actividad sin precio como gratuita', () => {
    const selection = selectActivities({
      candidates: [buildActivity({ id: 'a-sin-precio', profile: { culture: 3 } })],
      preferences: preferences({ culture: 3 }),
      days: 1,
      travelers: 2,
      maxTotalCost: 0,
    });

    expect(selection.activities).toHaveLength(1);
    expect(selection.totalCost).toBe(0);
  });

  // Sección 6.2: sin nada sobre lo que medir, la afinidad es el valor neutro.
  it('devuelve afinidad neutra cuando no hay candidatos', () => {
    const selection = selectActivities({
      candidates: [],
      preferences: preferences({ culture: 3 }),
      days: 5,
      travelers: 2,
      maxTotalCost: 1000,
    });

    expect(selection.activities).toEqual([]);
    expect(selection.totalCost).toBe(0);
    expect(selection.preferenceScore).toBe(NEUTRAL_PREFERENCE_SCORE);
  });

  it('la misma entrada devuelve siempre la misma selección', () => {
    const input = {
      candidates: [irrelevante, cultural, gastronomica],
      preferences: preferences({ culture: 3, gastronomy: 2 }),
      days: 1,
      travelers: 2,
      maxTotalCost: 1000,
    };

    expect(selectActivities(input)).toEqual(selectActivities(input));
  });
});
