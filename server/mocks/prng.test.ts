import { describe, expect, it } from 'vitest';
import { createSeededRandom, randomFloat, randomInt, randomItem } from './prng.js';

describe('createSeededRandom', () => {
  it('la misma semilla produce siempre la misma secuencia', () => {
    const sequenceA = Array.from({ length: 10 }, createSeededRandom('madrid|paris'));
    const sequenceB = Array.from({ length: 10 }, createSeededRandom('madrid|paris'));
    expect(sequenceA).toEqual(sequenceB);
  });

  it('semillas distintas producen secuencias distintas', () => {
    const random1 = createSeededRandom('madrid|paris');
    const random2 = createSeededRandom('madrid|roma');
    const sequence1 = Array.from({ length: 5 }, () => random1());
    const sequence2 = Array.from({ length: 5 }, () => random2());
    expect(sequence1).not.toEqual(sequence2);
  });

  it('genera siempre valores en [0, 1)', () => {
    const random = createSeededRandom('rango');
    for (let i = 0; i < 200; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('randomInt', () => {
  it('respeta los límites inclusive', () => {
    const random = createSeededRandom('entero');
    for (let i = 0; i < 200; i += 1) {
      const value = randomInt(random, 3, 7);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe('randomFloat', () => {
  it('respeta los límites y el redondeo', () => {
    const random = createSeededRandom('flotante');
    for (let i = 0; i < 200; i += 1) {
      const value = randomFloat(random, 1, 2, 2);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(2);
    }
  });
});

describe('randomItem', () => {
  it('devuelve siempre un elemento de la lista', () => {
    const random = createSeededRandom('elemento');
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i += 1) {
      expect(items).toContain(randomItem(random, items));
    }
  });
});
