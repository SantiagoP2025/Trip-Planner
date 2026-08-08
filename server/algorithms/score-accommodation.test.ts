import { describe, expect, it } from 'vitest';
import {
  buildAccommodationScoringContext,
  calculateAccommodationQualityScore,
  calculateGroupFitScore,
  calculateRatingScore,
  scoreAccommodation,
} from './score-accommodation.js';
import { buildAccommodation } from './test-fixtures.js';

const barato = buildAccommodation({ id: 'barato', totalPrice: 300, distanceToCenterKm: 6, rating: 3, reviewCount: 500, capacity: 2 });
const medio = buildAccommodation({ id: 'medio', totalPrice: 600, distanceToCenterKm: 3, rating: 4, reviewCount: 500, capacity: 2 });
const caro = buildAccommodation({ id: 'caro', totalPrice: 900, distanceToCenterKm: 0, rating: 5, reviewCount: 500, capacity: 2 });
const offers = [barato, medio, caro];
const context = buildAccommodationScoringContext(offers);

// Sección 11.4: puntuación de alojamiento.
describe('scoreAccommodation', () => {
  it('da la mejor puntuación de precio al más barato del conjunto', () => {
    expect(scoreAccommodation(barato, context, 2).price).toBe(100);
    expect(scoreAccommodation(caro, context, 2).price).toBe(0);
  });

  it('da la mejor puntuación de ubicación al más céntrico', () => {
    expect(scoreAccommodation(caro, context, 2).location).toBe(100);
    expect(scoreAccommodation(barato, context, 2).location).toBe(0);
    expect(scoreAccommodation(medio, context, 2).location).toBe(50);
  });

  it('premia desayuno y cancelación gratuita', () => {
    const conExtras = buildAccommodation({
      id: 'extras',
      totalPrice: 600,
      distanceToCenterKm: 3,
      breakfastIncluded: true,
      freeCancellation: true,
      capacity: 2,
    });
    expect(scoreAccommodation(conExtras, context, 2).services).toBe(100);
    expect(scoreAccommodation(conExtras, context, 2).conditions).toBe(100);
    expect(scoreAccommodation(medio, context, 2).services).toBe(0);
  });

  it('mantiene la puntuación total en la escala 0-100', () => {
    for (const offer of offers) {
      const total = scoreAccommodation(offer, context, 2).total;
      expect(total).toBeGreaterThanOrEqual(0);
      expect(total).toBeLessThanOrEqual(100);
    }
  });

  // Un dato ausente no puede premiar: se le asigna la peor distancia del conjunto.
  it('no premia al alojamiento que no declara distancia al centro', () => {
    const sinDistancia = buildAccommodation({ id: 'sin', totalPrice: 600, capacity: 2 });
    expect(scoreAccommodation(sinDistancia, context, 2).location).toBe(0);
  });
});

describe('calculateRatingScore', () => {
  it('convierte la nota sobre 5 a la escala 0-100', () => {
    expect(calculateRatingScore(buildAccommodation({ id: 'a', totalPrice: 1, rating: 5, reviewCount: 500 }))).toBe(100);
    expect(calculateRatingScore(buildAccommodation({ id: 'a', totalPrice: 1, rating: 2.5, reviewCount: 500 }))).toBe(50);
  });

  it('devuelve el valor neutro cuando no hay valoración', () => {
    expect(calculateRatingScore(buildAccommodation({ id: 'a', totalPrice: 1 }))).toBe(50);
  });

  it('acerca al valor neutro las notas con pocas opiniones', () => {
    const pocas = calculateRatingScore(buildAccommodation({ id: 'a', totalPrice: 1, rating: 5, reviewCount: 10 }));
    const muchas = calculateRatingScore(buildAccommodation({ id: 'b', totalPrice: 1, rating: 5, reviewCount: 2000 }));
    expect(pocas).toBeLessThan(muchas);
    expect(pocas).toBeGreaterThan(50);
  });
});

// Sección 11.4: "Adecuación al grupo".
describe('calculateGroupFitScore', () => {
  it('puntúa 0 si no caben todos los viajeros', () => {
    expect(calculateGroupFitScore(buildAccommodation({ id: 'a', totalPrice: 1, capacity: 2 }), 4)).toBe(0);
  });

  it('puntúa al máximo el alojamiento del tamaño justo', () => {
    expect(calculateGroupFitScore(buildAccommodation({ id: 'a', totalPrice: 1, capacity: 4 }), 4)).toBe(100);
  });

  it('penaliza levemente el alojamiento sobredimensionado', () => {
    expect(calculateGroupFitScore(buildAccommodation({ id: 'a', totalPrice: 1, capacity: 6 }), 4)).toBe(80);
  });
});

// Sección 10.2, criterio "Calidad del alojamiento".
describe('calculateAccommodationQualityScore', () => {
  it('ignora precio y ubicación, que la sección 10.2 puntúa como criterios propios', () => {
    const breakdown = scoreAccommodation(medio, context, 2);
    const mismoHotelCaroYLejos = { ...breakdown, price: 0, location: 0 };

    expect(calculateAccommodationQualityScore(mismoHotelCaroYLejos)).toBe(
      calculateAccommodationQualityScore(breakdown),
    );
  });

  it('devuelve 100 cuando el alojamiento es perfecto en todo lo demás', () => {
    const perfecto = { price: 0, location: 0, rating: 100, conditions: 100, groupFit: 100, services: 100, total: 0 };

    expect(calculateAccommodationQualityScore(perfecto)).toBe(100);
  });

  it('devuelve 0 cuando el alojamiento es el peor en todo lo demás', () => {
    const pesimo = { price: 100, location: 100, rating: 0, conditions: 0, groupFit: 0, services: 0, total: 0 };

    expect(calculateAccommodationQualityScore(pesimo)).toBe(0);
  });

  it('prefiere el mejor valorado con desayuno y cancelación gratuita', () => {
    const completo = buildAccommodation({
      id: 'completo',
      totalPrice: 600,
      rating: 5,
      reviewCount: 500,
      capacity: 2,
      breakfastIncluded: true,
      freeCancellation: true,
    });

    expect(calculateAccommodationQualityScore(scoreAccommodation(completo, context, 2))).toBeGreaterThan(
      calculateAccommodationQualityScore(scoreAccommodation(barato, context, 2)),
    );
  });
});
