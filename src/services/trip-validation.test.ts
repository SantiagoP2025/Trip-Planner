import { describe, expect, it } from 'vitest';
import { MAX_ADULTS, MAX_NIGHTS } from '../../server/config/trip-limits.ts';
import { toFieldErrors, validateTripForm } from './trip-validation.ts';

function buildCandidate(overrides: Record<string, unknown> = {}) {
  return {
    origin: 'Valencia',
    destination: 'Lisboa',
    departureDate: '2099-09-10',
    returnDate: '2099-09-17',
    travelers: { adults: 2, children: 0 },
    budget: 3000,
    currency: 'EUR',
    travelStyle: 'balanced',
    preferences: {
      beach: 1,
      culture: 3,
      gastronomy: 3,
      nightlife: 0,
      nature: 2,
      shopping: 0,
      family: 0,
      relax: 1,
    },
    ...overrides,
  };
}

describe('validateTripForm', () => {
  it('acepta una búsqueda completa y devuelve las fechas como texto', () => {
    const result = validateTripForm(buildCandidate());

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.request.departureDate).toBe('2099-09-10');
      expect(result.request.returnDate).toBe('2099-09-17');
    }
  });

  // "Formulario con las mismas validaciones que el servidor": los mismos topes,
  // porque es literalmente el mismo esquema.
  it('aplica el tope de noches de la regla 5', () => {
    const result = validateTripForm(buildCandidate({ returnDate: '2199-09-10' }));

    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.fieldErrors.returnDate).toContain(String(MAX_NIGHTS));
  });

  it('aplica el tope de adultos de la regla 5', () => {
    const result = validateTripForm(
      buildCandidate({ travelers: { adults: MAX_ADULTS + 1, children: 0 } }),
    );

    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.fieldErrors['travelers.adults']).toBeDefined();
  });

  it('rechaza una fecha de salida anterior a hoy', () => {
    const result = validateTripForm(
      buildCandidate({ departureDate: '2020-01-01', returnDate: '2020-01-08' }),
    );

    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.fieldErrors.departureDate).toBeDefined();
  });

  it('rechaza un presupuesto que no es un número', () => {
    const result = validateTripForm(buildCandidate({ budget: Number.NaN }));

    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.fieldErrors.budget).toBeDefined();
  });

  it('señala todos los campos que fallan a la vez', () => {
    const result = validateTripForm(buildCandidate({ origin: 'a', budget: -1, currency: 'YEN' }));

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(Object.keys(result.fieldErrors).sort()).toEqual(['budget', 'currency', 'origin']);
    }
  });
});

describe('toFieldErrors', () => {
  // Debajo de un input solo cabe un mensaje: gana el primero, que es el más
  // cercano a la causa.
  it('se queda con el primer error de cada campo', () => {
    const fieldErrors = toFieldErrors([
      { field: 'budget', message: 'primero' },
      { field: 'budget', message: 'segundo' },
      { field: 'origin', message: 'otro campo' },
    ]);

    expect(fieldErrors).toEqual({ budget: 'primero', origin: 'otro campo' });
  });
});
