// Aritmética de fechas y horas del itinerario, en un solo sitio.
//
// **Todo se calcula en UTC, a propósito.** Los proveedores simulados emiten en
// UTC y el real deberá normalizar a UTC igual (misma decisión que ya tomó
// `score-flight.ts` para las horas de vuelo). Mezclar aquí la zona horaria del
// servidor haría que el mismo viaje se planificara distinto según dónde esté
// desplegado, que es de los errores más difíciles de ver: en local sale bien.
//
// Cuando haya zonas horarias reales por destino —las aporta el proveedor de
// lugares (sección 14.2)— la conversión entra aquí y solo aquí.

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

export const MINUTES_PER_DAY = 24 * 60;

const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function addMinutes(isoDateTime: string, minutes: number): string {
  return new Date(new Date(isoDateTime).getTime() + minutes * MS_PER_MINUTE).toISOString();
}

// Negativo cuando el final es anterior al principio: quien llama decide si eso
// es un error o simplemente un margen que no da de sí.
export function minutesBetween(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / MS_PER_MINUTE;
}

// Fecha en formato AAAA-MM-DD más un número de días. Se hace sobre la marca de
// tiempo y no sobre los campos locales para que no dependa del huso del
// servidor.
export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

export function dateOf(isoDateTime: string): string {
  return isoDateTime.slice(0, 10);
}

// Minutos transcurridos desde la medianoche, para comparar contra horarios de
// apertura, que vienen como "HH:MM" sin fecha.
export function minutesOfDay(isoDateTime: string): number {
  const date = new Date(isoDateTime);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

export function parseTimeOfDay(timeOfDay: string): number | undefined {
  const match = TIME_OF_DAY_PATTERN.exec(timeOfDay);
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

// Combina un día (AAAA-MM-DD) con una hora (HH:MM) para obtener el instante.
// Devuelve `undefined` con una hora mal formada en vez de una fecha inválida,
// que se propagaría silenciosamente como `NaN` por todo el horario.
export function atTimeOfDay(date: string, timeOfDay: string): string | undefined {
  const minutes = parseTimeOfDay(timeOfDay);
  if (minutes === undefined) return undefined;
  return addMinutes(`${date}T00:00:00.000Z`, minutes);
}

export function isBefore(first: string, second: string): boolean {
  return new Date(first).getTime() < new Date(second).getTime();
}

export function earliest(first: string, second: string): string {
  return isBefore(first, second) ? first : second;
}

export function latest(first: string, second: string): string {
  return isBefore(first, second) ? second : first;
}
