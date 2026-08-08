import { calculateDailyBudget } from '../algorithms/daily-budget.ts';
import {
  clusterPlacesByProximity,
  distributePlacesAcrossDays,
} from '../algorithms/cluster-places.ts';
import {
  DINNER_DURATION_MINUTES,
  LUNCH_DURATION_MINUTES,
  MINIMUM_FREE_MINUTES,
  scheduleDayActivities,
} from '../algorithms/schedule-itinerary.ts';
import { calculateVisitsPerDay } from '../algorithms/select-activities.ts';
import {
  addDays,
  addMinutes,
  atTimeOfDay,
  dateOf,
  earliest,
  latest,
  minutesBetween,
} from '../algorithms/time.ts';
import type { TravelMatrix } from '../algorithms/travel-matrix.ts';
import {
  repairInvalidItinerary,
  type ItineraryDayWindow,
  type ItineraryViolation,
} from '../algorithms/validate-itinerary.ts';
import type { AccommodationOffer } from '../types/accommodation.ts';
import type { ActivityCandidate } from '../types/activity.ts';
import type { OpeningPeriod, PreferenceProfile } from '../types/common.ts';
import type { FlightOffer } from '../types/flight.ts';
import type { ItineraryDay, ItineraryItem } from '../types/itinerary.ts';
import type { BudgetBreakdown, TripRequest } from '../types/trip.ts';

// Sección 12: generación del itinerario, de principio a fin.
//
//   candidatos → matriz de desplazamientos → agrupación por proximidad →
//   distribución entre días → asignación de horas → validación y reparación
//
// Cada paso vive en su propio algoritmo puro y probado; esto los encadena y les
// da el contexto que ninguno puede conocer por su cuenta: a qué hora aterriza el
// vuelo, a qué hora hay que estar de vuelta en el aeropuerto y cuánto se puede
// gastar al día.
//
// **Ninguna coordenada se calcula aquí.** Las de las visitas vienen del proveedor
// de lugares y las del alojamiento del de alojamiento, tal cual. Es el requisito
// explícito de esta fase, y lo que hace que el mapa de la fase 10 pueda existir
// sin enseñar un pueblo húngaro a quien buscó Tokio (fallo B.1 de la auditoría).

const HIGH_PREFERENCE_LEVEL = 3;

// Sección 12.1: "Primer día adaptado a la hora real de llegada". Lo que pasa
// entre que el avión toca tierra y el viajero puede empezar a hacer algo.
export const DISEMBARK_MINUTES = 30;
export const AIRPORT_TRANSFER_MINUTES = 45;
export const CHECK_IN_MINUTES = 30;
const ARRIVAL_HEAD_MINUTES = DISEMBARK_MINUTES + AIRPORT_TRANSFER_MINUTES + CHECK_IN_MINUTES;

// Sección 12.1: "Último día con margen suficiente para el traslado".
export const AIRPORT_CHECK_IN_MARGIN_MINUTES = 120;

// Cuánto ocupa una visita con su desplazamiento y su parte proporcional de
// comida. Solo sirve para estimar cuántas caben en un día antes de repartirlas;
// el horario de verdad lo calcula `scheduleDayActivities()` minuto a minuto.
const ESTIMATED_VISIT_SLOT_MINUTES = 150;

// Lo que un día tiene comprometido antes de encajar ninguna visita: comida,
// cena y el tiempo libre mínimo de la sección 12.1.
const RESERVED_DAY_MINUTES =
  LUNCH_DURATION_MINUTES + DINNER_DURATION_MINUTES + MINIMUM_FREE_MINUTES;

interface DaySchedulePreset {
  dayStart: string;
  dayEnd: string;
  lunch: string;
  dinner: string;
}

const DEFAULT_SCHEDULE: DaySchedulePreset = {
  dayStart: '09:30',
  dayEnd: '21:30',
  lunch: '13:30',
  dinner: '20:00',
};

// Sección 12.1: "Ajustar comienzo del día si la preferencia Vida nocturna es
// alta". Se empieza más tarde y se termina más tarde: mover solo el principio
// dejaría un día más corto, que es lo contrario de lo que pide quien sale de noche.
const NIGHTLIFE_SCHEDULE: DaySchedulePreset = {
  dayStart: '11:00',
  dayEnd: '23:30',
  lunch: '14:00',
  dinner: '21:30',
};

export interface DayPlanWindow extends ItineraryDayWindow {
  // Desde y hasta cuándo se pueden programar visitas. Es más estrecho que el día
  // entero: la llegada, el traslado y la entrada al alojamiento ocupan el
  // principio, y el traslado al aeropuerto ocupa el final.
  visitStart: string;
  visitEnd: string;
}

function clampTime(value: string, low: string, high: string): string {
  return latest(low, earliest(value, high));
}

function lastArrival(segments: readonly { arrivalTime: string }[] | undefined): string | undefined {
  return segments?.[segments.length - 1]?.arrivalTime;
}

export interface DayWindowsInput {
  departureDate: string;
  returnDate: string;
  flight: FlightOffer;
  preferences: PreferenceProfile;
}

// Sección 12.1, reglas del primer y del último día. Se calculan por fecha y no
// por posición: con un vuelo nocturno el avión aterriza al día siguiente del que
// sale, y encajar la llegada en el día 0 pondría el traslado al alojamiento doce
// horas antes de tocar tierra.
export function calculateDayWindows(input: DayWindowsInput): DayPlanWindow[] {
  const schedule =
    input.preferences.nightlife >= HIGH_PREFERENCE_LEVEL ? NIGHTLIFE_SCHEDULE : DEFAULT_SCHEDULE;

  const arrivalTime = lastArrival(input.flight.outbound);
  const returnDepartureTime = input.flight.inbound?.[0]?.departureTime;
  const arrivalDate = arrivalTime ? dateOf(arrivalTime) : undefined;
  const returnDate = returnDepartureTime ? dateOf(returnDepartureTime) : undefined;

  const dayCount = Math.max(
    1,
    Math.round(minutesBetween(`${input.departureDate}T00:00:00.000Z`, `${input.returnDate}T00:00:00.000Z`) / (24 * 60)) + 1,
  );

  const windows: DayPlanWindow[] = [];

  for (let index = 0; index < dayCount; index += 1) {
    const date = addDays(input.departureDate, index);
    const defaultStart = atTimeOfDay(date, schedule.dayStart);
    const defaultEnd = atTimeOfDay(date, schedule.dayEnd);
    // Los horarios por defecto son constantes de este fichero y siempre válidos;
    // la comprobación existe para que un cambio futuro no falle en silencio.
    if (defaultStart === undefined || defaultEnd === undefined) continue;

    let start = defaultStart;
    let end = defaultEnd;
    let visitStart = defaultStart;
    let visitEnd = defaultEnd;

    if (arrivalTime !== undefined && date === arrivalDate) {
      start = arrivalTime;
      // El día puede acabar más tarde de lo normal si el avión llega de noche:
      // entrar en el hotel a la una de la mañana sigue siendo parte del día.
      end = latest(end, addMinutes(arrivalTime, ARRIVAL_HEAD_MINUTES));
      // Pero visitar algo empieza cuando abre la ciudad, no cuando se deja la
      // maleta: nadie entra en un museo a las seis de la mañana.
      visitStart = latest(addMinutes(arrivalTime, ARRIVAL_HEAD_MINUTES), defaultStart);
      visitEnd = defaultEnd;
    }

    if (returnDepartureTime !== undefined && date === returnDate) {
      // Hay que estar en el aeropuerto con margen, y antes hay que llegar.
      end = earliest(end, addMinutes(returnDepartureTime, -AIRPORT_CHECK_IN_MARGIN_MINUTES));
      visitEnd = addMinutes(end, -AIRPORT_TRANSFER_MINUTES);
      // El día empieza, como muy tarde, cuando arranca el traslado al
      // aeropuerto. Sin esta línea, un vuelo de vuelta temprano dejaba el
      // traslado empezando antes del principio del día y el validador lo
      // marcaba como fuera de horas para siempre: no es una visita, así que la
      // reparación no podía quitarlo.
      start = earliest(start, visitEnd);
    }

    visitStart = clampTime(visitStart, start, end);
    visitEnd = clampTime(visitEnd, visitStart, end);

    windows.push({ date, start, end, visitStart, visitEnd });
  }

  return windows;
}

function buildArrivalItems(
  window: DayPlanWindow,
  destination: string,
  accommodation: AccommodationOffer,
): ItineraryItem[] {
  const arrival: ItineraryItem = {
    id: `${window.date}-arrival`,
    startTime: window.start,
    endTime: addMinutes(window.start, DISEMBARK_MINUTES),
    type: 'arrival',
    title: `Llegada a ${destination}`,
    durationMinutes: DISEMBARK_MINUTES,
    // La hora es la del proveedor de vuelos; el tiempo de desembarque es una
    // estimación nuestra, así que el dato no está verificado del todo.
    verificationStatus: 'partial',
    notes: ['Tiempo estimado de desembarque y recogida de equipaje.'],
  };

  const transfer: ItineraryItem = {
    id: `${window.date}-transfer-in`,
    startTime: arrival.endTime,
    endTime: addMinutes(arrival.endTime, AIRPORT_TRANSFER_MINUTES),
    type: 'transfer',
    title: 'Traslado al alojamiento',
    durationMinutes: AIRPORT_TRANSFER_MINUTES,
    transportMode: 'transit',
    // Sin coordenadas del aeropuerto no hay ruta que pedirle al proveedor: es
    // una estimación y se dice, en vez de dibujar un trayecto que no existe.
    verificationStatus: 'unverified',
    notes: ['Duración estimada: todavía no calculamos la ruta desde el aeropuerto.'],
  };

  const checkIn: ItineraryItem = {
    id: `${window.date}-check-in`,
    startTime: transfer.endTime,
    endTime: addMinutes(transfer.endTime, CHECK_IN_MINUTES),
    type: 'hotel',
    title: `Entrada en ${accommodation.name}`,
    durationMinutes: CHECK_IN_MINUTES,
    // Coordenadas reales del proveedor de alojamiento.
    latitude: accommodation.latitude,
    longitude: accommodation.longitude,
    verificationStatus: 'partial',
  };

  return [arrival, transfer, checkIn];
}

function buildDepartureItems(window: DayPlanWindow, origin: string): ItineraryItem[] {
  const startTime = addMinutes(window.end, -AIRPORT_TRANSFER_MINUTES);

  return [
    {
      id: `${window.date}-transfer-out`,
      startTime,
      endTime: window.end,
      type: 'transfer',
      title: `Traslado al aeropuerto para volver a ${origin}`,
      durationMinutes: AIRPORT_TRANSFER_MINUTES,
      transportMode: 'transit',
      verificationStatus: 'unverified',
      notes: [
        `Con ${AIRPORT_CHECK_IN_MARGIN_MINUTES} minutos de margen antes de la salida del vuelo.`,
      ],
    },
  ];
}

export interface BuildItineraryInput {
  request: TripRequest;
  flight: FlightOffer;
  accommodation: AccommodationOffer;
  // Las ya seleccionadas por afinidad (sección 6), con sus coordenadas y sus
  // horarios tal como los devolvió el proveedor de lugares.
  activities: readonly ActivityCandidate[];
  matrix: TravelMatrix;
  budget: BudgetBreakdown;
}

export interface BuildItineraryResult {
  days: ItineraryDay[];
  // Sección 10.7: lo que el usuario debe saber del itinerario antes de decidir.
  warnings: string[];
  violations: ItineraryViolation[];
}

export function buildItinerary(input: BuildItineraryInput): BuildItineraryResult {
  const windows = calculateDayWindows({
    departureDate: input.request.departureDate,
    returnDate: input.request.returnDate,
    flight: input.flight,
    preferences: input.request.preferences,
  });

  const travelers = input.request.travelers.adults + input.request.travelers.children;
  const maxVisitsPerDay = calculateVisitsPerDay(input.request.preferences);
  const schedule =
    input.request.preferences.nightlife >= HIGH_PREFERENCE_LEVEL
      ? NIGHTLIFE_SCHEDULE
      : DEFAULT_SCHEDULE;

  const dailyBudget = calculateDailyBudget({
    foodBudget: input.budget.foodBudget,
    travelers,
    days: windows.length,
  });

  // Cuántas visitas cabe esperar en cada día. El primero y el último salen
  // recortados solos, sin ninguna regla especial: su ventana es más corta.
  //
  // Del día útil se descuenta antes lo que no es negociable —las dos comidas y
  // el rato libre de la sección 12.1—, porque repartir sobre el día entero
  // prometía tres visitas donde solo caben dos y obligaba a deshacerlo después.
  const capacityPerDay = windows.map((window) => {
    const availableMinutes =
      minutesBetween(window.visitStart, window.visitEnd) - RESERVED_DAY_MINUTES;
    return Math.max(
      0,
      Math.min(maxVisitsPerDay, Math.floor(availableMinutes / ESTIMATED_VISIT_SLOT_MINUTES)),
    );
  });

  const activitiesById = new Map(input.activities.map((activity) => [activity.id, activity]));

  const clusters = clusterPlacesByProximity({
    placeIds: input.activities.map((activity) => activity.id),
    anchorId: input.accommodation.id,
    matrix: input.matrix,
    clusterCount: capacityPerDay.filter((capacity) => capacity > 0).length,
    maxPerCluster: maxVisitsPerDay,
  });

  const placesByDay = distributePlacesAcrossDays({ clusters, capacityPerDay });

  const arrivalTime = lastArrival(input.flight.outbound);
  const returnDepartureTime = input.flight.inbound?.[0]?.departureTime;

  const days: ItineraryDay[] = [];
  const skippedActivityIds: string[] = [];

  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index];
    if (!window) continue;

    // Regla 7 de CLAUDE.md, sobre el `push(...)` de aquí abajo: estas listas
    // están acotadas por construcción, no por suerte. Un día lleva como mucho
    // tres visitas (sección 12.1), dos comidas, sus pausas y tres elementos de
    // llegada, así que el spread nunca se acerca al tope de argumentos de Node.
    const items: ItineraryItem[] = [];

    if (arrivalTime !== undefined && window.date === dateOf(arrivalTime)) {
      items.push(...buildArrivalItems(window, input.request.destination, input.accommodation));
    }

    const dayActivities = (placesByDay[index] ?? [])
      .map((id) => activitiesById.get(id))
      .filter((activity): activity is ActivityCandidate => activity !== undefined);

    const scheduled = scheduleDayActivities({
      date: window.date,
      window: { start: window.visitStart, end: window.visitEnd },
      activities: dayActivities,
      originId: input.accommodation.id,
      matrix: input.matrix,
      costPerPersonPerMeal: dailyBudget.costPerPersonPerMeal,
      mealTimes: { lunch: schedule.lunch, dinner: schedule.dinner },
    });

    items.push(...scheduled.items);
    skippedActivityIds.push(...scheduled.skippedActivityIds);

    if (returnDepartureTime !== undefined && window.date === dateOf(returnDepartureTime)) {
      items.push(...buildDepartureItems(window, input.request.origin));
    }

    days.push({ date: window.date, items });
  }

  // Sección 12.3: validación y reparación. Lo que no se pueda cumplir se quita.
  const openingHoursByPlaceId = new Map<string, readonly OpeningPeriod[] | undefined>(
    input.activities.map((activity) => [activity.id, activity.openingHours]),
  );

  const repaired = repairInvalidItinerary({
    days,
    windowsByDate: new Map(windows.map((window) => [window.date, window])),
    maxVisitsPerDay,
    openingHoursByPlaceId,
  });

  return {
    days: repaired.days,
    warnings: buildItineraryWarnings({
      plannedActivities: input.activities.length,
      skipped: skippedActivityIds.length,
      removed: repaired.removedItemIds.length,
      violations: repaired.violations,
    }),
    violations: repaired.violations,
  };
}

interface ItineraryWarningInput {
  plannedActivities: number;
  skipped: number;
  removed: number;
  violations: readonly ItineraryViolation[];
}

function buildItineraryWarnings(input: ItineraryWarningInput): string[] {
  const warnings: string[] = [];

  // Las comidas son huecos en la agenda, no reservas. Decirlo una vez, en las
  // advertencias, evita repetirlo en cada línea del itinerario.
  warnings.push('Las comidas y cenas del itinerario son sugerencias de horario, sin restaurante reservado.');

  const dropped = input.skipped + input.removed;
  if (dropped > 0 && input.plannedActivities > 0) {
    warnings.push(
      dropped === 1
        ? 'Una de las actividades no encaja en el horario y se ha dejado fuera del itinerario.'
        : `${dropped} actividades no encajan en el horario y se han dejado fuera del itinerario.`,
    );
  }

  if (input.violations.length > 0) {
    warnings.push('El itinerario no cumple alguna de nuestras reglas de horario. Revísalo antes de reservar nada.');
  }

  return warnings;
}
