import { describe, expect, it } from 'vitest';
import type { OpeningPeriod } from '../types/common.ts';
import { checkOpeningHours, detectOverlaps } from './schedule-itinerary.ts';
import { buildItineraryItem } from './test-fixtures.ts';

// 2026-09-10 es jueves: día 4 de la semana.
const JUEVES = 4;

function horario(opensAt: string, closesAt: string, dayOfWeek = JUEVES): OpeningPeriod[] {
  return [{ dayOfWeek, opensAt, closesAt }];
}

// Sección 17.1: "Detección de solapamientos".
describe('detectOverlaps', () => {
  it('no encuentra solapamientos en un día bien planificado', () => {
    const items = [
      buildItineraryItem('a', '2026-09-10T10:00:00.000Z', '2026-09-10T11:30:00.000Z'),
      buildItineraryItem('b', '2026-09-10T12:00:00.000Z', '2026-09-10T13:00:00.000Z'),
      buildItineraryItem('c', '2026-09-10T13:30:00.000Z', '2026-09-10T15:00:00.000Z'),
    ];
    expect(detectOverlaps(items)).toEqual([]);
  });

  it('detecta dos actividades que se pisan', () => {
    const items = [
      buildItineraryItem('a', '2026-09-10T10:00:00.000Z', '2026-09-10T12:00:00.000Z'),
      buildItineraryItem('b', '2026-09-10T11:30:00.000Z', '2026-09-10T13:00:00.000Z'),
    ];
    expect(detectOverlaps(items)).toEqual([{ firstItemId: 'a', secondItemId: 'b' }]);
  });

  it('detecta solapamientos aunque la lista llegue desordenada', () => {
    const items = [
      buildItineraryItem('b', '2026-09-10T11:30:00.000Z', '2026-09-10T13:00:00.000Z'),
      buildItineraryItem('a', '2026-09-10T10:00:00.000Z', '2026-09-10T12:00:00.000Z'),
    ];
    expect(detectOverlaps(items)).toEqual([{ firstItemId: 'a', secondItemId: 'b' }]);
  });

  it('no considera solapamiento que una empiece justo cuando acaba la anterior', () => {
    const items = [
      buildItineraryItem('a', '2026-09-10T10:00:00.000Z', '2026-09-10T11:00:00.000Z'),
      buildItineraryItem('b', '2026-09-10T11:00:00.000Z', '2026-09-10T12:00:00.000Z'),
    ];
    expect(detectOverlaps(items)).toEqual([]);
  });

  it('no modifica la lista que recibe', () => {
    const items = [
      buildItineraryItem('b', '2026-09-10T11:30:00.000Z', '2026-09-10T13:00:00.000Z'),
      buildItineraryItem('a', '2026-09-10T10:00:00.000Z', '2026-09-10T12:00:00.000Z'),
    ];
    const copy = [...items];
    detectOverlaps(items);
    expect(items).toEqual(copy);
  });

  it('con cero o una actividad no hay nada que solapar', () => {
    expect(detectOverlaps([])).toEqual([]);
    expect(detectOverlaps([buildItineraryItem('a', '2026-09-10T10:00:00.000Z', '2026-09-10T11:00:00.000Z')])).toEqual([]);
  });
});

// Sección 17.1: "Validación de horarios".
describe('checkOpeningHours', () => {
  it('acepta una visita dentro del horario de apertura', () => {
    expect(
      checkOpeningHours(horario('09:00', '18:00'), '2026-09-10T10:00:00.000Z', '2026-09-10T11:30:00.000Z'),
    ).toBe(true);
  });

  it('rechaza una visita que empieza antes de abrir', () => {
    expect(
      checkOpeningHours(horario('09:00', '18:00'), '2026-09-10T08:00:00.000Z', '2026-09-10T09:30:00.000Z'),
    ).toBe(false);
  });

  it('rechaza una visita que acaba después de cerrar', () => {
    expect(
      checkOpeningHours(horario('09:00', '18:00'), '2026-09-10T17:30:00.000Z', '2026-09-10T19:00:00.000Z'),
    ).toBe(false);
  });

  it('rechaza una visita en un día en el que el lugar no abre', () => {
    // El horario solo cubre el lunes (día 1) y la visita es un jueves.
    expect(
      checkOpeningHours(horario('09:00', '18:00', 1), '2026-09-10T10:00:00.000Z', '2026-09-10T11:00:00.000Z'),
    ).toBe(false);
  });

  it('rechaza una visita que cruza la medianoche', () => {
    expect(
      checkOpeningHours(horario('09:00', '23:00'), '2026-09-10T22:00:00.000Z', '2026-09-11T01:00:00.000Z'),
    ).toBe(false);
  });

  it('rechaza un intervalo sin duración o invertido', () => {
    expect(
      checkOpeningHours(horario('09:00', '18:00'), '2026-09-10T11:00:00.000Z', '2026-09-10T11:00:00.000Z'),
    ).toBe(false);
    expect(
      checkOpeningHours(horario('09:00', '18:00'), '2026-09-10T12:00:00.000Z', '2026-09-10T11:00:00.000Z'),
    ).toBe(false);
  });

  // Sección 11.5: sin horario conocido no hay nada que incumplir; lo que cambia
  // es el estado de verificación de la actividad, no su validez horaria.
  it('acepta la visita cuando el lugar no declara horario', () => {
    expect(checkOpeningHours(undefined, '2026-09-10T10:00:00.000Z', '2026-09-10T11:00:00.000Z')).toBe(true);
    expect(checkOpeningHours([], '2026-09-10T10:00:00.000Z', '2026-09-10T11:00:00.000Z')).toBe(true);
  });
});
