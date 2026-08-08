import { describe, expect, it } from 'vitest';
import { createTripRepository } from './create-trip-repository.ts';
import { NoopTripRepository } from './noop-trip.repository.ts';
import { SupabaseTripRepository } from './supabase-trip.repository.ts';

describe('createTripRepository', () => {
  it('usa Supabase cuando la configuración está completa', () => {
    const selection = createTripRepository({
      SUPABASE_URL: 'https://proyecto.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio',
    });

    expect(selection.repository).toBeInstanceOf(SupabaseTripRepository);
    expect(selection.status).toBe('configured');
  });

  // Criterio de la fase 6: sin base de datos, el viaje se genera igual.
  it('cae en la implementación inerte cuando no hay configuración', () => {
    const selection = createTripRepository({});

    expect(selection.repository).toBeInstanceOf(NoopTripRepository);
    expect(selection.status).toBe('disabled');
  });

  // Una configuración a medias tampoco puede tumbar el endpoint, pero sí tiene
  // que distinguirse de la ausencia para poder registrarla como el error que es.
  it('cae en la implementación inerte y explica por qué si la configuración es inválida', () => {
    const selection = createTripRepository({ SUPABASE_URL: 'https://proyecto.supabase.co' });

    expect(selection.repository).toBeInstanceOf(NoopTripRepository);
    expect(selection.status).toBe('invalid');
    expect(selection.reason).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
