import { describe, expect, it } from 'vitest';
import { readSupabaseConfig } from './env.ts';

const VALID = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio',
};

describe('readSupabaseConfig', () => {
  it('devuelve la configuración cuando están las dos variables', () => {
    expect(readSupabaseConfig(VALID)).toEqual({
      status: 'configured',
      config: { url: VALID.SUPABASE_URL, serviceRoleKey: VALID.SUPABASE_SERVICE_ROLE_KEY },
    });
  });

  it('está deshabilitado, no roto, cuando no hay ninguna de las dos', () => {
    expect(readSupabaseConfig({})).toEqual({ status: 'disabled' });
  });

  it('trata las variables vacías como ausentes', () => {
    expect(readSupabaseConfig({ SUPABASE_URL: '  ', SUPABASE_SERVICE_ROLE_KEY: '' })).toEqual({
      status: 'disabled',
    });
  });

  // Una configuración a medias casi siempre es una variable mal escrita.
  // Devolver `disabled` en silencio la escondería durante semanas.
  it('marca como inválida una configuración a medias', () => {
    expect(readSupabaseConfig({ SUPABASE_URL: VALID.SUPABASE_URL }).status).toBe('invalid');
    expect(
      readSupabaseConfig({ SUPABASE_SERVICE_ROLE_KEY: VALID.SUPABASE_SERVICE_ROLE_KEY }).status,
    ).toBe('invalid');
  });

  it('marca como inválida una URL que no lo es', () => {
    const result = readSupabaseConfig({ ...VALID, SUPABASE_URL: 'proyecto.supabase.co' });

    expect(result.status).toBe('invalid');
  });

  // Regla 4 de CLAUDE.md: la clave de servicio salta Row Level Security, así que
  // no puede llegar nunca al navegador. Si alguien la define con prefijo `VITE_`
  // creyendo que así "funciona", tiene que seguir sin funcionar.
  it('ignora las variables con prefijo VITE_', () => {
    const result = readSupabaseConfig({
      VITE_SUPABASE_URL: VALID.SUPABASE_URL,
      VITE_SUPABASE_SERVICE_ROLE_KEY: VALID.SUPABASE_SERVICE_ROLE_KEY,
    });

    expect(result).toEqual({ status: 'disabled' });
  });
});
