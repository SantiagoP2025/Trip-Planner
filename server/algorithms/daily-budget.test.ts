import { describe, expect, it } from 'vitest';
import { calculateDailyBudget, MEALS_PER_DAY } from './daily-budget.ts';

describe('calculateDailyBudget', () => {
  it('reparte la partida de comidas entre los días', () => {
    expect(calculateDailyBudget({ foodBudget: 500, travelers: 2, days: 5 })).toEqual({
      foodBudgetPerDay: 100,
      costPerPersonPerMeal: 25,
    });
  });

  // Sección 12.2: el elemento del itinerario lleva `costPerPerson`, no el total
  // del grupo. Confundirlos multiplicaría el precio por el número de viajeros en
  // la pantalla del usuario.
  it('el coste de la comida es por persona, no del grupo', () => {
    const cuatro = calculateDailyBudget({ foodBudget: 800, travelers: 4, days: 2 });
    const dos = calculateDailyBudget({ foodBudget: 800, travelers: 2, days: 2 });

    expect(cuatro.foodBudgetPerDay).toBe(dos.foodBudgetPerDay);
    expect(cuatro.costPerPersonPerMeal).toBe(dos.costPerPersonPerMeal / 2);
  });

  it('cuenta dos comidas al día', () => {
    const { foodBudgetPerDay, costPerPersonPerMeal } = calculateDailyBudget({
      foodBudget: 240,
      travelers: 1,
      days: 1,
    });

    expect(costPerPersonPerMeal * MEALS_PER_DAY).toBe(foodBudgetPerDay);
  });

  it('redondea a céntimos', () => {
    const { costPerPersonPerMeal } = calculateDailyBudget({
      foodBudget: 100,
      travelers: 3,
      days: 7,
    });

    expect(costPerPersonPerMeal).toBe(Math.round(costPerPersonPerMeal * 100) / 100);
  });

  // Sin esta defensa, un cero dividiendo devolvería `Infinity` y el usuario
  // vería "Infinity €" en la comida del martes.
  it('no divide por cero con datos degenerados', () => {
    const resultado = calculateDailyBudget({ foodBudget: 100, travelers: 0, days: 0 });

    expect(Number.isFinite(resultado.foodBudgetPerDay)).toBe(true);
    expect(Number.isFinite(resultado.costPerPersonPerMeal)).toBe(true);
  });

  it('con presupuesto cero no promete comidas gratis ni negativas', () => {
    expect(calculateDailyBudget({ foodBudget: 0, travelers: 2, days: 3 })).toEqual({
      foodBudgetPerDay: 0,
      costPerPersonPerMeal: 0,
    });
  });
});
