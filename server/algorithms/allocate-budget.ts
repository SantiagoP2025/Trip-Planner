import type { Currency } from '../types/common.ts';
import type { BudgetBreakdown } from '../types/trip.ts';

// Sección 9: los porcentajes son un punto de partida, no un reparto rígido.
// Se usan para repartir lo que sobra después de pagar los costes reales.
export const INITIAL_BUDGET_SHARES = {
  mainTransport: 0.3,
  accommodation: 0.35,
  food: 0.15,
  activities: 0.1,
  localTransport: 0.05,
  emergencyReserve: 0.05,
} as const;

// Sección 9.1: mínimos y costes que no se pueden ocultar. Son parámetros y no
// constantes sueltas para que un destino caro o un cambio de política no
// obliguen a tocar el algoritmo.
export interface BudgetPolicy {
  // "Reservar primero un margen de seguridad": porcentaje del presupuesto que
  // se aparta antes de repartir nada.
  emergencyReserveRate: number;
  // "Reservar un mínimo diario para comidas", por viajero y día.
  minimumDailyFoodPerTraveler: number;
  // "Incluir traslados aeropuerto-estación-hotel": ida y vuelta, por viajero.
  airportTransferPerTraveler: number;
  // Transporte local del día a día, por viajero y día.
  localTransportPerTravelerPerDay: number;
  // Seguro de viaje, por viajero y día. La tabla de la sección 9 no le asigna
  // partida propia, pero la fórmula de totalTripCost sí lo incluye.
  insurancePerTravelerPerDay: number;
}

export const DEFAULT_BUDGET_POLICY: BudgetPolicy = {
  emergencyReserveRate: INITIAL_BUDGET_SHARES.emergencyReserve,
  minimumDailyFoodPerTraveler: 20,
  airportTransferPerTraveler: 12,
  localTransportPerTravelerPerDay: 4,
  insurancePerTravelerPerDay: 2,
};

// Proporción del sobrante discrecional que va a comidas frente a actividades.
// Sale de la tabla de la sección 9: 15 % de comidas frente a 10 % de actividades.
const FOOD_SHARE_OF_DISCRETIONARY =
  INITIAL_BUDGET_SHARES.food / (INITIAL_BUDGET_SHARES.food + INITIAL_BUDGET_SHARES.activities);

export interface BudgetInput {
  budget: number;
  currency: Currency;
  travelers: number;
  // Noches de estancia. Los días sobre el terreno son noches + 1.
  nights: number;
  // Coste del transporte principal para todos los viajeros (sección 9.1).
  mainTransportCost: number;
  // Coste del alojamiento para toda la estancia, no por noche (sección 9.1).
  accommodationCost: number;
  // Coste real de las actividades ya elegidas. Si no se pasa, se estima con el
  // sobrante disponible.
  activityCost?: number;
  policy?: BudgetPolicy;
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

// Sección 9: reparto orientativo inicial, antes de conocer precios reales.
// Sirve para acotar la búsqueda de ofertas, no para fijar el presupuesto final.
export function allocateInitialBudget(budget: number): Record<keyof typeof INITIAL_BUDGET_SHARES, number> {
  return {
    mainTransport: roundCurrency(budget * INITIAL_BUDGET_SHARES.mainTransport),
    accommodation: roundCurrency(budget * INITIAL_BUDGET_SHARES.accommodation),
    food: roundCurrency(budget * INITIAL_BUDGET_SHARES.food),
    activities: roundCurrency(budget * INITIAL_BUDGET_SHARES.activities),
    localTransport: roundCurrency(budget * INITIAL_BUDGET_SHARES.localTransport),
    emergencyReserve: roundCurrency(budget * INITIAL_BUDGET_SHARES.emergencyReserve),
  };
}

// Sección 9.1: presupuesto definitivo de una combinación concreta, ya con los
// precios reales del vuelo y del alojamiento.
//
// El desglose puede superar el presupuesto del usuario. Es intencionado: la
// especificación prohíbe ocultar costes esenciales, así que se devuelve el coste
// verdadero y es checkHardConstraints() (sección 10.1) quien descarta la
// combinación. Recortar aquí las comidas para que "cuadre" sería justo el
// comportamiento que la sección 9.1 prohíbe.
export function allocateBudget(input: BudgetInput): BudgetBreakdown {
  const policy = input.policy ?? DEFAULT_BUDGET_POLICY;
  const travelers = Math.max(1, input.travelers);
  const days = Math.max(1, input.nights) + 1;

  const emergencyReserve = roundCurrency(input.budget * policy.emergencyReserveRate);
  const mainTransportCost = roundCurrency(input.mainTransportCost);
  const accommodationCost = roundCurrency(input.accommodationCost);
  const localTransportCost = roundCurrency(
    policy.airportTransferPerTraveler * 2 * travelers +
      policy.localTransportPerTravelerPerDay * travelers * days,
  );
  const insuranceCost = roundCurrency(policy.insurancePerTravelerPerDay * travelers * days);

  const committed =
    emergencyReserve + mainTransportCost + accommodationCost + localTransportCost + insuranceCost;
  const discretionary = Math.max(0, input.budget - committed);

  const minimumFoodBudget = calculateMinimumFoodBudget(travelers, input.nights, policy);
  const foodBudget = roundCurrency(
    Math.max(minimumFoodBudget, discretionary * FOOD_SHARE_OF_DISCRETIONARY),
  );
  const activityCost = roundCurrency(
    input.activityCost ?? Math.max(0, discretionary - foodBudget),
  );

  const totalTripCost = roundCurrency(
    mainTransportCost +
      accommodationCost +
      foodBudget +
      activityCost +
      localTransportCost +
      insuranceCost +
      emergencyReserve,
  );

  return {
    mainTransportCost,
    accommodationCost,
    foodBudget,
    activityCost,
    localTransportCost,
    insuranceCost,
    emergencyReserve,
    totalTripCost,
    currency: input.currency,
  };
}

// Sección 9.1: "Reservar un mínimo diario para comidas". Se cuenta por día sobre
// el terreno, que son las noches más una.
export function calculateMinimumFoodBudget(
  travelers: number,
  nights: number,
  policy: BudgetPolicy = DEFAULT_BUDGET_POLICY,
): number {
  const days = Math.max(1, nights) + 1;
  return roundCurrency(policy.minimumDailyFoodPerTraveler * Math.max(1, travelers) * days);
}

// Sección 10.1: "Reserva de emergencia mínima".
export function calculateMinimumEmergencyReserve(
  budget: number,
  policy: BudgetPolicy = DEFAULT_BUDGET_POLICY,
): number {
  return roundCurrency(budget * policy.emergencyReserveRate);
}
