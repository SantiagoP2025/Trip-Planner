import { describe, expect, it } from 'vitest';
import {
  buildFlightScoringContext,
  calculateConditionsScore,
  calculateScheduleScore,
  calculateTransportComfortScore,
  calculateUsableHours,
  scoreFlight,
  scoreUsableTime,
} from './score-flight.ts';
import { buildFlight } from './test-fixtures.ts';

const barato = buildFlight({ id: 'barato', totalPrice: 100, totalDurationMinutes: 120, stops: 0 });
const medio = buildFlight({ id: 'medio', totalPrice: 300, totalDurationMinutes: 240, stops: 1 });
const caro = buildFlight({ id: 'caro', totalPrice: 500, totalDurationMinutes: 360, stops: 2 });
const offers = [barato, medio, caro];
const context = buildFlightScoringContext(offers);

// Sección 11.2: puntuación de vuelo.
describe('scoreFlight', () => {
  it('da la mejor puntuación de precio al más barato del conjunto', () => {
    expect(scoreFlight(barato, context).price).toBe(100);
    expect(scoreFlight(caro, context).price).toBe(0);
    expect(scoreFlight(medio, context).price).toBe(50);
  });

  it('penaliza duración y escalas', () => {
    expect(scoreFlight(barato, context).duration).toBe(100);
    expect(scoreFlight(caro, context).duration).toBe(0);
    expect(scoreFlight(barato, context).stops).toBe(100);
    expect(scoreFlight(caro, context).stops).toBe(0);
  });

  it('mantiene la puntuación total en la escala 0-100', () => {
    for (const offer of offers) {
      const score = scoreFlight(offer, context).total;
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('el vuelo mejor en todo puntúa por encima del peor en todo', () => {
    expect(scoreFlight(barato, context).total).toBeGreaterThan(scoreFlight(caro, context).total);
  });

  it('da 100 a todos cuando el conjunto no permite comparar', () => {
    const unico = buildFlightScoringContext([barato]);
    expect(scoreFlight(barato, unico).price).toBe(100);
  });
});

describe('calculateConditionsScore', () => {
  it('premia equipaje incluido y billete reembolsable', () => {
    expect(
      calculateConditionsScore(buildFlight({ id: 'x', totalPrice: 100, baggageIncluded: true, refundable: true })),
    ).toBe(100);
    expect(
      calculateConditionsScore(buildFlight({ id: 'x', totalPrice: 100, baggageIncluded: false, refundable: false })),
    ).toBe(0);
    expect(
      calculateConditionsScore(buildFlight({ id: 'x', totalPrice: 100, baggageIncluded: true, refundable: false })),
    ).toBe(60);
  });
});

describe('calculateScheduleScore', () => {
  it('penaliza las salidas de madrugada frente a las de media mañana', () => {
    const manana = buildFlight({ id: 'm', totalPrice: 100, departureTime: '2026-09-10T09:00:00.000Z', arrivalTime: '2026-09-10T11:00:00.000Z' });
    const madrugada = buildFlight({ id: 'n', totalPrice: 100, departureTime: '2026-09-10T04:00:00.000Z', arrivalTime: '2026-09-10T06:00:00.000Z' });
    expect(calculateScheduleScore(manana)).toBeGreaterThan(calculateScheduleScore(madrugada));
  });
});

// Sección 10.2: "Aprovechamiento del tiempo".
describe('calculateUsableHours', () => {
  it('cuenta las horas entre aterrizar y despegar de vuelta', () => {
    expect(calculateUsableHours(barato)).toBe(174);
  });

  it('devuelve 0 si el vuelo de vuelta sale antes de llegar', () => {
    const imposible = buildFlight({
      id: 'imposible',
      totalPrice: 100,
      arrivalTime: '2026-09-10T11:00:00.000Z',
      returnDepartureTime: '2026-09-10T09:00:00.000Z',
      returnArrivalTime: '2026-09-10T10:00:00.000Z',
    });
    expect(calculateUsableHours(imposible)).toBe(0);
  });

  it('normaliza el tiempo aprovechable contra el conjunto', () => {
    const corto = buildFlight({
      id: 'corto',
      totalPrice: 100,
      arrivalTime: '2026-09-10T20:00:00.000Z',
      returnDepartureTime: '2026-09-12T08:00:00.000Z',
    });
    const conCorto = buildFlightScoringContext([barato, corto]);
    expect(scoreUsableTime(barato, conCorto)).toBe(100);
    expect(scoreUsableTime(corto, conCorto)).toBe(0);
  });
});

// Sección 10.2, criterio "Comodidad del transporte".
describe('calculateTransportComfortScore', () => {
  it('ignora el precio, que la sección 10.2 puntúa como criterio propio', () => {
    const breakdown = scoreFlight(barato, context);
    const mismoVueloMasCaro = { ...breakdown, price: 0 };

    expect(calculateTransportComfortScore(mismoVueloMasCaro)).toBe(
      calculateTransportComfortScore(breakdown),
    );
  });

  it('devuelve 100 cuando el vuelo es perfecto en todo lo demás', () => {
    const perfecto = { price: 0, duration: 100, stops: 100, schedule: 100, conditions: 100, total: 0 };

    expect(calculateTransportComfortScore(perfecto)).toBe(100);
  });

  it('devuelve 0 cuando el vuelo es el peor en todo lo demás', () => {
    const pesimo = { price: 100, duration: 0, stops: 0, schedule: 0, conditions: 0, total: 0 };

    expect(calculateTransportComfortScore(pesimo)).toBe(0);
  });

  it('prefiere el vuelo directo y corto al de dos escalas', () => {
    expect(calculateTransportComfortScore(scoreFlight(barato, context))).toBeGreaterThan(
      calculateTransportComfortScore(scoreFlight(caro, context)),
    );
  });
});
