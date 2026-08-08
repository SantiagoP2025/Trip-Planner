import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionResult, SessionVerifier } from '../auth/session.ts';
import { MAX_REQUEST_BODY_BYTES } from '../config/limits.ts';
import { MAX_SAVED_TRIPS_PER_USER } from '../config/trip-limits.ts';
import type { SavedTripRepository } from '../repositories/saved-trip.repository.ts';
import {
  buildSavedTrip as savedTrip,
  FakeSavedTripRepository,
} from '../repositories/test-fixtures.ts';
import type {
  ApiErrorBody,
  DeleteSavedTripResponseBody,
  SaveTripResponseBody,
  SavedTripsResponseBody,
} from '../types/api.ts';
import { createSavedTripsHandler } from './handle-saved-trips.ts';
import { FixedWindowRateLimiter, type RateLimiter } from './rate-limit.ts';

const USER = { id: 'usuario-1', email: 'alguien@ejemplo.test' };
const OTHER_USER_ID = 'usuario-2';
const TRIP_ID = '3f1a5a1e-8b1a-4a4e-9a4c-0f0b2d3e4a5b';
const SAVED_ID = '7c2b6b2f-9c2b-4b5f-8b5d-1a1c3e4f5a6b';

beforeEach(() => {
  // Los handlers registran en consola; el test no necesita ver el ruido.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function verifierReturning(result: SessionResult): SessionVerifier {
  return { verify: async () => result };
}

const AUTHENTICATED = verifierReturning({ status: 'authenticated', user: USER });

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
  return createSavedTripsHandler({
    repository: overrides.repository ?? new FakeSavedTripRepository(),
    sessionVerifier: overrides.sessionVerifier ?? AUTHENTICATED,
    rateLimiter: overrides.rateLimiter ?? permissiveLimiter(),
  });
}

function request(
  method: string,
  options: { body?: unknown; token?: string | null; query?: string; ip?: string } = {},
): Request {
  const url = `https://ejemplo.test/api/trips/saved${options.query ?? ''}`;
  const headers: Record<string, string> = { 'x-real-ip': options.ip ?? '1.1.1.1' };

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

function saveBody(overrides: Record<string, unknown> = {}) {
  return { tripId: TRIP_ID, proposalType: 'recommended', ...overrides };
}

// Sección 8.2: "Aceptar únicamente métodos HTTP previstos".
describe('/api/trips/saved — método', () => {
  it('devuelve 405 y la cabecera Allow ante un método no previsto', async () => {
    const handler = buildHandler();

    for (const method of ['PUT', 'PATCH', 'HEAD']) {
      const response = await handler(request(method));
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, POST, DELETE');
    }
  });

  it('no gasta cuota de peticiones en un método no permitido', async () => {
    const handler = buildHandler({
      rateLimiter: new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1 }),
    });

    await handler(request('PUT'));

    expect((await handler(request('GET'))).status).toBe(200);
  });
});

// Sección 8.2: "Añadir autenticación antes de permitir acceso a viajes privados".
describe('/api/trips/saved — autenticación', () => {
  it('devuelve 401 sin sesión, en los tres métodos', async () => {
    const handler = buildHandler({ sessionVerifier: verifierReturning({ status: 'anonymous' }) });

    for (const call of [
      request('GET', { token: null }),
      request('POST', { token: null, body: saveBody() }),
      request('DELETE', { token: null, query: `?id=${SAVED_ID}` }),
    ]) {
      const response = await handler(call);
      const body = (await response.json()) as ApiErrorBody;

      expect(response.status).toBe(401);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(response.headers.get('www-authenticate')).toBe('Bearer');
    }
  });

  it('no toca la base de datos cuando no hay sesión', async () => {
    const repository = new FakeSavedTripRepository();
    const handler = buildHandler({
      repository,
      sessionVerifier: verifierReturning({ status: 'anonymous' }),
    });

    await handler(request('POST', { body: saveBody() }));

    expect(repository.savedRecords).toHaveLength(0);
    expect(repository.listedFor).toHaveLength(0);
  });

  // Una caída de Supabase no puede contarse como "tu sesión ha caducado".
  it('devuelve 500, y no 401, cuando no se puede comprobar la sesión', async () => {
    const handler = buildHandler({
      sessionVerifier: verifierReturning({
        status: 'unavailable',
        error: new Error('el servicio de autenticación no responde'),
      }),
    });

    const response = await handler(request('GET'));
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    // CLAUDE.md: al usuario nunca le llega el detalle técnico.
    expect(body.error.message).not.toContain('autenticación no responde');
  });
});

describe('GET /api/trips/saved', () => {
  it('devuelve los viajes guardados del usuario de la sesión', async () => {
    const repository = new FakeSavedTripRepository();
    repository.trips = [savedTrip()];

    const response = await buildHandler({ repository })(request('GET'));
    const body = (await response.json()) as SavedTripsResponseBody;

    expect(response.status).toBe(200);
    expect(body.savedTrips).toHaveLength(1);
    expect(body.savedTrips[0]?.title).toBe('Valencia → Lisboa');
    expect(body.requestId.length).toBeGreaterThan(0);
  });

  // Regla 5: ninguna lectura sin tope.
  it('pide la lista del usuario de la sesión y con tope', async () => {
    const repository = new FakeSavedTripRepository();

    await buildHandler({ repository })(request('GET'));

    expect(repository.listedFor).toEqual([
      { userId: USER.id, limit: MAX_SAVED_TRIPS_PER_USER },
    ]);
  });

  it('no se guarda en ninguna caché intermedia', async () => {
    const response = await buildHandler()(request('GET'));

    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('POST /api/trips/saved', () => {
  // Sección 16.1: "201 — Viaje generado y guardado". Aquí sí se puede prometer.
  it('guarda la propuesta y devuelve 201', async () => {
    const repository = new FakeSavedTripRepository();
    const response = await buildHandler({ repository })(request('POST', { body: saveBody() }));
    const body = (await response.json()) as SaveTripResponseBody;

    expect(response.status).toBe(201);
    expect(body.savedTrip.id).toBe(SAVED_ID);
    expect(repository.savedRecords).toEqual([
      {
        userId: USER.id,
        tripRequestId: TRIP_ID,
        tripProposalId: 'propuesta-1',
        title: 'Valencia → Lisboa',
      },
    ]);
  });

  it('usa el título que escribe el usuario cuando lo manda', async () => {
    const repository = new FakeSavedTripRepository();
    await buildHandler({ repository })(
      request('POST', { body: saveBody({ title: 'Puente de mayo' }) }),
    );

    expect(repository.savedRecords[0]?.title).toBe('Puente de mayo');
  });

  // Sección 8.2: "No confiar en cálculos enviados por el frontend". La propuesta
  // se lee de la base de datos tal como la calculó el servidor.
  it('no guarda nada de lo que venga en el cuerpo además de los identificadores', async () => {
    const repository = new FakeSavedTripRepository();
    await buildHandler({ repository })(
      request('POST', {
        body: saveBody({ proposal: { id: 'inventada', estimatedTotal: 12 }, estimatedTotal: 12 }),
      }),
    );

    expect(JSON.stringify(repository.savedRecords)).not.toContain('inventada');
  });

  it('devuelve 400 con el campo que falla cuando el cuerpo no es válido', async () => {
    const response = await buildHandler()(
      request('POST', { body: saveBody({ proposalType: 'la-barata' }) }),
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.some((detail) => detail.field === 'proposalType')).toBe(true);
  });

  it('devuelve 400 ante un JSON mal formado', async () => {
    const response = await buildHandler()(request('POST', { body: '{"tripId":' }));

    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiErrorBody).error.code).toBe('INVALID_REQUEST');
  });

  // Sección 8.2: "Validar tamaño y contenido del body".
  it('devuelve 400 cuando el cuerpo supera el tope de tamaño', async () => {
    const response = await buildHandler()(
      request('POST', { body: saveBody({ relleno: 'a'.repeat(MAX_REQUEST_BODY_BYTES) }) }),
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.message).toContain('demasiado grande');
  });

  it('devuelve 404 cuando la solicitud no existe', async () => {
    const repository = new FakeSavedTripRepository();
    repository.tripRequest = null;

    const response = await buildHandler({ repository })(request('POST', { body: saveBody() }));

    expect(response.status).toBe(404);
    expect(((await response.json()) as ApiErrorBody).error.code).toBe('NOT_FOUND');
  });

  // Sección 16.1: "403 — Usuario sin permiso". La clave de servicio con la que
  // escribe el servidor salta Row Level Security, así que esta comprobación es
  // la que de verdad impide guardarse el viaje de otro.
  it('devuelve 403 cuando la solicitud es de otro usuario', async () => {
    const repository = new FakeSavedTripRepository();
    repository.tripRequest = { ...repository.tripRequest!, userId: OTHER_USER_ID };

    const response = await buildHandler({ repository })(request('POST', { body: saveBody() }));

    expect(response.status).toBe(403);
    expect(repository.savedRecords).toHaveLength(0);
  });

  it('no revela nada del dueño en el mensaje del 403', async () => {
    const repository = new FakeSavedTripRepository();
    repository.tripRequest = { ...repository.tripRequest!, userId: OTHER_USER_ID };

    const response = await buildHandler({ repository })(request('POST', { body: saveBody() }));
    const body = (await response.json()) as ApiErrorBody;

    expect(body.error.message).not.toContain(OTHER_USER_ID);
  });

  it('explica qué hacer cuando el viaje se generó sin sesión iniciada', async () => {
    const repository = new FakeSavedTripRepository();
    repository.tripRequest = { ...repository.tripRequest!, userId: null };

    const response = await buildHandler({ repository })(request('POST', { body: saveBody() }));
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(403);
    expect(body.error.message).toContain('iniciado sesión');
  });

  it('devuelve 404 cuando la propuesta pedida no está en esa solicitud', async () => {
    const repository = new FakeSavedTripRepository();
    repository.proposalId = null;

    const response = await buildHandler({ repository })(request('POST', { body: saveBody() }));

    expect(response.status).toBe(404);
  });

  // Regla 5 de CLAUDE.md: tope duro también aquí.
  it('devuelve 400 al alcanzar el máximo de viajes guardados', async () => {
    const repository = new FakeSavedTripRepository();
    repository.count = MAX_SAVED_TRIPS_PER_USER;

    const response = await buildHandler({ repository })(request('POST', { body: saveBody() }));
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('SAVED_TRIPS_LIMIT');
    expect(repository.savedRecords).toHaveLength(0);
  });

  // El tope cuenta filas nuevas: renombrar lo que ya está guardado no hace
  // crecer nada y no tiene por qué chocar contra el límite.
  it('deja renombrar un viaje ya guardado aunque se esté en el tope', async () => {
    const repository = new FakeSavedTripRepository();
    repository.count = MAX_SAVED_TRIPS_PER_USER;
    repository.existingSavedId = SAVED_ID;

    const response = await buildHandler({ repository })(
      request('POST', { body: saveBody({ title: 'Otro nombre' }) }),
    );

    expect(response.status).toBe(201);
    expect(repository.savedRecords[0]?.title).toBe('Otro nombre');
  });

  // Aquí no hay best-effort: guardar es la operación entera, así que un fallo se
  // ve. Un viaje que el usuario cree haber guardado y no está es exactamente lo
  // que la regla 9 viene a evitar.
  it('devuelve 500 cuando la base de datos falla, sin fingir que se guardó', async () => {
    const repository = new FakeSavedTripRepository();
    repository.save = () => Promise.reject(new Error('contraseña de postgres incorrecta'));

    const response = await buildHandler({ repository })(request('POST', { body: saveBody() }));
    const raw = await response.text();

    expect(response.status).toBe(500);
    expect(raw).not.toContain('postgres');
    expect(raw).not.toContain('contraseña');
  });
});

describe('DELETE /api/trips/saved', () => {
  it('borra el viaje y devuelve su identificador', async () => {
    const repository = new FakeSavedTripRepository();
    const response = await buildHandler({ repository })(
      request('DELETE', { query: `?id=${SAVED_ID}` }),
    );
    const body = (await response.json()) as DeleteSavedTripResponseBody;

    expect(response.status).toBe(200);
    expect(body.deletedId).toBe(SAVED_ID);
    expect(repository.deleteCalls).toEqual([{ savedTripId: SAVED_ID, userId: USER.id }]);
  });

  it('devuelve 400 cuando falta el identificador o no es válido', async () => {
    const handler = buildHandler();

    expect((await handler(request('DELETE'))).status).toBe(400);
    expect((await handler(request('DELETE', { query: '?id=no-es-uuid' }))).status).toBe(400);
  });

  // Distinguir "no existe" de "es de otro" convertiría este endpoint en una
  // forma de averiguar qué viajes tienen los demás.
  it('devuelve 404 tanto si no existe como si es de otro usuario', async () => {
    const repository = new FakeSavedTripRepository();
    repository.deleted = false;

    const response = await buildHandler({ repository })(
      request('DELETE', { query: `?id=${SAVED_ID}` }),
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('borra siempre acotando por el usuario de la sesión', async () => {
    const repository = new FakeSavedTripRepository();
    await buildHandler({ repository })(request('DELETE', { query: `?id=${SAVED_ID}` }));

    expect(repository.deleteCalls[0]?.userId).toBe(USER.id);
  });
});

// Sección 8.2: comprobar la sesión cuesta una ida y vuelta a Supabase, así que
// quien insiste no puede pagarla con nuestro presupuesto de peticiones.
describe('/api/trips/saved — límite de peticiones', () => {
  it('devuelve 429 y Retry-After al superar el tope', async () => {
    const handler = buildHandler({
      rateLimiter: new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1 }),
    });

    expect((await handler(request('GET'))).status).toBe(200);

    const blocked = await handler(request('GET'));
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as ApiErrorBody).error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('frena antes de comprobar la sesión', async () => {
    const verify = vi.fn(async (): Promise<SessionResult> => ({
      status: 'authenticated',
      user: USER,
    }));
    const handler = buildHandler({
      sessionVerifier: { verify },
      rateLimiter: new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1 }),
    });

    await handler(request('GET'));
    await handler(request('GET'));

    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('cuenta el límite por IP', async () => {
    const handler = buildHandler({
      rateLimiter: new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1 }),
    });

    expect((await handler(request('GET', { ip: '1.1.1.1' }))).status).toBe(200);
    expect((await handler(request('GET', { ip: '1.1.1.1' }))).status).toBe(429);
    expect((await handler(request('GET', { ip: '2.2.2.2' }))).status).toBe(200);
  });
});
