import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUDGET_POLICY,
  allocateBudget,
  allocateInitialBudget,
  calculateMinimumEmergencyReserve,
  calculateMinimumFoodBudget,
  type BudgetInput,
} from './allocate-budget.js';

const baseInput: BudgetInput = {
  budget: 2000,
  currency: 'EUR',
  travelers: 2,
  nights: 5,
  mainTransportCost: 400,
  accommodationCost: 600,
};

// Sección 17.1: "Distribución presupuestaria".
describe('allocateInitialBudget', () => {
  it('reparte el presupuesto según la tabla de la sección 9', () => {
    const shares = allocateInitialBudget(2000);
    expect(shares).toEqual({
      mainTransport: 600,
      accommodation: 700,
      food: 300,
      activities: 200,
      localTransport: 100,
      emergencyReserve: 100,
    });
  });

  it('el reparto inicial suma el presupuesto completo', () => {
    const shares = allocateInitialBudget(1234);
    const total = Object.values(shares).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(1234, 2);
  });
});

describe('allocateBudget', () => {
  it('cuadra el desglose con el presupuesto cuando el viaje es asumible', () => {
    const breakdown = allocateBudget(baseInput);

    expect(breakdown.totalTripCost).toBeLessThanOrEqual(baseInput.budget);
    expect(breakdown.totalTripCost).toBeCloseTo(
      breakdown.mainTransportCost +
        breakdown.accommodationCost +
        breakdown.foodBudget +
        breakdown.activityCost +
        breakdown.localTransportCost +
        breakdown.insuranceCost +
        breakdown.emergencyReserve,
      2,
    );
    expect(breakdown.currency).toBe('EUR');
  });

  // Sección 9.1: "Reservar primero un margen de seguridad".
  it('aparta la reserva de imprevistos antes de repartir nada', () => {
    const breakdown = allocateBudget(baseInput);
    expect(breakdown.emergencyReserve).toBe(calculateMinimumEmergencyReserve(baseInput.budget));
  });

  // Sección 9.1: "Reservar un mínimo diario para comidas".
  it('respeta el mínimo diario de comidas por viajero y día', () => {
    const breakdown = allocateBudget({ ...baseInput, budget: 1300 });
    expect(breakdown.foodBudget).toBeGreaterThanOrEqual(calculateMinimumFoodBudget(2, 5));
  });

  // Sección 9.1: "Incluir traslados aeropuerto-estación-hotel".
  it('incluye los traslados y el transporte local de todos los viajeros', () => {
    const breakdown = allocateBudget(baseInput);
    const expected =
      DEFAULT_BUDGET_POLICY.airportTransferPerTraveler * 2 * 2 +
      DEFAULT_BUDGET_POLICY.localTransportPerTravelerPerDay * 2 * 6;
    expect(breakdown.localTransportCost).toBe(expected);
  });

  it('cuenta el alojamiento de toda la estancia, no una noche suelta', () => {
    const cinco = allocateBudget(baseInput);
    const diez = allocateBudget({ ...baseInput, nights: 10, accommodationCost: 1200 });
    expect(diez.accommodationCost).toBe(1200);
    expect(diez.accommodationCost).toBeGreaterThan(cinco.accommodationCost);
  });

  // Sección 9.1: "Rechazar propuestas que oculten costes esenciales". El
  // desglose no recorta las comidas para cuadrar: enseña el coste real y deja
  // que la restricción dura de la sección 10.1 descarte la combinación.
  it('no oculta costes cuando el viaje no cabe en el presupuesto', () => {
    const breakdown = allocateBudget({ ...baseInput, budget: 500, mainTransportCost: 800 });

    expect(breakdown.totalTripCost).toBeGreaterThan(500);
    expect(breakdown.foodBudget).toBe(calculateMinimumFoodBudget(2, 5));
    expect(breakdown.mainTransportCost).toBe(800);
  });

  it('usa el coste real de las actividades cuando se le pasa', () => {
    const breakdown = allocateBudget({ ...baseInput, activityCost: 150 });
    expect(breakdown.activityCost).toBe(150);
  });

  it('es una función pura: la misma entrada da siempre el mismo desglose', () => {
    expect(allocateBudget(baseInput)).toEqual(allocateBudget(baseInput));
  });
});
