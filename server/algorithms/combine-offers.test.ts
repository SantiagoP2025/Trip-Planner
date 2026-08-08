import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOP_ACCOMMODATIONS,
  DEFAULT_TOP_FLIGHTS,
  combineOffers,
  takeTopN,
  type ScoredOffer,
} from './combine-offers.js';
import { buildAccommodation, buildFlight } from './test-fixtures.js';

function scoredFlights(count: number): ScoredOffer<ReturnType<typeof buildFlight>>[] {
  return Array.from({ length: count }, (_, index) => ({
    offer: buildFlight({ id: `f${index}`, totalPrice: 100 + index }),
    score: 100 - index,
  }));
}

function scoredAccommodations(count: number): ScoredOffer<ReturnType<typeof buildAccommodation>>[] {
  return Array.from({ length: count }, (_, index) => ({
    offer: buildAccommodation({ id: `h${index}`, totalPrice: 300 + index }),
    score: 100 - index,
  }));
}

// Sección 17.1: "Combinación de ofertas".
describe('takeTopN', () => {
  it('devuelve los mejores por puntuación individual', () => {
    const top = takeTopN(scoredFlights(10), 3, (offer) => offer.id);
    expect(top.map((entry) => entry.offer.id)).toEqual(['f0', 'f1', 'f2']);
  });

  it('no modifica el array de entrada', () => {
    const flights = scoredFlights(5);
    const copy = [...flights];
    takeTopN(flights, 2, (offer) => offer.id);
    expect(flights).toEqual(copy);
  });

  it('desempata de forma estable', () => {
    const empatados = scoredFlights(3).map((entry) => ({ ...entry, score: 50 }));
    expect(takeTopN(empatados, 2, (offer) => offer.id).map((entry) => entry.offer.id)).toEqual(['f0', 'f1']);
  });

  it('devuelve una lista vacía si no se pide ninguno', () => {
    expect(takeTopN(scoredFlights(5), 0, (offer) => offer.id)).toEqual([]);
  });
});

describe('combineOffers', () => {
  // Regla 8 de CLAUDE.md: recortar antes de combinar. 200 x 300 son 60.000
  // combinaciones para enseñar tres; con el recorte son 625.
  it('recorta a los 25 mejores de cada lado antes del producto cartesiano', () => {
    const pairs = combineOffers(scoredFlights(200), scoredAccommodations(300));

    expect(pairs).toHaveLength(DEFAULT_TOP_FLIGHTS * DEFAULT_TOP_ACCOMMODATIONS);
    expect(pairs).toHaveLength(625);
  });

  it('solo combina las ofertas mejor puntuadas', () => {
    const pairs = combineOffers(scoredFlights(200), scoredAccommodations(300));
    const flightIds = new Set(pairs.map((pair) => pair.flight.id));

    expect(flightIds.size).toBe(DEFAULT_TOP_FLIGHTS);
    expect(flightIds.has('f0')).toBe(true);
    expect(flightIds.has('f199')).toBe(false);
  });

  it('con pocas ofertas combina todas', () => {
    const pairs = combineOffers(scoredFlights(3), scoredAccommodations(4));
    expect(pairs).toHaveLength(12);
  });

  it('admite topes distintos de los de por defecto', () => {
    const pairs = combineOffers(scoredFlights(50), scoredAccommodations(50), {
      maxFlights: 5,
      maxAccommodations: 4,
    });
    expect(pairs).toHaveLength(20);
  });

  it('devuelve una lista vacía si falta un lado de la combinación', () => {
    expect(combineOffers(scoredFlights(10), [])).toEqual([]);
    expect(combineOffers([], scoredAccommodations(10))).toEqual([]);
  });
});
