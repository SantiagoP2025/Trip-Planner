import { describe, expect, it } from 'vitest';
import { MAX_SAVED_TRIP_TITLE_LENGTH } from '../config/trip-limits.js';
import { validateDeleteSavedTrip, validateSaveTrip } from './saved-trip.schema.js';

const TRIP_ID = '3f1a5a1e-8b1a-4a4e-9a4c-0f0b2d3e4a5b';

function validBody(overrides: Record<string, unknown> = {}) {
  return { tripId: TRIP_ID, proposalType: 'recommended', ...overrides };
}

describe('validateSaveTrip', () => {
  it('acepta un cuerpo mínimo sin título', () => {
    const result = validateSaveTrip(validBody());

    expect(result).toEqual({
      success: true,
      data: { tripId: TRIP_ID, proposalType: 'recommended' },
    });
  });

  it('recorta los espacios del título', () => {
    const result = validateSaveTrip(validBody({ title: '  Puente de mayo  ' }));

    expect(result.success && result.data.title).toBe('Puente de mayo');
  });

  it('rechaza un identificador que no es un uuid', () => {
    const result = validateSaveTrip(validBody({ tripId: 'no-es-un-uuid' }));

    expect(result.success).toBe(false);
    expect(!result.success && result.errors[0]?.field).toBe('tripId');
  });

  it('rechaza un tipo de propuesta que no existe', () => {
    const result = validateSaveTrip(validBody({ proposalType: 'la-barata' }));

    expect(result.success).toBe(false);
    expect(!result.success && result.errors[0]?.field).toBe('proposalType');
  });

  // Regla 5 de CLAUDE.md: todo texto libre lleva tope. Es el mismo número que la
  // restricción `saved_trips_title_length` de la migración 0002.
  it('rechaza un título por encima del tope', () => {
    const result = validateSaveTrip(
      validBody({ title: 'a'.repeat(MAX_SAVED_TRIP_TITLE_LENGTH + 1) }),
    );

    expect(result.success).toBe(false);
    expect(!result.success && result.errors[0]?.field).toBe('title');
  });

  it('rechaza un título que solo son espacios', () => {
    const result = validateSaveTrip(validBody({ title: '   ' }));

    expect(result.success).toBe(false);
  });

  // Sección 8.2: "No confiar en cálculos enviados por el frontend". Del cuerpo
  // solo se acepta lo que describe el esquema; la propuesta la lee el servidor
  // de su propia base de datos.
  it('ignora la propuesta y los precios que lleguen en el cuerpo', () => {
    const result = validateSaveTrip(
      validBody({ estimatedTotal: 1, proposal: { id: 'inventada' } }),
    );

    expect(result.success).toBe(true);
    expect(JSON.stringify(result)).not.toContain('inventada');
  });

  it('rechaza un cuerpo que no es un objeto', () => {
    expect(validateSaveTrip('guárdame el viaje').success).toBe(false);
    expect(validateSaveTrip(null).success).toBe(false);
  });
});

describe('validateDeleteSavedTrip', () => {
  it('acepta un identificador válido', () => {
    expect(validateDeleteSavedTrip({ id: TRIP_ID })).toEqual({
      success: true,
      data: { id: TRIP_ID },
    });
  });

  it('rechaza la ausencia de identificador', () => {
    const result = validateDeleteSavedTrip({ id: null });

    expect(result.success).toBe(false);
    expect(!result.success && result.errors[0]?.field).toBe('id');
  });
});
