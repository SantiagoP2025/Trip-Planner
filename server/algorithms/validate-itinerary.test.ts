import { describe, expect, it } from 'vitest';
import type { OpeningPeriod } from '../types/common.ts';
import type { ItineraryDay, ItineraryItem } from '../types/itinerary.ts';
import {
  repairInvalidItinerary,
  validateItinerary,
  type ItineraryDayWindow,
  type ItineraryValidationInput,
} from './validate-itinerary.ts';

const DATE = '2026-09-10';

const WINDOW: ItineraryDayWindow = {
  date: DATE,
  start: `${DATE}T09:30:00.000Z`,
  end: `${DATE}T21:30:00.000Z`,
};

function visita(id: string, start: string, minutos: number, placeId = id): ItineraryItem {
  return {
    id,
    startTime: `${DATE}T${start}:00.000Z`,
    endTime: new Date(new Date(`${DATE}T${start}:00.000Z`).getTime() + minutos * 60_000).toISOString(),
    type: 'visit',
    title: `Visita ${id}`,
    placeId,
    durationMinutes: minutos,
    verificationStatus: 'unverified',
  };
}

function libre(id: string, start: string, minutos: number): ItineraryItem {
  return { ...visita(id, start, minutos), type: 'free_time', title: 'Pausa', placeId: undefined };
}

function entrada(
  items: ItineraryItem[],
  overrides: Partial<ItineraryValidationInput> = {},
): ItineraryValidationInput {
  const days: ItineraryDay[] = [{ date: DATE, items }];
  return {
    days,
    windowsByDate: new Map([[DATE, WINDOW]]),
    maxVisitsPerDay: 3,
    openingHoursByPlaceId: new Map<string, readonly OpeningPeriod[] | undefined>(),
    ...overrides,
  };
}

describe('validateItinerary', () => {
  it('no encuentra nada que objetar a un día correcto', () => {
    expect(validateItinerary(entrada([visita('a', '10:00', 90), visita('b', '12:00', 60)]))).toEqual(
      [],
    );
  });

  // Sección 10.1: un solapamiento invalida la propuesta entera.
  it('detecta dos actividades a la misma hora', () => {
    const violations = validateItinerary(
      entrada([visita('a', '10:00', 120), visita('b', '11:00', 60)]),
    );

    expect(violations.map((violation) => violation.code)).toContain('overlap');
  });

  it('detecta una actividad fuera de las horas del día', () => {
    const violations = validateItinerary(entrada([visita('a', '07:00', 60)]));

    expect(violations.map((violation) => violation.code)).toContain('outside_window');
  });

  // Sección 12.1: "No programar visitas fuera de horarios de apertura".
  it('detecta una visita fuera del horario de apertura', () => {
    const violations = validateItinerary(
      entrada([visita('a', '10:00', 60)], {
        openingHoursByPlaceId: new Map([['a', [{ dayOfWeek: 4, opensAt: '14:00', closesAt: '18:00' }]]]),
      }),
    );

    expect(violations.map((violation) => violation.code)).toContain('outside_opening_hours');
  });

  // Sección 12.1: "Máximo tres visitas principales al día".
  it('detecta un día con más visitas de las permitidas', () => {
    const violations = validateItinerary(
      entrada([
        visita('a', '10:00', 30),
        visita('b', '11:00', 30),
        visita('c', '12:00', 30),
        visita('d', '13:00', 30),
      ]),
    );

    expect(violations.map((violation) => violation.code)).toContain('too_many_visits');
  });

  it('respeta un tope de visitas más bajo cuando el viaje es de descanso', () => {
    const violations = validateItinerary(
      entrada([visita('a', '10:00', 30), visita('b', '11:00', 30), visita('c', '12:00', 30)], {
        maxVisitsPerDay: 2,
      }),
    );

    expect(violations.map((violation) => violation.code)).toContain('too_many_visits');
  });

  // Sección 12.1: "Al menos 60 minutos de tiempo libre diario".
  it('detecta un día sin tiempo libre suficiente', () => {
    const violations = validateItinerary(entrada([visita('a', '09:30', 700)]));

    expect(violations.map((violation) => violation.code)).toContain('not_enough_free_time');
  });

  // Un día sin visitas es libre entero: la regla no tiene nada que comprobar.
  it('no exige tiempo libre a un día sin visitas', () => {
    expect(validateItinerary(entrada([]))).toEqual([]);
  });

  // Sección 12.1: "No más de tres horas continuadas sin pausa".
  it('detecta más de tres horas encadenadas', () => {
    const violations = validateItinerary(
      entrada([visita('a', '10:00', 150), visita('b', '12:40', 120)]),
    );

    expect(violations.map((violation) => violation.code)).toContain('too_long_without_break');
  });

  it('una pausa por medio rompe la cadena', () => {
    const violations = validateItinerary(
      entrada([visita('a', '10:00', 150), libre('p', '12:30', 30), visita('b', '13:10', 120)]),
    );

    expect(violations.map((violation) => violation.code)).not.toContain('too_long_without_break');
  });

  // No vamos a echar a nadie de un museo a mitad: una visita larga no se puede
  // partir con una pausa, así que exigirlo solo serviría para borrarla.
  it('no castiga una única visita larguísima que no se puede partir', () => {
    const violations = validateItinerary(entrada([visita('a', '10:00', 240)]));

    expect(violations.map((violation) => violation.code)).not.toContain('too_long_without_break');
  });
});

describe('repairInvalidItinerary', () => {
  it('deja intacto un día que ya cumple', () => {
    const input = entrada([visita('a', '10:00', 90)]);
    const result = repairInvalidItinerary(input);

    expect(result.days[0]?.items).toHaveLength(1);
    expect(result.removedItemIds).toEqual([]);
    expect(result.violations).toEqual([]);
  });

  it('quita la visita que se sale del horario de apertura y conserva el resto', () => {
    const result = repairInvalidItinerary(
      entrada([visita('a', '10:00', 60), visita('b', '12:00', 60)], {
        openingHoursByPlaceId: new Map([['b', [{ dayOfWeek: 4, opensAt: '18:00', closesAt: '20:00' }]]]),
      }),
    );

    expect(result.removedItemIds).toEqual(['b']);
    expect(result.days[0]?.items.map((item) => item.id)).toEqual(['a']);
    expect(result.violations).toEqual([]);
  });

  it('quita visitas por el final hasta que el día cabe', () => {
    const result = repairInvalidItinerary(
      entrada([
        visita('a', '10:00', 30),
        visita('b', '11:00', 30),
        visita('c', '12:00', 30),
        visita('d', '13:00', 30),
      ]),
    );

    expect(result.removedItemIds).toEqual(['d']);
    expect(result.violations).toEqual([]);
  });

  // Mover horas para que cuadren produce un horario que se valida solo a sí
  // mismo. Quitar produce un día más corto y verdadero.
  it('no cambia las horas de lo que deja', () => {
    const result = repairInvalidItinerary(
      entrada([visita('a', '10:00', 30), visita('b', '11:00', 30), visita('c', '12:00', 30), visita('d', '13:00', 30)]),
    );

    expect(result.days[0]?.items[0]?.startTime).toBe(`${DATE}T10:00:00.000Z`);
  });

  // El bucle tiene que terminar: cada vuelta quita una visita, y sin visitas
  // ninguna de las reglas de intensidad puede fallar.
  it('termina aunque haya que quitarlo todo', () => {
    const result = repairInvalidItinerary(entrada([visita('a', '09:30', 700)]));

    expect(result.days[0]?.items).toEqual([]);
    expect(result.violations).toEqual([]);
  });

  // Un elemento que no es visita —el traslado al aeropuerto— no se puede quitar,
  // así que si algo así falla se dice en vez de esconderlo.
  it('informa de lo que no ha podido arreglar', () => {
    const traslado: ItineraryItem = {
      ...visita('traslado', '07:00', 45),
      type: 'transfer',
      placeId: undefined,
    };

    const result = repairInvalidItinerary(entrada([traslado]));

    expect(result.violations.map((violation) => violation.code)).toContain('outside_window');
  });

  it('no toca las comidas al reparar', () => {
    const comida: ItineraryItem = {
      ...visita('comida', '13:30', 60),
      type: 'meal',
      placeId: undefined,
    };

    const result = repairInvalidItinerary(
      entrada([visita('a', '09:30', 400), comida, visita('b', '16:20', 200)]),
    );

    expect(result.days[0]?.items.some((item) => item.type === 'meal')).toBe(true);
  });
});
