import { describe, expect, it } from 'vitest';
import type { RouteMatrixEntry } from '../types/provider.js';
import { calculateTravelMatrix, DEFAULT_TRANSPORT_MODE } from './travel-matrix.js';

function entry(
  originId: string,
  destinationId: string,
  durationMinutes: number,
): RouteMatrixEntry {
  return {
    originId,
    destinationId,
    distanceKm: durationMinutes / 3,
    durationMinutes,
    mode: 'transit',
  };
}

describe('calculateTravelMatrix', () => {
  it('devuelve el tiempo de un par que el proveedor sí calculó', () => {
    const matrix = calculateTravelMatrix([entry('a', 'b', 25)]);

    expect(matrix.minutesBetween('a', 'b')).toBe(25);
  });

  it('conserva la entrada completa, con distancia y modo', () => {
    const matrix = calculateTravelMatrix([entry('a', 'b', 30)]);

    expect(matrix.entry('a', 'b')).toEqual({
      originId: 'a',
      destinationId: 'b',
      distanceKm: 10,
      durationMinutes: 30,
      mode: 'transit',
    });
  });

  it('no supone simetría: la vuelta puede no estar', () => {
    const matrix = calculateTravelMatrix([entry('a', 'b', 25)]);

    expect(matrix.minutesBetween('b', 'a')).toBeUndefined();
  });

  it('ir de un punto a sí mismo no cuesta nada, aunque no esté en la matriz', () => {
    const matrix = calculateTravelMatrix([]);

    expect(matrix.minutesBetween('a', 'a')).toBe(0);
  });

  // Regla 12 del plan y fallo B.1 de la auditoría: lo que no se sabe no se
  // rellena. Un tiempo de viaje inventado produce un horario que no se puede
  // cumplir y que además parece calculado.
  it('devuelve undefined, y no un valor por defecto, para un par desconocido', () => {
    const matrix = calculateTravelMatrix([entry('a', 'b', 25)]);

    expect(matrix.minutesBetween('a', 'z')).toBeUndefined();
    expect(matrix.minutesBetween('z', 'a')).toBeUndefined();
  });

  it('la última entrada de un par repetido es la que vale', () => {
    const matrix = calculateTravelMatrix([entry('a', 'b', 25), entry('a', 'b', 40)]);

    expect(matrix.minutesBetween('a', 'b')).toBe(40);
    expect(matrix.size).toBe(1);
  });

  it('cuenta los pares distintos que conoce', () => {
    const matrix = calculateTravelMatrix([
      entry('a', 'b', 10),
      entry('b', 'a', 12),
      entry('a', 'c', 20),
    ]);

    expect(matrix.size).toBe(3);
  });

  it('no confunde pares con identificadores parecidos', () => {
    const matrix = calculateTravelMatrix([entry('a', 'b-c', 10), entry('a-b', 'c', 99)]);

    expect(matrix.minutesBetween('a', 'b-c')).toBe(10);
    expect(matrix.minutesBetween('a-b', 'c')).toBe(99);
  });

  it('el modo por defecto del itinerario es el transporte público', () => {
    expect(DEFAULT_TRANSPORT_MODE).toBe('transit');
  });
});
