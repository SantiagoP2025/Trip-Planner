import { describe, expect, it } from 'vitest';
import type { ApiErrorBody, ApiErrorCode } from '../types/api.js';
import { errorResponse, jsonResponse, statusForErrorCode } from './responses.js';

describe('statusForErrorCode', () => {
  // Sección 16.1: la tabla de códigos de la especificación, tal cual.
  it('traduce cada código al estado HTTP de la sección 16.1', () => {
    const expected: Record<ApiErrorCode, number> = {
      INVALID_REQUEST: 400,
      VALIDATION_ERROR: 400,
      // Sin fila propia en la tabla: haber alcanzado el máximo de viajes
      // guardados es una solicitud que no se puede atender tal como viene.
      SAVED_TRIPS_LIMIT: 400,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      METHOD_NOT_ALLOWED: 405,
      RATE_LIMITED: 429,
      PROVIDER_ERROR: 502,
      INTERNAL_ERROR: 500,
    };

    for (const [code, status] of Object.entries(expected)) {
      expect(statusForErrorCode(code as ApiErrorCode)).toBe(status);
    }
  });
});

describe('jsonResponse', () => {
  it('responde como JSON y sin caché', async () => {
    const response = jsonResponse(200, { hola: 'mundo' });

    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ hola: 'mundo' });
  });
});

describe('errorResponse', () => {
  it('lleva el identificador de petición y un mensaje en español', async () => {
    const response = errorResponse('INTERNAL_ERROR', 'req-1');
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.requestId).toBe('req-1');
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  // CLAUDE.md: al usuario, mensaje claro y sin detalles técnicos. El error
  // interno no puede filtrar ni el fallo original ni su traza.
  it('no filtra detalles técnicos en el error interno', async () => {
    const response = errorResponse('INTERNAL_ERROR', 'req-1');
    const raw = await response.text();

    expect(raw).not.toContain('stack');
    expect(raw).not.toContain('Error:');
  });

  it('omite el campo de detalles cuando no hay ninguno', async () => {
    const body = (await errorResponse('INVALID_REQUEST', 'req-1', {
      details: [],
    }).json()) as ApiErrorBody;

    expect(body.error.details).toBeUndefined();
  });

  it('incluye los detalles de validación cuando los hay', async () => {
    const body = (await errorResponse('VALIDATION_ERROR', 'req-1', {
      details: [{ field: 'budget', message: 'El presupuesto debe ser mayor que 0.' }],
    }).json()) as ApiErrorBody;

    expect(body.error.details).toEqual([
      { field: 'budget', message: 'El presupuesto debe ser mayor que 0.' },
    ]);
  });
});
