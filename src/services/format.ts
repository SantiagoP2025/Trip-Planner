// Presentación, no generación: estas funciones dan formato a datos que ya vienen
// del servidor. Ninguna inventa, calcula ni completa nada (regla 1 de CLAUDE.md).

const LOCALE = 'es-ES';

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    // Las fechas del backend son instantes en UTC. Sin fijar la zona, un vuelo
    // de las 00:30 UTC se enseñaría como del día anterior a quien esté al oeste.
    timeZone: 'UTC',
  }).format(new Date(isoDate));
}

export function formatDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(isoDate));
}

export function formatTime(isoDate: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(isoDate));
}

export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

export function formatStops(stops: number): string {
  if (stops === 0) return 'Directo';
  return stops === 1 ? '1 escala' : `${stops} escalas`;
}
