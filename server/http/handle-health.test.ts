import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiErrorBody, HealthResponseBody } from '../types/api.ts';
import { createHealthHandler } from './handle-health.ts';
import { FixedWindowRateLimiter, type RateLimiter } from './rate-limit.ts';

const NOW = new Date('2026-08-07T10:00:00.000Z');

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function buildHandler(rateLimiter?: RateLimiter) {
  return createHealthHandler({
    rateLimiter: rateLimiter ?? new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1_000 }),
    now: () => NOW,
  });
}

function getRequest(): Request {
  return new Request('https://ejemplo.test/api/health', {
    headers: { 'x-real-ip': '1.1.1.1' },
  });
}

// Sección 7.1 y criterio de aceptación de la sección 17.3.
describe('GET /api/health', () => {
  it('responde con la forma exacta de la sección 7.1', async () => {
    const response = await buildHandler()(getRequest());
    const body = (await response.json()) as HealthResponseBody;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: 'ok',
      service: 'trip-planner-backend',
      timestamp: NOW.toISOString(),
    });
  });

  it('devuelve 405 ante un método que no es GET', async () => {
    const response = await buildHandler()(
      new Request('https://ejemplo.test/api/health', { method: 'POST' }),
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('devuelve 429 al superar el tope de peticiones', async () => {
    const handler = buildHandler(new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1 }));

    expect((await handler(getRequest())).status).toBe(200);
    expect((await handler(getRequest())).status).toBe(429);
  });
});
