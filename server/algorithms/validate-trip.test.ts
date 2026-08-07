import { describe, expect, it } from 'vitest';
import type { TripScoreBreakdown } from '../types/trip.ts';
import {
  allocateBudget,
  calculateMinimumEmergencyReserve,
  calculateMinimumFoodBudget,
} from './allocate-budget.ts';
import { MINIMUM_SCORES, checkHardConstraints, meetsMinimumScores, type HardConstraintInput } from './validate-trip.ts';
import { buildAccommodation, buildFlight, buildItineraryItem } from './test-fixtures.ts';

const flight = buildFlight({ id: 'f1', totalPrice: 400 });
const accommodation = buildAccommodation({ id: 'h1', totalPrice: 600, capacity: 4 });

function baseInput(overrides: Partial<HardConstraintInput> = {}): HardConstraintInput {
  const budgetLimit = 2000;
  return {
    budgetLimit,
    travelers: 2,
    departureDate: '2026-09-10',
    returnDate: '2026-09-17',
    flight,
    accommodation,
    budget: allocateBudget({
      budget: budgetLimit,
      currency: 'EUR',
      travelers: 2,
      nights: 7,
      mainTransportCost: flight.totalPrice,
      accommodationCost: accommodation.totalPrice,
    }),
    minimumFoodBudget: calculateMinimumFoodBudget(2, 7),
    minimumEmergencyReserve: calculateMinimumEmergencyReserve(budgetLimit),
    ...overrides,
  };
}

// Sección 10.1: restricciones duras.
describe('checkHardConstraints', () => {
  it('acepta una combinación que cumple todas las restricciones', () => {
    const result = checkHardConstraints(baseInput());
    expect(result).toEqual({ passed: true, failures: [] });
  });

  it('rechaza la combinación que se sale del presupuesto', () => {
    const budgetLimit = 800;
    const result = checkHardConstraints(
      baseInput({
        budgetLimit,
        budget: allocateBudget({
          budget: budgetLimit,
          currency: 'EUR',
          travelers: 2,
          nights: 7,
          mainTransportCost: flight.totalPrice,
          accommodationCost: accommodation.totalPrice,
        }),
        minimumEmergencyReserve: calculateMinimumEmergencyReserve(budgetLimit),
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toContain('El coste total supera el presupuesto indicado.');
  });

  it('rechaza el alojamiento sin capacidad para todo el grupo', () => {
    const result = checkHardConstraints({
      ...baseInput(),
      accommodation: buildAccommodation({ id: 'h2', totalPrice: 600, capacity: 1 }),
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toContain('El alojamiento no tiene capacidad para todos los viajeros.');
  });

  it('rechaza el vuelo que no sale en las fechas pedidas', () => {
    const result = checkHardConstraints(baseInput({ departureDate: '2026-09-11' }));

    expect(result.passed).toBe(false);
    expect(result.failures).toContain('El vuelo de ida no sale en la fecha solicitada.');
  });

  it('rechaza el vuelo que no incluye el equipaje facturado exigido', () => {
    const result = checkHardConstraints(
      baseInput({
        flight: buildFlight({ id: 'f2', totalPrice: 400, baggageIncluded: false }),
        checkedBaggageRequired: true,
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toContain('El vuelo no incluye el equipaje facturado que necesitas.');
  });

  it('rechaza la propuesta sin el mínimo de comidas', () => {
    const budget = allocateBudget({
      budget: 2000,
      currency: 'EUR',
      travelers: 2,
      nights: 7,
      mainTransportCost: flight.totalPrice,
      accommodationCost: accommodation.totalPrice,
    });
    const result = checkHardConstraints(
      baseInput({ budget: { ...budget, foodBudget: 10 }, minimumFoodBudget: 320 }),
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toContain('No queda presupuesto suficiente para las comidas del viaje.');
  });

  it('rechaza el itinerario con actividades solapadas', () => {
    const result = checkHardConstraints(
      baseInput({
        itinerary: [
          buildItineraryItem('a', '2026-09-11T10:00:00.000Z', '2026-09-11T12:00:00.000Z'),
          buildItineraryItem('b', '2026-09-11T11:00:00.000Z', '2026-09-11T13:00:00.000Z'),
        ],
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toContain('El itinerario tiene actividades solapadas.');
  });

  it('rechaza una visita programada fuera del horario de apertura', () => {
    const result = checkHardConstraints(
      baseInput({
        scheduledActivities: [
          {
            item: buildItineraryItem('a', '2026-09-11T07:00:00.000Z', '2026-09-11T08:00:00.000Z'),
            openingHours: [{ dayOfWeek: 5, opensAt: '10:00', closesAt: '18:00' }],
          },
        ],
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toContain('Alguna visita queda fuera del horario de apertura.');
  });

  it('devuelve todos los motivos, no solo el primero', () => {
    const result = checkHardConstraints({
      ...baseInput({ departureDate: '2026-09-11' }),
      accommodation: buildAccommodation({ id: 'h2', totalPrice: 600, capacity: 1 }),
    });

    expect(result.failures.length).toBeGreaterThan(1);
  });
});

// Sección 10.4: umbrales mínimos.
describe('meetsMinimumScores', () => {
  function scores(overrides: Partial<TripScoreBreakdown> = {}): TripScoreBreakdown {
    return {
      price: 90,
      accommodationQuality: 70,
      location: 60,
      transportComfort: 60,
      usableTime: 60,
      preferenceMatch: 70,
      total: 75,
      ...overrides,
    };
  }

  it('acepta la propuesta que supera todos los umbrales', () => {
    expect(meetsMinimumScores(scores())).toEqual({ passed: true, failures: [] });
  });

  it('descarta la propuesta con una deficiencia grave aunque la media sea alta', () => {
    const result = meetsMinimumScores(
      scores({ location: MINIMUM_SCORES.location - 1, price: 100, total: 88 }),
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toContain('La ubicación del alojamiento está por debajo del mínimo aceptable.');
  });

  it('comprueba los cuatro criterios esenciales', () => {
    const result = meetsMinimumScores(
      scores({ location: 0, accommodationQuality: 0, transportComfort: 0, preferenceMatch: 0 }),
    );

    expect(result.failures).toHaveLength(4);
  });

  it('acepta exactamente el valor del umbral', () => {
    expect(meetsMinimumScores(scores({ accommodationQuality: MINIMUM_SCORES.accommodationQuality })).passed).toBe(true);
  });
});
