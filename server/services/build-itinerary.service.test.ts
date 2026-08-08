import { describe, expect, it } from 'vitest';
import {
  MAX_CONTINUOUS_MINUTES,
  MINIMUM_FREE_MINUTES,
  calculateBusyMinutes,
  calculateLongestContinuousMinutes,
  detectOverlaps,
} from '../algorithms/schedule-itinerary.js';
import { buildAccommodation, buildFlight } from '../algorithms/test-fixtures.js';
import { minutesBetween } from '../algorithms/time.js';
import { calculateTravelMatrix, type TravelMatrix } from '../algorithms/travel-matrix.js';
import type { ActivityCandidate } from '../types/activity.js';
import type { OpeningPeriod, PreferenceProfile } from '../types/common.js';
import type { ItineraryDay, ItineraryItem } from '../types/itinerary.js';
import type { BudgetBreakdown, TripRequest } from '../types/trip.js';
import {
  AIRPORT_CHECK_IN_MARGIN_MINUTES,
  buildItinerary,
  calculateDayWindows,
} from './build-itinerary.service.js';

// Sección 17.2: la prueba de integración del itinerario. Lo que se comprueba
// aquí son las reglas de la sección 12.1 sobre el resultado final, no cada
// algoritmo por separado: eso ya lo hacen sus propios tests.

const PREFERENCES: PreferenceProfile = {
  beach: 1,
  culture: 3,
  gastronomy: 2,
  nightlife: 0,
  nature: 1,
  shopping: 0,
  family: 0,
  relax: 0,
};

const BUDGET: BudgetBreakdown = {
  mainTransportCost: 500,
  accommodationCost: 800,
  foodBudget: 400,
  activityCost: 200,
  localTransportCost: 120,
  insuranceCost: 40,
  emergencyReserve: 150,
  totalTripCost: 2210,
  currency: 'EUR',
};

const ACCOMMODATION = buildAccommodation({ id: 'hotel', totalPrice: 800 });

// Llega el 10 a las 11:00 y vuelve el 14 a las 17:00: cinco días sobre el terreno.
const FLIGHT = buildFlight({
  id: 'vuelo',
  totalPrice: 500,
  departureTime: '2026-09-10T09:00:00.000Z',
  arrivalTime: '2026-09-10T11:00:00.000Z',
  returnDepartureTime: '2026-09-14T17:00:00.000Z',
  returnArrivalTime: '2026-09-14T19:00:00.000Z',
});

function request(overrides: Partial<TripRequest> = {}): TripRequest {
  return {
    origin: 'Madrid',
    destination: 'Lisboa',
    departureDate: '2026-09-10',
    returnDate: '2026-09-14',
    travelers: { adults: 2, children: 0 },
    budget: 3000,
    currency: 'EUR',
    travelStyle: 'balanced',
    preferences: PREFERENCES,
    ...overrides,
  };
}

function activity(id: string, overrides: Partial<ActivityCandidate> = {}): ActivityCandidate {
  return {
    id,
    name: `Lugar ${id}`,
    category: 'Museo',
    profile: PREFERENCES,
    latitude: 38.71,
    longitude: -9.14,
    estimatedDurationMinutes: 90,
    verificationStatus: 'unverified',
    ...overrides,
  };
}

// Doce actividades: más de las que caben en cinco días, para que el reparto y
// los topes de la sección 12.1 tengan algo que recortar.
const ACTIVITIES = Array.from({ length: 12 }, (_, index) => activity(`act-${index}`));

// Matriz completa entre todos los puntos, veinte minutos entre cualesquiera dos.
function fullMatrix(
  activities: readonly ActivityCandidate[] = ACTIVITIES,
  minutes = 20,
): TravelMatrix {
  const ids = [ACCOMMODATION.id, ...activities.map((item) => item.id)];
  return calculateTravelMatrix(
    ids.flatMap((originId) =>
      ids.map((destinationId) => ({
        originId,
        destinationId,
        distanceKm: 5,
        durationMinutes: minutes,
        mode: 'transit' as const,
      })),
    ),
  );
}

function build(overrides: Partial<Parameters<typeof buildItinerary>[0]> = {}) {
  return buildItinerary({
    request: request(),
    flight: FLIGHT,
    accommodation: ACCOMMODATION,
    activities: ACTIVITIES,
    matrix: fullMatrix(),
    budget: BUDGET,
    ...overrides,
  });
}

const itemsOf = (days: readonly ItineraryDay[]): ItineraryItem[] =>
  days.flatMap((day) => day.items);
const visitsOf = (day: ItineraryDay) => day.items.filter((item) => item.type === 'visit');

describe('calculateDayWindows', () => {
  it('devuelve un día por cada jornada sobre el terreno', () => {
    const windows = calculateDayWindows({
      departureDate: '2026-09-10',
      returnDate: '2026-09-14',
      flight: FLIGHT,
      preferences: PREFERENCES,
    });

    expect(windows.map((window) => window.date)).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
    ]);
  });

  // Sección 12.1: "Primer día adaptado a la hora real de llegada".
  it('el primer día no empieza antes de aterrizar', () => {
    const [primero] = calculateDayWindows({
      departureDate: '2026-09-10',
      returnDate: '2026-09-14',
      flight: FLIGHT,
      preferences: PREFERENCES,
    });

    expect(primero?.start).toBe('2026-09-10T11:00:00.000Z');
    // Y las visitas, solo después del desembarque, el traslado y la entrada al
    // alojamiento.
    expect(minutesBetween('2026-09-10T11:00:00.000Z', primero?.visitStart ?? '')).toBeGreaterThanOrEqual(105);
  });

  it('un vuelo que aterriza de noche no obliga a visitar nada de madrugada', () => {
    const nocturno = buildFlight({
      id: 'nocturno',
      totalPrice: 500,
      arrivalTime: '2026-09-10T23:30:00.000Z',
      returnDepartureTime: '2026-09-14T17:00:00.000Z',
    });

    const [primero] = calculateDayWindows({
      departureDate: '2026-09-10',
      returnDate: '2026-09-14',
      flight: nocturno,
      preferences: PREFERENCES,
    });

    // El día llega hasta la entrada al alojamiento, ya de madrugada, pero no hay
    // hueco para visitas.
    expect(minutesBetween(primero?.visitStart ?? '', primero?.visitEnd ?? '')).toBe(0);
  });

  // Sección 12.1: "Último día con margen suficiente para el traslado".
  it('el último día termina con margen para llegar al aeropuerto', () => {
    const windows = calculateDayWindows({
      departureDate: '2026-09-10',
      returnDate: '2026-09-14',
      flight: FLIGHT,
      preferences: PREFERENCES,
    });
    const ultimo = windows[windows.length - 1];

    expect(minutesBetween(ultimo?.end ?? '', '2026-09-14T17:00:00.000Z')).toBe(
      AIRPORT_CHECK_IN_MARGIN_MINUTES,
    );
    // Y las visitas acaban antes todavía, porque después toca el traslado.
    expect(ultimo && ultimo.visitEnd < ultimo.end).toBe(true);
  });

  // Sección 12.1: "Ajustar comienzo del día si la preferencia Vida nocturna es alta".
  it('empieza y termina más tarde con vida nocturna alta', () => {
    const normales = calculateDayWindows({
      departureDate: '2026-09-10',
      returnDate: '2026-09-14',
      flight: FLIGHT,
      preferences: PREFERENCES,
    });
    const noctambulos = calculateDayWindows({
      departureDate: '2026-09-10',
      returnDate: '2026-09-14',
      flight: FLIGHT,
      preferences: { ...PREFERENCES, nightlife: 3 },
    });

    expect(noctambulos[1]?.start.slice(11)).toBe('11:00:00.000Z');
    expect(normales[1]?.start.slice(11)).toBe('09:30:00.000Z');
    // Y no es un día más corto: también acaba más tarde.
    expect(noctambulos[1]?.end.slice(11)).toBe('23:30:00.000Z');
  });
});

describe('buildItinerary', () => {
  it('devuelve un día por jornada, en orden', () => {
    const { days } = build();

    expect(days.map((day) => day.date)).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
    ]);
  });

  // Prueba obligatoria de la fase: sin solapamientos.
  it('ningún día tiene dos cosas a la vez', () => {
    const { days } = build();

    for (const day of days) {
      expect(detectOverlaps(day.items), day.date).toEqual([]);
    }
  });

  // Prueba obligatoria de la fase: se respetan la hora de llegada y la de salida.
  it('nada se programa antes de aterrizar ni después de salir hacia el aeropuerto', () => {
    const { days } = build();
    const todos = itemsOf(days);

    for (const item of todos) {
      expect(item.startTime >= '2026-09-10T11:00:00.000Z', item.id).toBe(true);
      // La salida es a las 17:00 con dos horas de margen: nada puede terminar
      // después de las 15:00.
      expect(item.endTime <= '2026-09-14T15:00:00.000Z', item.id).toBe(true);
    }
  });

  it('el primer día abre con la llegada, el traslado y la entrada al alojamiento', () => {
    const { days } = build();

    expect(days[0]?.items.slice(0, 3).map((item) => item.type)).toEqual([
      'arrival',
      'transfer',
      'hotel',
    ]);
  });

  it('el último día cierra con el traslado al aeropuerto', () => {
    const { days } = build();
    const ultimo = days[days.length - 1];
    const cierre = ultimo?.items[ultimo.items.length - 1];

    expect(cierre?.type).toBe('transfer');
    expect(cierre?.title).toContain('aeropuerto');
  });

  // Prueba obligatoria de la fase: los límites de la sección 12.1.
  describe('límites de la sección 12.1', () => {
    it('máximo tres visitas principales al día', () => {
      const { days } = build();

      for (const day of days) {
        expect(visitsOf(day).length, day.date).toBeLessThanOrEqual(3);
      }
    });

    it('máximo dos visitas al día si el viaje es de descanso', () => {
      const { days } = build({ request: request({ preferences: { ...PREFERENCES, relax: 3 } }) });

      for (const day of days) {
        expect(visitsOf(day).length, day.date).toBeLessThanOrEqual(2);
      }
    });

    it('cada día lleva su comida y su cena', () => {
      const { days } = build();

      // El último día se va antes de comer, así que no le toca.
      for (const day of days.slice(0, -1)) {
        const comidas = day.items.filter((item) => item.type === 'meal');
        expect(comidas.length, day.date).toBeGreaterThan(0);
      }
    });

    it('al menos una hora libre en los días con visitas', () => {
      const { days } = build();
      const windows = calculateDayWindows({
        departureDate: '2026-09-10',
        returnDate: '2026-09-14',
        flight: FLIGHT,
        preferences: PREFERENCES,
      });

      for (const [index, day] of days.entries()) {
        if (visitsOf(day).length === 0) continue;

        const window = windows[index];
        const libres = minutesBetween(window?.start ?? '', window?.end ?? '') - calculateBusyMinutes(day.items);
        expect(libres, day.date).toBeGreaterThanOrEqual(MINIMUM_FREE_MINUTES);
      }
    });

    it('nunca más de tres horas encadenadas sin pausa', () => {
      const { days } = build();

      for (const day of days) {
        expect(calculateLongestContinuousMinutes(day.items), day.date).toBeLessThanOrEqual(
          MAX_CONTINUOUS_MINUTES,
        );
      }
    });

    it('ninguna visita cae fuera del horario de apertura', () => {
      const conHorario = ACTIVITIES.map((item, index) =>
        activity(item.id, {
          openingHours: Array.from({ length: 7 }, (_, dayOfWeek): OpeningPeriod => ({
            dayOfWeek,
            opensAt: '10:00',
            closesAt: index % 2 === 0 ? '18:00' : '14:00',
          })),
        }),
      );

      const { days } = build({ activities: conHorario, matrix: fullMatrix(conHorario) });

      for (const item of itemsOf(days)) {
        if (item.type !== 'visit') continue;
        expect(item.startTime.slice(11, 16) >= '10:00', item.id).toBe(true);
        expect(item.endTime.slice(11, 16) <= '18:00', item.id).toBe(true);
      }
    });
  });

  // El requisito explícito de la fase: cada parada lleva las coordenadas del
  // proveedor de lugares, no unas inventadas.
  it('cada visita lleva las coordenadas que dio el proveedor', () => {
    const conCoordenadas = ACTIVITIES.map((item, index) =>
      activity(item.id, { latitude: 38.7 + index / 100, longitude: -9.1 - index / 100 }),
    );
    const porId = new Map(conCoordenadas.map((item) => [item.id, item]));

    const { days } = build({ activities: conCoordenadas, matrix: fullMatrix(conCoordenadas) });

    const visitas = itemsOf(days).filter((item) => item.type === 'visit');
    expect(visitas.length).toBeGreaterThan(0);

    for (const visita of visitas) {
      const origen = porId.get(visita.placeId ?? '');
      expect(visita.latitude, visita.id).toBe(origen?.latitude);
      expect(visita.longitude, visita.id).toBe(origen?.longitude);
    }
  });

  it('la entrada al alojamiento lleva las coordenadas del alojamiento', () => {
    const { days } = build();
    const entrada = days[0]?.items.find((item) => item.type === 'hotel');

    expect(entrada?.latitude).toBe(ACCOMMODATION.latitude);
    expect(entrada?.longitude).toBe(ACCOMMODATION.longitude);
  });

  // Sin tiempos de desplazamiento no hay itinerario: inventarlos daría un
  // horario que no se puede cumplir y que parece calculado.
  it('sin matriz de desplazamientos no programa ninguna visita', () => {
    const { days, warnings } = build({ matrix: calculateTravelMatrix([]) });

    expect(itemsOf(days).filter((item) => item.type === 'visit')).toEqual([]);
    expect(warnings.some((warning) => warning.includes('no encajan'))).toBe(true);
  });

  it('avisa de que las comidas no son reservas', () => {
    const { warnings } = build();

    expect(warnings.some((warning) => warning.includes('sin restaurante reservado'))).toBe(true);
  });

  it('un viaje válido no deja reglas incumplidas', () => {
    const { violations } = build();

    expect(violations).toEqual([]);
  });

  it('reparte las actividades entre los días en vez de amontonarlas', () => {
    const { days } = build();
    const conVisitas = days.filter((day) => visitsOf(day).length > 0);

    expect(conVisitas.length).toBeGreaterThan(1);
  });

  it('sin actividades sigue habiendo un itinerario con llegada, comidas y vuelta', () => {
    const { days } = build({ activities: [], matrix: calculateTravelMatrix([]) });

    expect(days).toHaveLength(5);
    expect(itemsOf(days).some((item) => item.type === 'arrival')).toBe(true);
    expect(itemsOf(days).some((item) => item.type === 'meal')).toBe(true);
  });
});
