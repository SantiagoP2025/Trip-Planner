import { describe, expect, it } from 'vitest';
import { readSupabaseConfig, readSupabasePublicConfig } from './env.ts';

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

const VALID_PUBLIC = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_ANON_KEY: 'clave-anonima',
};

describe('readSupabasePublicConfig', () => {
  it('devuelve la configuración pública cuando están las dos variables', () => {
    expect(readSupabasePublicConfig(VALID_PUBLIC)).toEqual({
      status: 'configured',
      config: { url: VALID_PUBLIC.SUPABASE_URL, anonKey: VALID_PUBLIC.SUPABASE_ANON_KEY },
    });
  });

  it('está deshabilitado, no roto, cuando no hay ninguna de las dos', () => {
    expect(readSupabasePublicConfig({})).toEqual({ status: 'disabled' });
  });

  // Una base de datos configurada sin clave anónima deja la aplicación guardando
  // viajes que su dueño no puede recuperar, y en silencio.
  it('marca como inválida una configuración a medias', () => {
    expect(readSupabasePublicConfig({ SUPABASE_URL: VALID_PUBLIC.SUPABASE_URL }).status).toBe(
      'invalid',
    );
    expect(
      readSupabasePublicConfig({ SUPABASE_ANON_KEY: VALID_PUBLIC.SUPABASE_ANON_KEY }).status,
    ).toBe('invalid');
  });

  it('marca como inválida una URL que no lo es', () => {
    expect(
      readSupabasePublicConfig({ ...VALID_PUBLIC, SUPABASE_URL: 'proyecto.supabase.co' }).status,
    ).toBe('invalid');
  });

  // Regla 4 de CLAUDE.md: ni siquiera la clave pública se lee con prefijo
  // `VITE_`. El navegador la recibe de /api/config, no del bundle.
  it('ignora las variables con prefijo VITE_', () => {
    const result = readSupabasePublicConfig({
      VITE_SUPABASE_URL: VALID_PUBLIC.SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: VALID_PUBLIC.SUPABASE_ANON_KEY,
    });

    expect(result).toEqual({ status: 'disabled' });
  });

  // La clave de servicio salta Row Level Security: no puede colarse por el
  // camino que sí llega al navegador.
  it('no mira la clave de servicio en ningún caso', () => {
    const result = readSupabasePublicConfig({
      SUPABASE_URL: VALID_PUBLIC.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio',
    });

    expect(result.status).toBe('invalid');
    expect(JSON.stringify(result)).not.toContain('clave-de-servicio');
  });
});
