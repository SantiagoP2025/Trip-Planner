import { roundCurrency } from './allocate-budget.ts';

// Sección 12.3: `calculateDailyBudget()`. Reparte entre los días lo que la
// sección 9 asignó al viaje entero.
//
// No decide nada nuevo sobre el presupuesto: `allocateBudget()` ya fijó cuánto
// hay para comidas y para actividades. Esto solo traduce ese total a lo que
// cuesta un día, que es la unidad en la que el usuario lee el itinerario.

// Sección 12.1: "Añadir comida y cena automáticamente". Dos comidas al día es lo
// que planifica el itinerario; el desayuno se da por incluido o resuelto en el
// alojamiento, y no se le asigna hueco ni coste inventado.
export const MEALS_PER_DAY = 2;

export interface DailyBudgetInput {
  // Partida de comidas del viaje entero, para todos los viajeros (sección 9.1).
  foodBudget: number;
  travelers: number;
  // Días sobre el terreno: noches + 1, la misma convención que allocateBudget().
  days: number;
}

export interface DailyBudget {
  foodBudgetPerDay: number;
  // Lo que la sección 12.2 pide por elemento: `costPerPerson`, no el total.
  costPerPersonPerMeal: number;
}

export function calculateDailyBudget(input: DailyBudgetInput): DailyBudget {
  const days = Math.max(1, Math.floor(input.days));
  const travelers = Math.max(1, Math.floor(input.travelers));

  const foodBudgetPerDay = roundCurrency(input.foodBudget / days);

  return {
    foodBudgetPerDay,
    costPerPersonPerMeal: roundCurrency(foodBudgetPerDay / travelers / MEALS_PER_DAY),
  };
}
