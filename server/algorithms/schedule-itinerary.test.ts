import { describe, expect, it } from 'vitest';
import type { ActivityCandidate } from '../types/activity.ts';
import type { OpeningPeriod } from '../types/common.ts';
import type { ItineraryItem } from '../types/itinerary.ts';
import {
  calculateBusyMinutes,
  calculateLongestContinuousMinutes,
  calculateNextStartTime,
  checkOpeningHours,
  detectOverlaps,
  earliestStartWithinOpeningHours,
  MAX_CONTINUOUS_MINUTES,
  MINIMUM_FREE_MINUTES,
  scheduleDayActivities,
} from './schedule-itinerary.ts';
import { buildItineraryItem } from './test-fixtures.ts';
import { calculateTravelMatrix, type TravelMatrix } from './travel-matrix.ts';

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

// ---------------------------------------------------------------------------
// Asignación de horas (fase 9)
// ---------------------------------------------------------------------------

const HOTEL = 'hotel';

function actividad(overrides: Partial<ActivityCandidate> = {}): ActivityCandidate {
  return {
    id: 'act-1',
    name: 'Museo de la ciudad',
    category: 'Museo',
    profile: {
      beach: 0,
      culture: 3,
      gastronomy: 0,
      nightlife: 0,
      nature: 0,
      shopping: 0,
      family: 0,
      relax: 0,
    },
    latitude: 38.71,
    longitude: -9.14,
    estimatedDurationMinutes: 90,
    verificationStatus: 'unverified',
    ...overrides,
  };
}

// Matriz de juguete: todo a `minutos` del resto, salvo lo que se diga.
function matrizPlana(minutos: number, ids: string[]): TravelMatrix {
  const puntos = [HOTEL, ...ids];
  return calculateTravelMatrix(
    puntos.flatMap((originId) =>
      puntos.map((destinationId) => ({
        originId,
        destinationId,
        distanceKm: 1,
        durationMinutes: minutos,
        mode: 'transit' as const,
      })),
    ),
  );
}

function programar(
  activities: ActivityCandidate[],
  options: { start?: string; end?: string; travelMinutes?: number } = {},
) {
  const ids = activities.map((activity) => activity.id);
  return scheduleDayActivities({
    date: '2026-09-10',
    window: {
      start: options.start ?? '2026-09-10T09:30:00.000Z',
      end: options.end ?? '2026-09-10T21:30:00.000Z',
    },
    activities,
    originId: HOTEL,
    matrix: matrizPlana(options.travelMinutes ?? 15, ids),
    costPerPersonPerMeal: 12,
    mealTimes: { lunch: '13:30', dinner: '20:00' },
  });
}

const visitas = (items: readonly ItineraryItem[]) => items.filter((item) => item.type === 'visit');
const comidas = (items: readonly ItineraryItem[]) => items.filter((item) => item.type === 'meal');

describe('calculateNextStartTime', () => {
  it('suma el desplazamiento y el margen', () => {
    expect(calculateNextStartTime('2026-09-10T10:00:00.000Z', 20)).toBe(
      '2026-09-10T10:30:00.000Z',
    );
  });

  // Sección 12.1: "Margen de 10 a 20 minutos entre actividades". Un 0 desde quien
  // llama produciría un día encadenado sin respiro.
  it('nunca deja menos margen del mínimo ni más del máximo', () => {
    expect(calculateNextStartTime('2026-09-10T10:00:00.000Z', 0, 0)).toBe(
      '2026-09-10T10:10:00.000Z',
    );
    expect(calculateNextStartTime('2026-09-10T10:00:00.000Z', 0, 90)).toBe(
      '2026-09-10T10:20:00.000Z',
    );
  });

  it('trata un desplazamiento negativo como cero', () => {
    expect(calculateNextStartTime('2026-09-10T10:00:00.000Z', -30)).toBe(
      '2026-09-10T10:10:00.000Z',
    );
  });
});

describe('earliestStartWithinOpeningHours', () => {
  // La diferencia entre "no cabe" y "cabe más tarde": una visita propuesta a las
  // 8:40 en un museo que abre a las 9:00 solo necesita esperar veinte minutos.
  it('retrasa el comienzo hasta la hora de apertura', () => {
    expect(
      earliestStartWithinOpeningHours('2026-09-10T08:40:00.000Z', 60, horario('09:00', '18:00')),
    ).toBe('2026-09-10T09:00:00.000Z');
  });

  it('no toca nada si ya está dentro del horario', () => {
    expect(
      earliestStartWithinOpeningHours('2026-09-10T10:00:00.000Z', 60, horario('09:00', '18:00')),
    ).toBe('2026-09-10T10:00:00.000Z');
  });

  it('devuelve undefined cuando la visita ya no cabe antes de cerrar', () => {
    expect(
      earliestStartWithinOpeningHours('2026-09-10T17:30:00.000Z', 60, horario('09:00', '18:00')),
    ).toBeUndefined();
  });

  it('devuelve undefined si el lugar no abre ese día', () => {
    expect(
      earliestStartWithinOpeningHours('2026-09-10T10:00:00.000Z', 60, horario('09:00', '18:00', 1)),
    ).toBeUndefined();
  });

  it('sin horario conocido no hay nada que incumplir', () => {
    expect(earliestStartWithinOpeningHours('2026-09-10T06:00:00.000Z', 60, undefined)).toBe(
      '2026-09-10T06:00:00.000Z',
    );
  });
});

describe('scheduleDayActivities', () => {
  // Sección 10.1: un solapamiento invalida la propuesta entera.
  it('no produce solapamientos', () => {
    const { items } = programar([
      actividad({ id: 'a', estimatedDurationMinutes: 90 }),
      actividad({ id: 'b', estimatedDurationMinutes: 60 }),
      actividad({ id: 'c', estimatedDurationMinutes: 120 }),
    ]);

    expect(detectOverlaps(items)).toEqual([]);
  });

  // Sección 12.1: "Añadir comida y cena automáticamente".
  it('añade comida y cena', () => {
    const { items } = programar([actividad({ id: 'a' })]);

    expect(comidas(items).map((item) => item.title)).toEqual(['Comida', 'Cena']);
  });

  it('pone precio por persona a las comidas, no el total del grupo', () => {
    const { items } = programar([actividad({ id: 'a' })]);

    for (const comida of comidas(items)) {
      expect(comida.costPerPerson).toBe(12);
    }
  });

  // Fallo B.1 de la auditoría: nada de datos inventados que parezcan reales. Sin
  // proveedor de restaurantes, la comida no lleva ni nombre ni coordenadas.
  it('no inventa restaurante ni coordenadas para las comidas', () => {
    const { items } = programar([actividad({ id: 'a' })]);

    for (const comida of comidas(items)) {
      expect(comida.latitude).toBeUndefined();
      expect(comida.longitude).toBeUndefined();
      expect(comida.verificationStatus).toBe('unverified');
      expect(comida.notes?.length).toBeGreaterThan(0);
    }
  });

  // El requisito explícito de la fase: las coordenadas vienen del proveedor de
  // lugares y no se tocan.
  it('copia las coordenadas del proveedor sin modificarlas', () => {
    const { items } = programar([actividad({ id: 'a', latitude: 38.7139, longitude: -9.1394 })]);
    const [visita] = visitas(items);

    expect(visita?.latitude).toBe(38.7139);
    expect(visita?.longitude).toBe(-9.1394);
    expect(visita?.placeId).toBe('a');
  });

  it('anota cuánto se tarda en llegar y en qué', () => {
    const { items } = programar([actividad({ id: 'a' })], { travelMinutes: 25 });
    const [visita] = visitas(items);

    expect(visita?.travelMinutesFromPrevious).toBe(25);
    expect(visita?.transportMode).toBe('transit');
  });

  // Sección 11.5 y 12.1: "Marcar datos no verificados".
  it('conserva el estado de verificación del candidato', () => {
    const { items } = programar([actividad({ id: 'a', verificationStatus: 'partial' })]);

    expect(visitas(items)[0]?.verificationStatus).toBe('partial');
  });

  // Sección 12.1: "No programar visitas fuera de horarios de apertura".
  it('espera a que el lugar abra en vez de descartarlo', () => {
    const { items } = programar([
      actividad({ id: 'a', openingHours: horario('11:00', '18:00'), estimatedDurationMinutes: 60 }),
    ]);

    expect(visitas(items)[0]?.startTime).toBe('2026-09-10T11:00:00.000Z');
  });

  it('descarta la visita si ese día no abre', () => {
    const { items, skippedActivityIds } = programar([
      actividad({ id: 'a', openingHours: horario('09:00', '18:00', 1) }),
    ]);

    expect(visitas(items)).toEqual([]);
    expect(skippedActivityIds).toEqual(['a']);
  });

  // Sección 12.1: "No más de tres horas continuadas sin pausa".
  it('mete una pausa antes de encadenar más de tres horas', () => {
    const { items } = programar([
      actividad({ id: 'a', estimatedDurationMinutes: 150 }),
      actividad({ id: 'b', estimatedDurationMinutes: 120 }),
    ]);

    expect(calculateLongestContinuousMinutes(items)).toBeLessThanOrEqual(MAX_CONTINUOUS_MINUTES);
    expect(items.some((item) => item.title === 'Pausa')).toBe(true);
  });

  // Una pausa que no interrumpe nada es ruido en la agenda.
  it('no deja una pausa suelta si la visita siguiente se descarta', () => {
    const { items } = programar([
      actividad({ id: 'a', estimatedDurationMinutes: 170 }),
      actividad({ id: 'b', estimatedDurationMinutes: 120, openingHours: horario('09:00', '10:00') }),
    ]);

    expect(visitas(items)).toHaveLength(1);
    expect(items.some((item) => item.title === 'Pausa')).toBe(false);
  });

  // Reservar el hueco antes de encajar una visita, y no comprobarlo después, es
  // lo que evita que la reparación tenga que deshacer el día.
  it('deja el tiempo libre mínimo sin que haga falta reparar', () => {
    const { items } = programar([
      actividad({ id: 'a', estimatedDurationMinutes: 240 }),
      actividad({ id: 'b', estimatedDurationMinutes: 240 }),
      actividad({ id: 'c', estimatedDurationMinutes: 240 }),
    ]);

    const ventana = 12 * 60;
    expect(ventana - calculateBusyMinutes(items)).toBeGreaterThanOrEqual(MINIMUM_FREE_MINUTES);
  });

  it('nada termina después del final del día', () => {
    const { items } = programar(
      [
        actividad({ id: 'a', estimatedDurationMinutes: 120 }),
        actividad({ id: 'b', estimatedDurationMinutes: 120 }),
      ],
      { end: '2026-09-10T15:00:00.000Z' },
    );

    for (const item of items) {
      expect(item.endTime <= '2026-09-10T15:00:00.000Z').toBe(true);
    }
  });

  // Una visita larga que no cabe no debe impedir que entre la corta que viene
  // detrás.
  it('sigue probando después de descartar una visita que no cabe', () => {
    const { items, skippedActivityIds } = programar([
      actividad({ id: 'larga', estimatedDurationMinutes: 600 }),
      actividad({ id: 'corta', estimatedDurationMinutes: 45 }),
    ]);

    expect(skippedActivityIds).toEqual(['larga']);
    expect(visitas(items).map((item) => item.placeId)).toEqual(['corta']);
  });

  // Un tiempo de desplazamiento inventado produce un horario que no se puede
  // cumplir y que además parece calculado.
  it('descarta la visita cuando no se sabe cuánto se tarda en llegar', () => {
    const { items, skippedActivityIds } = scheduleDayActivities({
      date: '2026-09-10',
      window: { start: '2026-09-10T09:30:00.000Z', end: '2026-09-10T21:30:00.000Z' },
      activities: [actividad({ id: 'a' })],
      originId: HOTEL,
      matrix: calculateTravelMatrix([]),
      costPerPersonPerMeal: 12,
      mealTimes: { lunch: '13:30', dinner: '20:00' },
    });

    expect(visitas(items)).toEqual([]);
    expect(skippedActivityIds).toEqual(['a']);
  });

  it('un día sin horas disponibles no programa nada', () => {
    const { items, skippedActivityIds } = programar([actividad({ id: 'a' })], {
      start: '2026-09-10T09:30:00.000Z',
      end: '2026-09-10T09:30:00.000Z',
    });

    expect(items).toEqual([]);
    expect(skippedActivityIds).toEqual(['a']);
  });

  it('un día sin actividades sigue teniendo comida y cena', () => {
    const { items } = programar([]);

    expect(comidas(items)).toHaveLength(2);
  });
});
