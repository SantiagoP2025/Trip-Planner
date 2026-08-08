import { describe, expect, it } from 'vitest';
import { buildAccommodation, buildFlight } from '../algorithms/test-fixtures.js';
import type { ActivityCandidate } from '../types/activity.js';
import type { PreferenceProfile } from '../types/common.js';
import type { BudgetBreakdown, TripScoreBreakdown } from '../types/trip.js';
import {
  buildProposalReasons,
  buildProposalWarnings,
  type ProposalExplanationInput,
} from './explain-proposal.js';

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

const BUDGET: BudgetBreakdown = {
  mainTransportCost: 400,
  accommodationCost: 600,
  foodBudget: 400,
  activityCost: 200,
  localTransportCost: 100,
  insuranceCost: 30,
  emergencyReserve: 70,
  totalTripCost: 1800,
  currency: 'EUR',
};

const SCORES: TripScoreBreakdown = {
  price: 80,
  accommodationQuality: 75,
  location: 70,
  transportComfort: 65,
  usableTime: 60,
  preferenceMatch: 85,
  total: 74,
};

const ACTIVIDAD_SIN_VERIFICAR: ActivityCandidate = {
  id: 'act-1',
  name: 'Museo',
  category: 'Museo',
  profile: NO_PREFERENCES,
  latitude: 38.72,
  longitude: -9.14,
  estimatedDurationMinutes: 90,
  verificationStatus: 'unverified',
};

function buildInput(overrides: Partial<ProposalExplanationInput> = {}): ProposalExplanationInput {
  return {
    type: 'recommended',
    budgetLimit: 2000,
    budget: BUDGET,
    flight: buildFlight({ id: 'f1', totalPrice: 400, baggageIncluded: true, refundable: true }),
    accommodation: buildAccommodation({
      id: 'h1',
      totalPrice: 600,
      rating: 4.6,
      reviewCount: 320,
      distanceToCenterKm: 0.9,
      freeCancellation: true,
    }),
    activities: [],
    scores: SCORES,
    usableHours: 100,
    worstUsableHours: 89,
    preferences: NO_PREFERENCES,
    ...overrides,
  };
}

// Sección 10.7: explicabilidad. Los ejemplos de la especificación son la
// referencia literal de estos textos.
describe('buildProposalReasons', () => {
  it('empieza por lo que prioriza el perfil de la sección 10.6', () => {
    expect(buildProposalReasons(buildInput({ type: 'economical' }))[0]).toBe(
      'Prioriza el precio manteniendo los mínimos de calidad.',
    );
    expect(buildProposalReasons(buildInput({ type: 'comfort' }))[0]).toBe(
      'Prioriza la calidad del alojamiento, su ubicación y la comodidad del transporte.',
    );
  });

  it('dice cuánto queda por debajo del presupuesto', () => {
    expect(buildProposalReasons(buildInput())).toContain('Está un 10 % por debajo del presupuesto.');
  });

  it('no presume de margen cuando el coste agota el presupuesto', () => {
    const reasons = buildProposalReasons(buildInput({ budgetLimit: 1800 }));

    expect(reasons.some((reason) => reason.includes('por debajo del presupuesto'))).toBe(false);
  });

  it('expresa en metros las distancias por debajo del kilómetro', () => {
    expect(buildProposalReasons(buildInput())).toContain(
      'El alojamiento se encuentra a 900 m del centro.',
    );
  });

  it('expresa en kilómetros con coma decimal las distancias mayores', () => {
    const input = buildInput({
      accommodation: buildAccommodation({ id: 'h1', totalPrice: 600, distanceToCenterKm: 1.4 }),
    });

    expect(buildProposalReasons(input)).toContain(
      'El alojamiento se encuentra a 1,4 km del centro.',
    );
  });

  // Un alojamiento céntrico llega redondeado a 0 km; "a 0 m del centro" parecería
  // un dato roto.
  it('describe como pleno centro un alojamiento a distancia cero', () => {
    const input = buildInput({
      accommodation: buildAccommodation({ id: 'h1', totalPrice: 600, distanceToCenterKm: 0 }),
    });

    expect(buildProposalReasons(input)).toContain('El alojamiento está en pleno centro.');
  });

  it('cuenta las horas de más en destino frente al peor vuelo del conjunto', () => {
    expect(buildProposalReasons(buildInput())).toContain(
      'Permite aprovechar 11 horas más en destino.',
    );
  });

  it('concuerda el singular de la hora', () => {
    const reasons = buildProposalReasons(buildInput({ usableHours: 90, worstUsableHours: 89 }));

    expect(reasons).toContain('Permite aprovechar 1 hora más en destino.');
  });

  it('omite el tiempo en destino cuando no aporta ni una hora', () => {
    const reasons = buildProposalReasons(buildInput({ usableHours: 89.5, worstUsableHours: 89 }));

    expect(reasons.some((reason) => reason.includes('en destino'))).toBe(false);
  });

  // Sección 6: la afinidad se nombra con las preferencias que marcó el usuario.
  it('nombra las dos preferencias más altas cuando la afinidad es alta', () => {
    const input = buildInput({
      preferences: { ...NO_PREFERENCES, culture: 3, gastronomy: 3, nature: 2 },
    });

    expect(buildProposalReasons(input)).toContain('La afinidad con la cultura y la gastronomía es alta.');
  });

  it('no habla de afinidad cuando la puntuación no es alta', () => {
    const input = buildInput({
      scores: { ...SCORES, preferenceMatch: 55 },
      preferences: { ...NO_PREFERENCES, culture: 3 },
    });

    expect(buildProposalReasons(input).some((reason) => reason.includes('afinidad'))).toBe(false);
  });

  it('incluye la valoración del alojamiento con su número de opiniones', () => {
    expect(buildProposalReasons(buildInput())).toContain(
      'El alojamiento tiene una valoración de 4,6 sobre 5 con 320 opiniones.',
    );
  });
});

// Sección 10.7 y 9.1: nada de costes ni condiciones ocultas.
describe('buildProposalWarnings', () => {
  it('avisa de que el equipaje facturado no está incluido', () => {
    const input = buildInput({
      flight: buildFlight({ id: 'f1', totalPrice: 400, baggageIncluded: false, refundable: true }),
    });

    expect(buildProposalWarnings(input)).toContain('El equipaje facturado no está incluido.');
  });

  it('avisa de las escalas concordando singular y plural', () => {
    const unaEscala = buildInput({
      flight: buildFlight({ id: 'f1', totalPrice: 400, stops: 1, refundable: true }),
    });
    const dosEscalas = buildInput({
      flight: buildFlight({ id: 'f1', totalPrice: 400, stops: 2, refundable: true }),
    });

    expect(buildProposalWarnings(unaEscala)).toContain('El vuelo de ida tiene una escala.');
    expect(buildProposalWarnings(dosEscalas)).toContain('El vuelo de ida tiene 2 escalas.');
  });

  it('avisa de que el alojamiento no tiene valoraciones', () => {
    const input = buildInput({
      accommodation: buildAccommodation({ id: 'h1', totalPrice: 600, freeCancellation: true }),
    });

    expect(buildProposalWarnings(input)).toContain('El alojamiento todavía no tiene valoraciones.');
  });

  it('avisa cuando el alojamiento está lejos del centro', () => {
    const input = buildInput({
      accommodation: buildAccommodation({ id: 'h1', totalPrice: 600, distanceToCenterKm: 7 }),
    });

    expect(buildProposalWarnings(input)).toContain('El alojamiento está a más de 5 km del centro.');
  });

  // Sección 11.5: los datos simulados nunca son 'verified'.
  it('marca como estimadas las actividades sin verificar', () => {
    const input = buildInput({ activities: [ACTIVIDAD_SIN_VERIFICAR] });

    expect(buildProposalWarnings(input)).toContain(
      'Los horarios y precios de las actividades son estimados y están pendientes de confirmar.',
    );
  });

  it('no marca nada cuando todas las actividades están verificadas', () => {
    const input = buildInput({
      activities: [{ ...ACTIVIDAD_SIN_VERIFICAR, verificationStatus: 'verified' }],
    });

    expect(buildProposalWarnings(input).some((warning) => warning.includes('estimados'))).toBe(false);
  });

  // Criterio de aceptación de la sección 17.3: el presupuesto nunca se supera sin
  // una advertencia explícita.
  it('avisa explícitamente si el coste supera el presupuesto', () => {
    const input = buildInput({ budgetLimit: 1500 });

    expect(buildProposalWarnings(input)).toContain(
      'El coste total estimado supera el presupuesto que has indicado.',
    );
  });

  it('no avisa de nada cuando la propuesta no tiene pegas', () => {
    expect(buildProposalWarnings(buildInput())).toEqual([]);
  });
});
