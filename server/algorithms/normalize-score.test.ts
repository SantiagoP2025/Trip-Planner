import { describe, expect, it } from 'vitest';
import {
  calculateRange,
  clampScore,
  normalizeHigherIsBetter,
  normalizeLowerIsBetter,
  roundScore,
} from './normalize-score.js';

// Sección 17.1: "Normalización de puntuaciones".
describe('normalizeLowerIsBetter', () => {
  it('da 100 al mínimo y 0 al máximo', () => {
    expect(normalizeLowerIsBetter(100, 100, 500)).toBe(100);
    expect(normalizeLowerIsBetter(500, 100, 500)).toBe(0);
  });

  it('interpola linealmente los valores intermedios', () => {
    expect(normalizeLowerIsBetter(300, 100, 500)).toBe(50);
    expect(normalizeLowerIsBetter(200, 100, 500)).toBe(75);
  });

  it('devuelve 100 cuando todo el conjunto vale lo mismo', () => {
    expect(normalizeLowerIsBetter(250, 250, 250)).toBe(100);
  });

  it('mantiene la escala 0-100 con valores fuera del rango', () => {
    expect(normalizeLowerIsBetter(600, 100, 500)).toBe(0);
    expect(normalizeLowerIsBetter(50, 100, 500)).toBe(100);
  });
});

describe('normalizeHigherIsBetter', () => {
  it('invierte el sentido de la normalización', () => {
    expect(normalizeHigherIsBetter(500, 100, 500)).toBe(100);
    expect(normalizeHigherIsBetter(100, 100, 500)).toBe(0);
    expect(normalizeHigherIsBetter(300, 100, 500)).toBe(50);
  });

  it('devuelve 100 cuando todo el conjunto vale lo mismo', () => {
    expect(normalizeHigherIsBetter(4, 4, 4)).toBe(100);
  });
});

describe('calculateRange', () => {
  it('calcula mínimo y máximo en un solo recorrido', () => {
    expect(calculateRange([{ v: 3 }, { v: 9 }, { v: -1 }], (item) => item.v)).toEqual({ min: -1, max: 9 });
  });

  it('ignora los valores no finitos', () => {
    expect(calculateRange([1, Number.NaN, 7], (value) => value)).toEqual({ min: 1, max: 7 });
  });

  it('devuelve un rango degenerado con el conjunto vacío', () => {
    expect(calculateRange([], (value: number) => value)).toEqual({ min: 0, max: 0 });
  });

  // Regla 7 de CLAUDE.md: Math.min(...array) revienta con arrays grandes; esto no.
  it('soporta arrays de tamaño no acotado sin desbordar la pila', () => {
    const values = Array.from({ length: 300_000 }, (_, index) => index);
    expect(calculateRange(values, (value) => value)).toEqual({ min: 0, max: 299_999 });
  });
});

describe('clampScore y roundScore', () => {
  it('recorta a la escala 0-100', () => {
    expect(clampScore(-10)).toBe(0);
    expect(clampScore(120)).toBe(100);
    expect(clampScore(Number.NaN)).toBe(0);
  });

  it('redondea a dos decimales', () => {
    expect(roundScore(66.66666)).toBe(66.67);
  });
});
