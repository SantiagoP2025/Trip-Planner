import type { OpeningPeriod } from '../types/common.js';
import type { ItineraryDay, ItineraryItem } from '../types/itinerary.js';
import {
  calculateBusyMinutes,
  calculateLongestContinuousMinutes,
  checkOpeningHours,
  detectOverlaps,
  MAX_CONTINUOUS_MINUTES,
  MINIMUM_FREE_MINUTES,
} from './schedule-itinerary.js';
import { isBefore, minutesBetween } from './time.js';

// Sección 12.3: `validateItinerary()` y `repairInvalidItinerary()`.
//
// Van juntas a propósito. El planificador ya intenta cumplir la sección 12.1
// mientras construye el día, así que lo que llegue aquí incumpliendo algo es o
// un caso raro —un horario de apertura imposible, un día que se queda sin
// margen— o un error nuestro. En los dos casos la respuesta es la misma: quitar
// visitas hasta que el día se pueda cumplir, y decir cuántas se han quitado.
//
// Lo que no hace la reparación es mover horas para que cuadren. Correr una
// visita treinta minutos porque el validador se queja produce un horario que se
// valida solo a sí mismo; quitarla produce un día más corto y verdadero.

export type ItineraryViolationCode =
  | 'overlap'
  | 'outside_window'
  | 'outside_opening_hours'
  | 'too_many_visits'
  | 'not_enough_free_time'
  | 'too_long_without_break';

export interface ItineraryViolation {
  date: string;
  code: ItineraryViolationCode;
  // En español: acaba en las advertencias de la propuesta (sección 10.7).
  message: string;
  itemId?: string;
}

export interface ItineraryDayWindow {
  date: string;
  start: string;
  end: string;
}

export interface ItineraryValidationInput {
  days: readonly ItineraryDay[];
  windowsByDate: ReadonlyMap<string, ItineraryDayWindow>;
  maxVisitsPerDay: number;
  // Horarios de apertura por identificador de lugar, tal como los devolvió el
  // proveedor. No se guardan dentro del elemento del itinerario porque la
  // sección 12.2 no los incluye y duplicarlos ahí los dejaría desincronizados.
  openingHoursByPlaceId: ReadonlyMap<string, readonly OpeningPeriod[] | undefined>;
}

function isVisit(item: ItineraryItem): boolean {
  return item.type === 'visit';
}

function validateDay(
  day: ItineraryDay,
  input: ItineraryValidationInput,
): ItineraryViolation[] {
  const violations: ItineraryViolation[] = [];
  const window = input.windowsByDate.get(day.date);

  for (const overlap of detectOverlaps(day.items)) {
    violations.push({
      date: day.date,
      code: 'overlap',
      message: 'Hay dos actividades a la misma hora.',
      itemId: overlap.secondItemId,
    });
  }

  if (window) {
    for (const item of day.items) {
      if (isBefore(item.startTime, window.start) || isBefore(window.end, item.endTime)) {
        violations.push({
          date: day.date,
          code: 'outside_window',
          message: 'Hay una actividad fuera de las horas disponibles del día.',
          itemId: item.id,
        });
      }
    }
  }

  // Sección 12.1: "No programar visitas fuera de horarios de apertura".
  for (const item of day.items) {
    if (!isVisit(item) || item.placeId === undefined) continue;

    const openingHours = input.openingHoursByPlaceId.get(item.placeId);
    if (!checkOpeningHours(openingHours, item.startTime, item.endTime)) {
      violations.push({
        date: day.date,
        code: 'outside_opening_hours',
        message: 'Hay una visita fuera del horario de apertura.',
        itemId: item.id,
      });
    }
  }

  // Sección 12.1: "Máximo tres visitas principales al día", menos si el viaje es
  // de descanso o en familia.
  const visits = day.items.filter(isVisit);
  if (visits.length > input.maxVisitsPerDay) {
    violations.push({
      date: day.date,
      code: 'too_many_visits',
      message: `El día tiene más de ${input.maxVisitsPerDay} visitas principales.`,
    });
  }

  // Sección 12.1: "Al menos 60 minutos de tiempo libre diario". Un día sin
  // visitas es libre entero, así que la regla no tiene nada que comprobar.
  if (window && visits.length > 0) {
    const freeMinutes = minutesBetween(window.start, window.end) - calculateBusyMinutes(day.items);
    if (freeMinutes < MINIMUM_FREE_MINUTES) {
      violations.push({
        date: day.date,
        code: 'not_enough_free_time',
        message: `El día no deja ${MINIMUM_FREE_MINUTES} minutos libres.`,
      });
    }
  }

  if (calculateLongestContinuousMinutes(day.items) > MAX_CONTINUOUS_MINUTES) {
    violations.push({
      date: day.date,
      code: 'too_long_without_break',
      message: 'El día encadena más de tres horas sin pausa.',
    });
  }

  return violations;
}

export function validateItinerary(input: ItineraryValidationInput): ItineraryViolation[] {
  return input.days.flatMap((day) => validateDay(day, input));
}

export interface ItineraryRepairResult {
  days: ItineraryDay[];
  removedItemIds: string[];
  // Lo que sigue mal después de reparar. Con la lógica actual debería venir
  // vacío siempre; si no lo está, es una advertencia para el usuario y una
  // pista para nosotros, no algo que esconder.
  violations: ItineraryViolation[];
}

// Quita el último elemento de un tipo concreto. Se va por el final porque el día
// se construye en orden: la última visita es la que menos encaja y la que menos
// cuesta perder.
function withoutLastVisit(day: ItineraryDay): { day: ItineraryDay; removedId: string } | null {
  for (let index = day.items.length - 1; index >= 0; index -= 1) {
    const item = day.items[index];
    if (item && isVisit(item)) {
      const items = [...day.items];
      items.splice(index, 1);
      return { day: { ...day, items }, removedId: item.id };
    }
  }

  return null;
}

export function repairInvalidItinerary(input: ItineraryValidationInput): ItineraryRepairResult {
  const removedItemIds: string[] = [];

  const days = input.days.map((original) => {
    let day = original;

    // Primero, las visitas que fallan por sí mismas: fuera de horario de
    // apertura, fuera del día o pisando a la anterior. Quitar la última no
    // arreglaría a la del medio.
    //
    // **Solo visitas.** Una comida o el traslado al aeropuerto también pueden
    // aparecer señalados —el solapamiento se apunta al segundo elemento, y ese
    // segundo puede ser la comida que pisa una visita demasiado larga— y
    // borrarlos sería quitarle al usuario el viaje de vuelta para que cuadre el
    // horario. Lo que sobra en un día es siempre una visita.
    const visitIds = new Set(day.items.filter(isVisit).map((item) => item.id));
    const offenders = new Set(
      validateDay(day, input)
        .filter(
          (violation) =>
            violation.itemId !== undefined &&
            visitIds.has(violation.itemId) &&
            (violation.code === 'outside_opening_hours' ||
              violation.code === 'outside_window' ||
              violation.code === 'overlap'),
        )
        .map((violation) => violation.itemId as string),
    );

    if (offenders.size > 0) {
      const kept = day.items.filter((item) => !offenders.has(item.id));
      for (const item of day.items) {
        if (offenders.has(item.id)) removedItemIds.push(item.id);
      }
      day = { ...day, items: kept };
    }

    // Después, lo que solo se arregla con menos plan: demasiadas visitas, poco
    // tiempo libre o demasiadas horas seguidas. El bucle termina porque cada
    // vuelta quita una visita y sin visitas ninguna de las tres reglas puede
    // fallar.
    let remaining = validateDay(day, input);
    while (remaining.length > 0) {
      const reduced = withoutLastVisit(day);
      if (!reduced) break;

      removedItemIds.push(reduced.removedId);
      day = reduced.day;
      remaining = validateDay(day, input);
    }

    return day;
  });

  return {
    days,
    removedItemIds,
    violations: validateItinerary({ ...input, days }),
  };
}
