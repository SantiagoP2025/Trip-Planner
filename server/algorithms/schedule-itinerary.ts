import type { OpeningPeriod } from '../types/common.ts';
import type { ItineraryItem } from '../types/itinerary.ts';

// Sección 12.3: dos de las funciones que necesita el itinerario, detectOverlaps()
// y checkOpeningHours(), son puras y son restricciones duras de la sección 10.1
// ("sin solapamientos", "sin actividades fuera de horario"), así que viven aquí,
// con el resto de algoritmos. La construcción del horario (clusterPlaces,
// distributePlacesAcrossDays, scheduleDayActivities) llega en su propia fase.

export interface ItineraryOverlap {
  firstItemId: string;
  secondItemId: string;
}

const MINUTES_PER_DAY = 24 * 60;
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

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

function toMinutesOfDay(timeOfDay: string): number | undefined {
  const match = TIME_OF_DAY_PATTERN.exec(timeOfDay);
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
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

  const opensAt = toMinutesOfDay(period.opensAt);
  const closesAt = toMinutesOfDay(period.closesAt);
  if (opensAt === undefined || closesAt === undefined) return false;

  const startMinutes = start.getUTCHours() * 60 + start.getUTCMinutes();
  const durationMinutes = (end.getTime() - start.getTime()) / 60_000;
  const endMinutes = startMinutes + durationMinutes;

  // Una visita que cruza la medianoche nunca cabe en un horario de apertura.
  if (endMinutes > MINUTES_PER_DAY) return false;

  return startMinutes >= opensAt && endMinutes <= closesAt;
}
