import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMinutes,
  atTimeOfDay,
  dateOf,
  earliest,
  isBefore,
  latest,
  minutesBetween,
  minutesOfDay,
  parseTimeOfDay,
} from './time.js';

describe('addMinutes', () => {
  it('suma minutos', () => {
    expect(addMinutes('2026-09-10T09:30:00.000Z', 45)).toBe('2026-09-10T10:15:00.000Z');
  });

  it('resta con minutos negativos', () => {
    expect(addMinutes('2026-09-10T09:30:00.000Z', -45)).toBe('2026-09-10T08:45:00.000Z');
  });

  it('cruza la medianoche sin perder el día', () => {
    expect(addMinutes('2026-09-10T23:30:00.000Z', 60)).toBe('2026-09-11T00:30:00.000Z');
  });
});

describe('minutesBetween', () => {
  it('mide la distancia entre dos instantes', () => {
    expect(minutesBetween('2026-09-10T09:00:00.000Z', '2026-09-10T11:30:00.000Z')).toBe(150);
  });

  // Quien llama decide si un margen negativo es un error o simplemente un hueco
  // que no da de sí, así que aquí no se recorta a cero.
  it('devuelve negativo cuando el final es anterior al principio', () => {
    expect(minutesBetween('2026-09-10T11:30:00.000Z', '2026-09-10T09:00:00.000Z')).toBe(-150);
  });
});

describe('addDays', () => {
  it('avanza días sobre una fecha corta', () => {
    expect(addDays('2026-09-10', 4)).toBe('2026-09-14');
  });

  it('cruza el cambio de mes', () => {
    expect(addDays('2026-09-28', 5)).toBe('2026-10-03');
  });

  // Todo el itinerario se calcula en UTC. Si esta función usara los campos
  // locales, el mismo viaje se planificaría distinto según dónde esté desplegado
  // el servidor, y en local siempre saldría bien.
  it('no depende del huso horario del servidor', () => {
    expect(addDays('2026-09-10', 1)).toBe('2026-09-11');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('atTimeOfDay', () => {
  it('combina fecha y hora en un instante UTC', () => {
    expect(atTimeOfDay('2026-09-10', '13:30')).toBe('2026-09-10T13:30:00.000Z');
  });

  // Devolver una fecha inválida propagaría `NaN` en silencio por todo el horario.
  it('devuelve undefined ante una hora mal formada', () => {
    expect(atTimeOfDay('2026-09-10', '25:00')).toBeUndefined();
    expect(atTimeOfDay('2026-09-10', 'mediodía')).toBeUndefined();
  });
});

describe('parseTimeOfDay', () => {
  it('convierte HH:MM a minutos desde medianoche', () => {
    expect(parseTimeOfDay('00:00')).toBe(0);
    expect(parseTimeOfDay('13:30')).toBe(810);
    expect(parseTimeOfDay('23:59')).toBe(1439);
  });

  it('rechaza lo que no es una hora del día', () => {
    expect(parseTimeOfDay('24:00')).toBeUndefined();
    expect(parseTimeOfDay('13:60')).toBeUndefined();
    expect(parseTimeOfDay('9:30')).toBeUndefined();
  });
});

describe('minutesOfDay y dateOf', () => {
  it('extrae los minutos del día en UTC', () => {
    expect(minutesOfDay('2026-09-10T13:30:00.000Z')).toBe(810);
  });

  it('extrae la fecha corta', () => {
    expect(dateOf('2026-09-10T13:30:00.000Z')).toBe('2026-09-10');
  });
});

describe('comparaciones', () => {
  const temprano = '2026-09-10T09:00:00.000Z';
  const tarde = '2026-09-10T18:00:00.000Z';

  it('ordena dos instantes', () => {
    expect(isBefore(temprano, tarde)).toBe(true);
    expect(isBefore(tarde, temprano)).toBe(false);
    expect(isBefore(temprano, temprano)).toBe(false);
  });

  it('elige el primero y el último', () => {
    expect(earliest(tarde, temprano)).toBe(temprano);
    expect(latest(tarde, temprano)).toBe(tarde);
  });
});
