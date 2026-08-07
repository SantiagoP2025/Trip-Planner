import { describe, expect, it } from 'vitest';
import { tripRequestSchema, validateTripRequest } from './trip.schema.ts';

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function buildValidRequest(overrides: Record<string, unknown> = {}) {
  const departure = addDays(new Date(), 10);
  const returnDate = addDays(departure, 4);
  return {
    origin: 'Valencia',
    destination: 'Roma',
    departureDate: toDateOnly(departure),
    returnDate: toDateOnly(returnDate),
    travelers: { adults: 2, children: 0 },
    budget: 1500,
    currency: 'EUR',
    travelStyle: 'balanced',
    preferences: {
      beach: 0,
      culture: 3,
      gastronomy: 2,
      nightlife: 0,
      nature: 1,
      shopping: 0,
      family: 0,
      relax: 2,
    },
    ...overrides,
  };
}

describe('tripRequestSchema', () => {
  it('acepta una solicitud válida', () => {
    const result = tripRequestSchema.safeParse(buildValidRequest());
    expect(result.success).toBe(true);
  });

  it('rechaza una fecha de salida pasada', () => {
    const yesterday = addDays(new Date(), -1);
    const result = tripRequestSchema.safeParse(
      buildValidRequest({
        departureDate: toDateOnly(yesterday),
        returnDate: toDateOnly(addDays(yesterday, 4)),
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'departureDate')).toBe(true);
    }
  });

  it('rechaza una duración por encima del máximo de 30 noches', () => {
    const departure = addDays(new Date(), 10);
    const result = tripRequestSchema.safeParse(
      buildValidRequest({
        departureDate: toDateOnly(departure),
        returnDate: toDateOnly(addDays(departure, 31)),
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('30 noches'))).toBe(true);
    }
  });

  it('rechaza un regreso anterior o igual a la salida', () => {
    const departure = addDays(new Date(), 10);
    const result = tripRequestSchema.safeParse(
      buildValidRequest({
        departureDate: toDateOnly(departure),
        returnDate: toDateOnly(departure),
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'returnDate')).toBe(true);
    }
  });

  it.each([
    ['negativo', -100],
    ['cero', 0],
    ['por encima del máximo', 100_001],
  ])('rechaza un presupuesto %s', (_label, budget) => {
    const result = tripRequestSchema.safeParse(buildValidRequest({ budget }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'budget')).toBe(true);
    }
  });

  it('rechaza una preferencia fuera del rango 0-3', () => {
    const result = tripRequestSchema.safeParse(
      buildValidRequest({
        preferences: {
          beach: 0,
          culture: 4,
          gastronomy: 2,
          nightlife: 0,
          nature: 1,
          shopping: 0,
          family: 0,
          relax: 2,
        },
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'preferences.culture')).toBe(true);
    }
  });
});

describe('validateTripRequest', () => {
  it('devuelve los datos validados con éxito', () => {
    const result = validateTripRequest(buildValidRequest());
    expect(result.success).toBe(true);
  });

  it('devuelve errores en español con el campo afectado', () => {
    const result = validateTripRequest(buildValidRequest({ budget: 0 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toContainEqual({
        field: 'budget',
        message: 'El presupuesto debe ser mayor que 0.',
      });
    }
  });
});
