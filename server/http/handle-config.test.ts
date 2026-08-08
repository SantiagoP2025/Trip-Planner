import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiErrorBody, RuntimeConfigResponseBody } from '../types/api.js';
import { createConfigHandler } from './handle-config.js';
import { FixedWindowRateLimiter, type RateLimiter } from './rate-limit.js';

const CONFIGURED = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_ANON_KEY: 'clave-anonima',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio-secretisima',
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function permissiveLimiter(): RateLimiter {
  return new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1_000 });
}

function buildHandler(
  env: Record<string, string | undefined>,
  rateLimiter: RateLimiter = permissiveLimiter(),
) {
  return createConfigHandler({ rateLimiter, env });
}

function getRequest(method = 'GET'): Request {
  return new Request('https://ejemplo.test/api/config', {
    method,
    headers: { 'x-real-ip': '1.1.1.1' },
  });
}

describe('GET /api/config', () => {
  it('devuelve la URL y la clave anónima cuando hay cuentas configuradas', async () => {
    const response = await buildHandler(CONFIGURED)(getRequest());
    const body = (await response.json()) as RuntimeConfigResponseBody;

    expect(response.status).toBe(200);
    expect(body.supabase).toEqual({
      url: CONFIGURED.SUPABASE_URL,
      anonKey: CONFIGURED.SUPABASE_ANON_KEY,
    });
  });

  // Regla 4 de CLAUDE.md. Es el test que importa de este fichero: la clave de
  // servicio salta Row Level Security, así que publicarla sería dar acceso
  // completo a la base de datos a cualquiera que abra las herramientas de
  // desarrollo.
  it('nunca deja salir la clave de servicio', async () => {
    const raw = await (await buildHandler(CONFIGURED)(getRequest())).text();

    expect(raw).not.toContain('clave-de-servicio-secretisima');
    expect(raw).not.toContain('SERVICE_ROLE');
  });

  it('tampoco deja salir ninguna otra clave del servidor', async () => {
    const raw = await (
      await buildHandler({
        ...CONFIGURED,
        AMADEUS_CLIENT_SECRET: 'secreto-de-amadeus',
        ANTHROPIC_API_KEY: 'clave-de-anthropic',
      })(getRequest())
    ).text();

    expect(raw).not.toContain('secreto-de-amadeus');
    expect(raw).not.toContain('clave-de-anthropic');
  });

  // Sin cuentas la aplicación sigue generando viajes: el frontend enseña que no
  // están disponibles en vez de un formulario de acceso que no puede funcionar.
  it('devuelve null, y no un error, cuando no hay cuentas configuradas', async () => {
    const response = await buildHandler({})(getRequest());
    const body = (await response.json()) as RuntimeConfigResponseBody;

    expect(response.status).toBe(200);
    expect(body.supabase).toBeNull();
  });

  it('devuelve null ante una configuración a medias', async () => {
    const response = await buildHandler({ SUPABASE_URL: CONFIGURED.SUPABASE_URL })(getRequest());
    const body = (await response.json()) as RuntimeConfigResponseBody;

    expect(body.supabase).toBeNull();
  });

  // Sección 8.2: "Aceptar únicamente métodos HTTP previstos".
  it('devuelve 405 ante cualquier método que no sea GET', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const response = await buildHandler(CONFIGURED)(getRequest(method));
      const body = (await response.json()) as ApiErrorBody;

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET');
      expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
    }
  });

  it('devuelve 429 al superar el tope de peticiones', async () => {
    const handler = buildHandler(
      CONFIGURED,
      new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1 }),
    );

    expect((await handler(getRequest())).status).toBe(200);
    expect((await handler(getRequest())).status).toBe(429);
  });
});
