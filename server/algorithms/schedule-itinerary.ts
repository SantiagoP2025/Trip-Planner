import type { ActivityCandidate } from '../types/activity.ts';
import type { OpeningPeriod } from '../types/common.ts';
import type { ItineraryItem } from '../types/itinerary.ts';
import {
  addMinutes,
  atTimeOfDay,
  isBefore,
  latest,
  minutesBetween,
  minutesOfDay,
  MINUTES_PER_DAY,
  parseTimeOfDay,
} from './time.ts';
import type { TravelMatrix } from './travel-matrix.ts';

// Sección 12.3: las funciones que convierten una lista de lugares en un horario.
//
// Sección 12: "La IA puede proponer candidatos, pero el horario final debe
// calcularlo el backend mediante reglas y datos de rutas". Esto es ese cálculo:
// reglas de la sección 12.1 y tiempos de la matriz de desplazamientos, sin una
// sola hora inventada.

export interface ItineraryOverlap {
  firstItemId: string;
  secondItemId: string;
}

// Sección 12.1: "Margen de 10 a 20 minutos entre actividades".
export const MIN_TRANSITION_MINUTES = 10;
export const MAX_TRANSITION_MINUTES = 20;

// Sección 12.1: "No más de tres horas continuadas sin pausa".
export const MAX_CONTINUOUS_MINUTES = 180;

// Sección 12.1: "Al menos 60 minutos de tiempo libre diario".
export const MINIMUM_FREE_MINUTES = 60;

export const BREAK_MINUTES = 30;

// Sección 12.1: "Añadir comida y cena automáticamente".
export const LUNCH_DURATION_MINUTES = 60;
export const DINNER_DURATION_MINUTES = 90;

// Sección 10.1: un solapamiento invalida la propuesta entera. Se ordena una
// copia (fase 3: funciones puras, la entrada no se toca) y se recorre una sola
// vez comparando con el final más tardío visto hasta ahora.
export function detectOverlaps(items: readonly ItineraryItem[]): ItineraryOverlap[] {
  const sorted = [...items].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  const overlaps: ItineraryOverlap[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (new Date(current.startTime).getTime() < new Date(previous.endTime).getTime()) {
      overlaps.push({ firstItemId: previous.id, secondItemId: current.id });
    }
  }

  return overlaps;
}

// Sección 12.1: "No programar visitas fuera de horarios de apertura".
// Sin horario conocido no hay nada que incumplir: se admite, y el elemento queda
// marcado como no verificado (sección 11.5), que es información distinta.
export function checkOpeningHours(
  openingHours: readonly OpeningPeriod[] | undefined,
  startTime: string,
  endTime: string,
): boolean {
  if (!openingHours || openingHours.length === 0) return true;

  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  if (end.getTime() <= start.getTime()) return false;

  const period = openingHours.find((entry) => entry.dayOfWeek === start.getUTCDay());
  if (!period) return false; // Cerrado ese día de la semana.

  const opensAt = parseTimeOfDay(period.opensAt);
  const closesAt = parseTimeOfDay(period.closesAt);
  if (opensAt === undefined || closesAt === undefined) return false;

  const startMinutes = start.getUTCHours() * 60 + start.getUTCMinutes();
  const durationMinutes = (end.getTime() - start.getTime()) / 60_000;
  const endMinutes = startMinutes + durationMinutes;

  // Una visita que cruza la medianoche nunca cabe en un horario de apertura.
  if (endMinutes > MINUTES_PER_DAY) return false;

  return startMinutes >= opensAt && endMinutes <= closesAt;
}

// Sección 12.3: `calculateNextStartTime()`. Cuándo puede empezar lo siguiente,
// contando el desplazamiento y el margen de la sección 12.1.
//
// El margen se acota a [10, 20]: la especificación da un rango, no un número, y
// dejar pasar un 0 desde quien llama produciría un día encadenado sin respiro
// que después el validador tendría que deshacer.
export function calculateNextStartTime(
  previousEndTime: string,
  travelMinutes: number,
  bufferMinutes: number = MIN_TRANSITION_MINUTES,
): string {
  const buffer = Math.min(MAX_TRANSITION_MINUTES, Math.max(MIN_TRANSITION_MINUTES, bufferMinutes));
  return addMinutes(previousEndTime, Math.max(0, travelMinutes) + buffer);
}

// Retrasa el comienzo hasta la apertura si hace falta, y devuelve `undefined`
// cuando la visita no cabe ese día por mucho que se mueva.
//
// Es la diferencia entre "no cabe" y "cabe más tarde": sin esto, una visita
// propuesta a las 8:40 en un museo que abre a las 9:00 se descartaría entera,
// cuando lo único que hacía falta era esperar veinte minutos.
export function earliestStartWithinOpeningHours(
  startTime: string,
  durationMinutes: number,
  openingHours: readonly OpeningPeriod[] | undefined,
): string | undefined {
  // Sin horario conocido no hay nada que incumplir. El elemento queda marcado
  // como no verificado (sección 11.5), que es información distinta.
  if (!openingHours || openingHours.length === 0) return startTime;

  const period = openingHours.find(
    (entry) => entry.dayOfWeek === new Date(startTime).getUTCDay(),
  );
  if (!period) return undefined; // Cerrado ese día de la semana.

  const opensAt = parseTimeOfDay(period.opensAt);
  const closesAt = parseTimeOfDay(period.closesAt);
  if (opensAt === undefined || closesAt === undefined) return undefined;

  const startMinutes = minutesOfDay(startTime);
  const effectiveStart = Math.max(startMinutes, opensAt);
  if (effectiveStart + durationMinutes > closesAt) return undefined;

  return addMinutes(startTime, effectiveStart - startMinutes);
}

// Sin proveedor de restaurantes no hay sitio que proponer. La comida entra en el
// horario porque la sección 12.1 lo pide, pero sin nombre y sin coordenadas: un
// restaurante inventado sobre un mapa real es el fallo B.1 de la auditoría, y da
// igual que sea una chincheta o una reserva.
const MEAL_NOTE = 'Es una sugerencia de horario: todavía no proponemos ningún restaurante.';

export type MealKind = 'lunch' | 'dinner';

const MEAL_TITLES: Record<MealKind, string> = { lunch: 'Comida', dinner: 'Cena' };

const MEAL_DURATIONS: Record<MealKind, number> = {
  lunch: LUNCH_DURATION_MINUTES,
  dinner: DINNER_DURATION_MINUTES,
};

function buildMeal(
  date: string,
  kind: MealKind,
  startTime: string,
  costPerPerson: number,
): ItineraryItem {
  const durationMinutes = MEAL_DURATIONS[kind];

  return {
    id: `${date}-meal-${kind}`,
    startTime,
    endTime: addMinutes(startTime, durationMinutes),
    type: 'meal',
    title: MEAL_TITLES[kind],
    durationMinutes,
    costPerPerson,
    verificationStatus: 'unverified',
    notes: [MEAL_NOTE],
  };
}

function buildFreeTime(
  date: string,
  index: number,
  startTime: string,
  durationMinutes: number,
  title: string,
): ItineraryItem {
  return {
    id: `${date}-free-${index}`,
    startTime,
    endTime: addMinutes(startTime, durationMinutes),
    type: 'free_time',
    title,
    durationMinutes,
    verificationStatus: 'verified',
  };
}

export interface DayScheduleInput {
  date: string;
  // El día útil: desde cuándo se puede empezar y hasta cuándo se puede llegar.
  // Lo calcula quien construye el itinerario, que es quien sabe a qué hora
  // aterriza el vuelo y a qué hora hay que estar de vuelta en el aeropuerto.
  window: { start: string; end: string };
  // En orden de visita: lo decide `clusterPlacesByProximity()`.
  activities: readonly ActivityCandidate[];
  // El alojamiento, punto de partida del día.
  originId: string;
  matrix: TravelMatrix;
  costPerPersonPerMeal: number;
  mealTimes: { lunch: string; dinner: string };
}

export interface DaySchedule {
  items: ItineraryItem[];
  // Las que no han cabido. Se devuelven en vez de apretarlas: un día con cuatro
  // visitas encajadas a la fuerza incumple la sección 12.1 y, sobre todo, no se
  // puede cumplir sobre el terreno.
  skippedActivityIds: string[];
}

// Sección 12.3: `scheduleDayActivities()`.
export function scheduleDayActivities(input: DayScheduleInput): DaySchedule {
  const items: ItineraryItem[] = [];
  const skippedActivityIds: string[] = [];

  const windowMinutes = minutesBetween(input.window.start, input.window.end);
  if (windowMinutes <= 0) {
    return { items, skippedActivityIds: input.activities.map((activity) => activity.id) };
  }

  const lunchAt = atTimeOfDay(input.date, input.mealTimes.lunch);
  const dinnerAt = atTimeOfDay(input.date, input.mealTimes.dinner);

  // `fits` compara contra el final del día útil: nada puede terminar después,
  // porque después está el vuelo de vuelta o la noche.
  const fits = (endTime: string): boolean => !isBefore(input.window.end, endTime);

  let cursor = input.window.start;
  let previousId = input.originId;
  let continuousMinutes = 0;
  let lunchPlaced = false;
  let dinnerPlaced = false;
  let freeTimeCount = 0;

  // Lo que hay que dejar libre pase lo que pase: las comidas que falten y el
  // rato libre que exige la sección 12.1.
  //
  // Reservarlo **antes** de encajar una visita, y no comprobarlo después, es la
  // diferencia entre un día con dos visitas y tiempo para respirar y un día con
  // tres que el validador tiene que deshacer. Cuando el hueco se reserva al
  // final, la reparación borra visitas ya colocadas y deja el día lleno de
  // agujeros: peor horario y menos plan.
  const reservedMinutes = (): number =>
    MINIMUM_FREE_MINUTES +
    (lunchPlaced ? 0 : LUNCH_DURATION_MINUTES) +
    (dinnerPlaced ? 0 : DINNER_DURATION_MINUTES);

  const fitsVisit = (endTime: string): boolean =>
    !isBefore(addMinutes(input.window.end, -reservedMinutes()), endTime);

  const placeMeal = (kind: MealKind, notBefore: string): boolean => {
    const meal = buildMeal(input.date, kind, latest(cursor, notBefore), input.costPerPersonPerMeal);
    if (!fits(meal.endTime)) return false;

    items.push(meal);
    cursor = meal.endTime;
    // Comer es la pausa: reinicia la cuenta de las tres horas seguidas.
    continuousMinutes = 0;
    return true;
  };

  for (const activity of input.activities) {
    // Sin tiempo de desplazamiento no se programa la visita. La alternativa
    // sería inventarse los minutos, y un horario que no se puede cumplir es
    // peor que una visita de menos.
    const travelMinutes = input.matrix.minutesBetween(previousId, activity.id);
    if (travelMinutes === undefined) {
      skippedActivityIds.push(activity.id);
      continue;
    }

    // La comida se coloca cuando el reloj la alcanza, antes de encadenar otra
    // visita: si se dejara para el final, saldría una comida a las siete.
    if (!lunchPlaced && lunchAt !== undefined) {
      const tentativeStart = calculateNextStartTime(cursor, travelMinutes);
      if (!isBefore(tentativeStart, lunchAt)) {
        placeMeal('lunch', lunchAt);
        lunchPlaced = true;
      }
    }

    // Sección 12.1: "No más de tres horas continuadas sin pausa".
    //
    // La pausa se prepara pero no se apunta todavía: si la visita que viene
    // detrás acaba descartándose, el día se quedaría con una pausa suelta que no
    // interrumpe nada. Solo se confirma junto con la visita.
    let pendingBreak: ItineraryItem | undefined;
    let startFrom = cursor;

    // La pausa se pone cuando lo siguiente **haría** pasar de tres horas, no
    // cuando ya se han pasado: comprobarlo después es descubrir el problema
    // cuando ya no tiene arreglo, y era lo que hacía que el validador tumbara
    // días enteros que el planificador daba por buenos.
    const wouldChain =
      continuousMinutes > 0 &&
      continuousMinutes + continuousContribution(activity.estimatedDurationMinutes) >
        MAX_CONTINUOUS_MINUTES;

    if (wouldChain) {
      const pause = buildFreeTime(input.date, freeTimeCount, cursor, BREAK_MINUTES, 'Pausa');
      if (fits(pause.endTime)) {
        pendingBreak = pause;
        startFrom = pause.endTime;
      }
    }

    const proposedStart = calculateNextStartTime(startFrom, travelMinutes);
    const startTime = earliestStartWithinOpeningHours(
      proposedStart,
      activity.estimatedDurationMinutes,
      activity.openingHours,
    );
    if (startTime === undefined) {
      skippedActivityIds.push(activity.id);
      continue;
    }

    const endTime = addMinutes(startTime, activity.estimatedDurationMinutes);
    if (!fitsVisit(endTime)) {
      // No se corta el recorrido: una visita larga que no cabe no debe impedir
      // que entre la corta que viene detrás.
      skippedActivityIds.push(activity.id);
      continue;
    }

    if (pendingBreak) {
      items.push(pendingBreak);
      freeTimeCount += 1;
      continuousMinutes = 0;
    }

    items.push({
      id: `${input.date}-visit-${activity.id}`,
      startTime,
      endTime,
      type: 'visit',
      title: activity.name,
      description: activity.category,
      placeId: activity.id,
      // Regla del plan para esta fase: las coordenadas vienen del proveedor de
      // lugares, tal cual. Aquí no se calcula ni se ajusta ninguna.
      latitude: activity.latitude,
      longitude: activity.longitude,
      durationMinutes: activity.estimatedDurationMinutes,
      travelMinutesFromPrevious: travelMinutes,
      transportMode: input.matrix.entry(previousId, activity.id)?.mode,
      costPerPerson: activity.pricePerPerson,
      bookingRequired: activity.bookingRequired,
      bookingUrl: activity.bookingUrl,
      // Sección 11.5 y 12.1 ("Marcar datos no verificados"): el estado viaja
      // desde el candidato sin retocarse.
      verificationStatus: activity.verificationStatus,
    });

    cursor = endTime;
    previousId = activity.id;
    continuousMinutes += continuousContribution(activity.estimatedDurationMinutes);
  }

  // Si el día se acabó sin cruzar la hora de comer, la comida entra igual
  // mientras quepa y no se solape con la cena.
  if (!lunchPlaced && lunchAt !== undefined && (dinnerAt === undefined || isBefore(latest(cursor, lunchAt), dinnerAt))) {
    placeMeal('lunch', lunchAt);
  }

  if (dinnerAt !== undefined) {
    dinnerPlaced = placeMeal('dinner', dinnerAt);
  }

  // Lo que queda del día es tiempo libre y se dice, en vez de dejar un hueco
  // mudo hasta la noche.
  const trailingMinutes = minutesBetween(cursor, input.window.end);
  if (trailingMinutes >= BREAK_MINUTES) {
    items.push(
      buildFreeTime(input.date, freeTimeCount, cursor, trailingMinutes, 'Tiempo libre'),
    );
  }

  return { items, skippedActivityIds };
}

// Lo que un elemento aporta a la cuenta de "horas seguidas sin pausa".
//
// Se acota al propio máximo a propósito. Una visita que por sí sola dura más de
// tres horas no se puede partir con una pausa —no vamos a echar a nadie de un
// museo a mitad—, así que contarla por su duración real convertiría la regla en
// una orden de borrarla. Lo que la sección 12.1 evita es **encadenar** cosas sin
// respirar, y eso es lo que se mide.
function continuousContribution(durationMinutes: number): number {
  return Math.min(durationMinutes, MAX_CONTINUOUS_MINUTES);
}

// Minutos del día que están ocupados de verdad: lo que dura cada elemento más lo
// que cuesta llegar hasta él. El tiempo libre no cuenta como ocupado, que es
// justo lo que permite medir la regla de los 60 minutos de la sección 12.1.
export function calculateBusyMinutes(items: readonly ItineraryItem[]): number {
  let total = 0;
  for (const item of items) {
    if (item.type === 'free_time') continue;
    total += item.durationMinutes + (item.travelMinutesFromPrevious ?? 0);
  }
  return total;
}

// Sección 12.1: "No más de tres horas continuadas sin pausa". Devuelve el tramo
// seguido más largo, para poder comprobarlo.
//
// El desplazamiento no cuenta como tramo seguido: ir de un sitio a otro ya es un
// cambio de ritmo, y sumarlo haría que dos visitas separadas por una hora de
// transporte contaran como tres horas encadenadas.
export function calculateLongestContinuousMinutes(items: readonly ItineraryItem[]): number {
  const sorted = [...items].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  let longest = 0;
  let current = 0;

  for (const item of sorted) {
    // Comer y descansar son la pausa: reinician la cuenta.
    if (item.type === 'free_time' || item.type === 'meal') {
      current = 0;
      continue;
    }
    current += continuousContribution(item.durationMinutes);
    if (current > longest) longest = current;
  }

  return longest;
}
