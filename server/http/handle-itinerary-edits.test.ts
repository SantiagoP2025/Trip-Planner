import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionResult, SessionVerifier } from '../auth/session.js';
import { MAX_EDIT_TITLE_LENGTH } from '../config/trip-limits.js';
import type { SavedTripRepository } from '../repositories/saved-trip.repository.js';
import {
  buildSavedTrip,
  FakeSavedTripRepository,
  FIXTURE_SAVED_ID,
  FIXTURE_USER,
} from '../repositories/test-fixtures.js';
import type {
  ApiErrorBody,
  DeleteItineraryEditResponseBody,
  ItineraryEditResponseBody,
} from '../types/api.js';
import type { ItineraryItem } from '../types/itinerary.js';
import type { TripProposal } from '../types/trip.js';
import { createItineraryEditsHandler } from './handle-itinerary-edits.js';
import { FixedWindowRateLimiter, type RateLimiter } from './rate-limit.js';

const ITEM_ID = '2026-09-11-meal-dinner';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function item(overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  return {
    id: ITEM_ID,
    startTime: '2026-09-11T20:00:00.000Z',
    endTime: '2026-09-11T21:30:00.000Z',
    type: 'meal',
    title: 'Cena',
    durationMinutes: 90,
    verificationStatus: 'unverified',
    ...overrides,
  };
}

// Viaje guardado con un itinerario de un día y un bloque editable.
function tripWithItinerary(items: ItineraryItem[] = [item()]) {
  return buildSavedTrip({
    proposal: {
      id: 'recommended-1',
      itinerary: [{ date: '2026-09-11', items }],
    } as unknown as TripProposal,
  });
}

function repositoryWithTrip(items?: ItineraryItem[]): FakeSavedTripRepository {
  const repository = new FakeSavedTripRepository();
  repository.savedTrip = tripWithItinerary(items);
  return repository;
}

function verifierReturning(result: SessionResult): SessionVerifier {
  return { verify: async () => result };
}

const AUTHENTICATED = verifierReturning({ status: 'authenticated', user: FIXTURE_USER });

function permissiveLimiter(): RateLimiter {
  return new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1_000 });
}

function buildHandler(
  overrides: {
    repository?: SavedTripRepository;
    sessionVerifier?: SessionVerifier;
    rateLimiter?: RateLimiter;
  } = {},
) {
  return createItineraryEditsHandler({
    repository: overrides.repository ?? repositoryWithTrip(),
    sessionVerifier: overrides.sessionVerifier ?? AUTHENTICATED,
    rateLimiter: overrides.rateLimiter ?? permissiveLimiter(),
  });
}

function request(
  method: string,
  options: { body?: unknown; token?: string | null; query?: string } = {},
): Request {
  const url = `https://ejemplo.test/api/trips/itinerary-edits${options.query ?? ''}`;
  const headers: Record<string, string> = { 'x-real-ip': '1.1.1.1' };

  if (options.token !== null) headers.authorization = `Bearer ${options.token ?? 'token'}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  return new Request(url, {
    method,
    headers,
    ...(options.body === undefined
      ? {}
      : { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) }),
  });
}

function editBody(overrides: Record<string, unknown> = {}) {
  return { savedTripId: FIXTURE_SAVED_ID, itemId: ITEM_ID, ...overrides };
}

// Sección 8.2: "Aceptar únicamente métodos HTTP previstos".
describe('/api/trips/itinerary-edits — método', () => {
  it('devuelve 405 y la cabecera Allow ante un método no previsto', async () => {
    const handler = buildHandler();

    for (const method of ['GET', 'POST', 'PATCH']) {
      const response = await handler(request(method));

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('PUT, DELETE');
    }
  });
});

// Sección 8.2: "Añadir autenticación antes de permitir acceso a viajes privados".
describe('/api/trips/itinerary-edits — autenticación', () => {
  it('devuelve 401 sin sesión, en los dos métodos', async () => {
    const handler = buildHandler({
      sessionVerifier: verifierReturning({ status: 'anonymous' }),
    });

    for (const call of [
      request('PUT', { token: null, body: editBody({ title: 'La Tasquita' }) }),
      request('DELETE', {
        token: null,
        query: `?savedTripId=${FIXTURE_SAVED_ID}&itemId=${ITEM_ID}`,
      }),
    ]) {
      const response = await handler(call);

      expect(response.status).toBe(401);
      expect(((await response.json()) as ApiErrorBody).error.code).toBe('UNAUTHORIZED');
    }
  });

  it('no escribe nada cuando no hay sesión', async () => {
    const repository = repositoryWithTrip();
    const handler = buildHandler({
      repository,
      sessionVerifier: verifierReturning({ status: 'anonymous' }),
    });

    await handler(request('PUT', { body: editBody({ title: 'La Tasquita' }) }));

    expect(repository.upserts).toHaveLength(0);
  });

  it('devuelve 500, y no 401, cuando no se puede comprobar la sesión', async () => {
    const handler = buildHandler({
      sessionVerifier: verifierReturning({
        status: 'unavailable',
        error: new Error('Supabase no responde'),
      }),
    });

    const response = await handler(request('PUT', { body: editBody({ title: 'Algo' }) }));

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('Supabase no responde');
  });
});

describe('PUT /api/trips/itinerary-edits', () => {
  // Regla 14: lo que el usuario escribe se guarda contra el servidor.
  it('guarda la edición y devuelve lo guardado', async () => {
    const repository = repositoryWithTrip();
    const response = await buildHandler({ repository })(
      request('PUT', { body: editBody({ title: 'La Tasquita', description: 'Calle Mayor 3' }) }),
    );
    const body = (await response.json()) as ItineraryEditResponseBody;

    expect(response.status).toBe(200);
    expect(body.edit).toMatchObject({
      itemId: ITEM_ID,
      title: 'La Tasquita',
      description: 'Calle Mayor 3',
    });
    expect(repository.upserts).toHaveLength(1);
  });

  it('deja reescribir solo la descripción', async () => {
    const repository = repositoryWithTrip();
    await buildHandler({ repository })(
      request('PUT', { body: editBody({ description: 'Hemos reservado a las 21:00' }) }),
    );

    expect(repository.upserts[0]?.edit).toEqual({
      itemId: ITEM_ID,
      description: 'Hemos reservado a las 21:00',
    });
  });

  // Prueba obligatoria de la fase: una edición vacía o idéntica al original no
  // cuenta como edición.
  it('una edición idéntica al original vuelve al original en vez de guardarse', async () => {
    const repository = repositoryWithTrip();
    const response = await buildHandler({ repository })(
      request('PUT', { body: editBody({ title: 'Cena' }) }),
    );
    const body = (await response.json()) as ItineraryEditResponseBody;

    expect(response.status).toBe(200);
    expect(body.edit).toBeNull();
    expect(repository.upserts).toHaveLength(0);
    expect(repository.editDeletes).toHaveLength(1);
  });

  it('una edición vacía vuelve al original', async () => {
    const repository = repositoryWithTrip();
    const response = await buildHandler({ repository })(
      request('PUT', { body: editBody({ title: '   ', description: '' }) }),
    );

    expect(((await response.json()) as ItineraryEditResponseBody).edit).toBeNull();
    expect(repository.upserts).toHaveLength(0);
  });

  it('guarda solo el campo que de verdad cambia', async () => {
    const repository = repositoryWithTrip([item({ description: 'Sin restaurante asignado' })]);
    await buildHandler({ repository })(
      request('PUT', {
        body: editBody({ title: 'Cena', description: 'La Tasquita, a las 21:00' }),
      }),
    );

    expect(repository.upserts[0]?.edit).toEqual({
      itemId: ITEM_ID,
      description: 'La Tasquita, a las 21:00',
    });
  });

  // Solo se edita lo que el motor ha generado.
  it('devuelve 404 si el bloque no existe en el itinerario', async () => {
    const response = await buildHandler()(
      request('PUT', { body: editBody({ itemId: 'inventado', title: 'Algo' }) }),
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(404);
    expect(body.error.message).toContain('no existe en el itinerario');
  });

  // No existe y es de otro se contestan igual: si se distinguieran, este
  // endpoint serviría para averiguar qué viajes tienen los demás.
  it('devuelve 404 si el viaje no es del usuario', async () => {
    const repository = new FakeSavedTripRepository();
    repository.savedTrip = null;

    const response = await buildHandler({ repository })(
      request('PUT', { body: editBody({ title: 'Algo' }) }),
    );

    expect(response.status).toBe(404);
  });

  it('busca el viaje siempre acotando por el usuario de la sesión', async () => {
    const repository = repositoryWithTrip();
    await buildHandler({ repository })(request('PUT', { body: editBody({ title: 'Algo' }) }));

    expect(repository.lookups).toEqual([
      { savedTripId: FIXTURE_SAVED_ID, userId: FIXTURE_USER.id },
    ]);
  });

  // Regla 5 de CLAUDE.md: todo texto libre lleva tope.
  it('devuelve 400 con un título por encima del tope', async () => {
    const response = await buildHandler()(
      request('PUT', { body: editBody({ title: 'a'.repeat(MAX_EDIT_TITLE_LENGTH + 1) }) }),
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.details?.some((detail) => detail.field === 'title')).toBe(true);
  });

  it('devuelve 400 con un identificador de viaje que no es un uuid', async () => {
    const response = await buildHandler()(
      request('PUT', { body: editBody({ savedTripId: 'no-es-uuid', title: 'Algo' }) }),
    );

    expect(response.status).toBe(400);
  });

  it('devuelve 400 ante un JSON mal formado', async () => {
    const response = await buildHandler()(request('PUT', { body: '{"savedTripId":' }));

    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiErrorBody).error.code).toBe('INVALID_REQUEST');
  });

  // Prueba obligatoria de la fase: un fallo al guardar avisa al usuario. Aquí no
  // hay best-effort: perder en silencio lo que alguien acaba de escribir es peor
  // que perder un dato generado, porque no se puede volver a calcular.
  it('devuelve 500 si la base de datos falla, sin fingir que se guardó', async () => {
    const repository = repositoryWithTrip();
    repository.upsertEdit = () => Promise.reject(new Error('contraseña de postgres incorrecta'));

    const response = await buildHandler({ repository })(
      request('PUT', { body: editBody({ title: 'La Tasquita' }) }),
    );
    const raw = await response.text();

    expect(response.status).toBe(500);
    expect(raw).not.toContain('postgres');
    expect(raw).not.toContain('contraseña');
  });
});

describe('DELETE /api/trips/itinerary-edits', () => {
  // Prueba obligatoria de la fase: se puede volver al original.
  it('deshace la edición del bloque', async () => {
    const repository = repositoryWithTrip();
    const response = await buildHandler({ repository })(
      request('DELETE', { query: `?savedTripId=${FIXTURE_SAVED_ID}&itemId=${ITEM_ID}` }),
    );
    const body = (await response.json()) as DeleteItineraryEditResponseBody;

    expect(response.status).toBe(200);
    expect(body.itemId).toBe(ITEM_ID);
    expect(repository.editDeletes).toEqual([
      { savedTripId: FIXTURE_SAVED_ID, itemId: ITEM_ID },
    ]);
  });

  // Deshacer algo ya deshecho no es un error: el resultado es el que el usuario
  // quería, y obligar al frontend a distinguir los dos casos no aporta nada.
  it('deshacer dos veces no falla', async () => {
    const repository = repositoryWithTrip();
    repository.editDeleted = false;

    const response = await buildHandler({ repository })(
      request('DELETE', { query: `?savedTripId=${FIXTURE_SAVED_ID}&itemId=${ITEM_ID}` }),
    );

    expect(response.status).toBe(200);
  });

  it('devuelve 400 si faltan los parámetros', async () => {
    const handler = buildHandler();

    expect((await handler(request('DELETE'))).status).toBe(400);
    expect(
      (await handler(request('DELETE', { query: `?savedTripId=${FIXTURE_SAVED_ID}` }))).status,
    ).toBe(400);
  });

  it('devuelve 404 si el viaje no es del usuario', async () => {
    const repository = new FakeSavedTripRepository();
    repository.savedTrip = null;

    const response = await buildHandler({ repository })(
      request('DELETE', { query: `?savedTripId=${FIXTURE_SAVED_ID}&itemId=${ITEM_ID}` }),
    );

    expect(response.status).toBe(404);
    expect(repository.editDeletes).toHaveLength(0);
  });
});

describe('/api/trips/itinerary-edits — límite de peticiones', () => {
  it('devuelve 429 al superar el tope', async () => {
    const handler = buildHandler({
      rateLimiter: new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1 }),
    });

    expect((await handler(request('PUT', { body: editBody({ title: 'Uno' }) }))).status).toBe(200);
    expect((await handler(request('PUT', { body: editBody({ title: 'Dos' }) }))).status).toBe(429);
  });

  it('frena antes de comprobar la sesión', async () => {
    const verify = vi.fn(async (): Promise<SessionResult> => ({
      status: 'authenticated',
      user: FIXTURE_USER,
    }));
    const handler = buildHandler({
      sessionVerifier: { verify },
      rateLimiter: new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1 }),
    });

    await handler(request('PUT', { body: editBody({ title: 'Uno' }) }));
    await handler(request('PUT', { body: editBody({ title: 'Dos' }) }));

    expect(verify).toHaveBeenCalledTimes(1);
  });
});
