import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_REQUEST_BODY_BYTES } from '../config/limits.ts';
import { MockAccommodationProvider } from '../providers/mock-accommodation.provider.ts';
import { MockFlightProvider } from '../providers/mock-flight.provider.ts';
import { MockPlacesProvider } from '../providers/mock-places.provider.ts';
import type { AccommodationProvider } from '../providers/accommodation.provider.ts';
import type { FlightProvider } from '../providers/flight.provider.ts';
import type { PlacesProvider } from '../providers/places.provider.ts';
import type {
  NewTripRequest,
  TripGenerationOutcome,
  TripRepository,
} from '../repositories/trip.repository.ts';
import {
  BestEffortTripPersistence,
  type TripPersistence,
} from '../services/trip-persistence.service.ts';
import type { TripPlannerProviders } from '../services/trip-planner.service.ts';
import type { ApiErrorBody, GenerateTripResponseBody } from '../types/api.ts';
import type { FlightOffer } from '../types/flight.ts';
import { createGenerateTripHandler } from './handle-generate-trip.ts';
import { FixedWindowRateLimiter, type RateLimiter } from './rate-limit.ts';

// El esquema compara la fecha de salida con "hoy", así que el reloj del sistema
// se congela: sin esto, el test caducaría solo al llegar septiembre de 2026.
const NOW = new Date('2026-08-07T10:00:00.000Z');
const FIXED_CLOCK = () => NOW;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  // Los handlers registran en consola; el test no necesita ver el ruido.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mockProviders(): TripPlannerProviders {
  return {
    flights: new MockFlightProvider(FIXED_CLOCK),
    accommodations: new MockAccommodationProvider(FIXED_CLOCK),
    places: new MockPlacesProvider(),
  };
}

function permissiveLimiter(): RateLimiter {
  return new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1_000 });
}

function buildHandler(
  overrides: {
    providers?: TripPlannerProviders;
    rateLimiter?: RateLimiter;
    persistence?: TripPersistence;
  } = {},
) {
  return createGenerateTripHandler({
    providers: overrides.providers ?? mockProviders(),
    rateLimiter: overrides.rateLimiter ?? permissiveLimiter(),
    ...(overrides.persistence ? { persistence: overrides.persistence } : {}),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    origin: 'Valencia',
    destination: 'Lisboa',
    departureDate: '2026-09-10',
    returnDate: '2026-09-17',
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

function postRequest(
  body: unknown,
  init: { headers?: Record<string, string>; ip?: string } = {},
): Request {
  return new Request('https://ejemplo.test/api/trips/generate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-real-ip': init.ip ?? '1.1.1.1',
      ...init.headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// Sección 8.2: "Aceptar únicamente métodos HTTP previstos".
describe('POST /api/trips/generate — método', () => {
  it('devuelve 405 y la cabecera Allow ante un método que no es POST', async () => {
    const handler = buildHandler();

    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
      const response = await handler(
        new Request('https://ejemplo.test/api/trips/generate', { method }),
      );

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('POST');
      const body = (await response.json()) as ApiErrorBody;
      expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
    }
  });

  it('no gasta cuota de peticiones en un método no permitido', async () => {
    const rateLimiter = new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    const handler = buildHandler({ rateLimiter });

    await handler(new Request('https://ejemplo.test/api/trips/generate', { method: 'GET' }));
    const response = await handler(postRequest(validBody()));

    expect(response.status).toBe(200);
  });
});

// Sección 8.2: "Validar tamaño y contenido del body".
describe('POST /api/trips/generate — cuerpo inválido', () => {
  it('devuelve 400 ante un JSON mal formado', async () => {
    const response = await buildHandler()(postRequest('{"origin":'));
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('devuelve 400 cuando el cuerpo no se envía como JSON', async () => {
    const response = await buildHandler()(
      postRequest('origin=Valencia', { headers: { 'content-type': 'text/plain' } }),
    );

    const body = (await response.json()) as ApiErrorBody;
    expect(response.status).toBe(400);
    expect(body.error.message).toContain('JSON');
  });

  // Regla 5 de CLAUDE.md: tope duro de tamaño del body.
  it('devuelve 400 cuando el cuerpo supera el tope de tamaño', async () => {
    const response = await buildHandler()(
      postRequest(validBody({ relleno: 'a'.repeat(MAX_REQUEST_BODY_BYTES) })),
    );

    const body = (await response.json()) as ApiErrorBody;
    expect(response.status).toBe(400);
    expect(body.error.message).toContain('demasiado grande');
  });
});

// Sección 16.1: "400 — Solicitud inválida", con el detalle de qué campo falla.
describe('POST /api/trips/generate — validación', () => {
  it('devuelve 400 con el campo y el motivo cuando un dato no es válido', async () => {
    const response = await buildHandler()(postRequest(validBody({ budget: 0 })));
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toBeDefined();
    expect(body.error.details?.some((detail) => detail.field === 'budget')).toBe(true);
  });

  it('devuelve todos los campos que fallan, no solo el primero', async () => {
    const response = await buildHandler()(
      postRequest(validBody({ budget: -1, origin: 'a', currency: 'YEN' })),
    );
    const body = (await response.json()) as ApiErrorBody;

    const fields = new Set(body.error.details?.map((detail) => detail.field));
    expect(fields.has('budget')).toBe(true);
    expect(fields.has('origin')).toBe(true);
    expect(fields.has('currency')).toBe(true);
  });

  // Regla 5 de CLAUDE.md: el viaje de cien años que generaba 36.000 días de
  // itinerario y tumbaba la función.
  it('rechaza un viaje de cien años sin llegar a generar nada', async () => {
    const response = await buildHandler()(
      postRequest(validBody({ returnDate: '2126-09-10' })),
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.details?.some((detail) => detail.field === 'returnDate')).toBe(true);
  });

  it('rechaza una fecha de salida anterior a hoy', async () => {
    const response = await buildHandler()(postRequest(validBody({
      departureDate: '2020-01-01',
      returnDate: '2020-01-08',
    })));
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.details?.some((detail) => detail.field === 'departureDate')).toBe(true);
  });

  // Sección 8.2: "No confiar en cálculos enviados por el frontend".
  it('ignora los costes y puntuaciones que llegan en el cuerpo', async () => {
    const response = await buildHandler()(
      postRequest(validBody({ estimatedTotal: 1, proposals: [{ id: 'inventada' }] })),
    );
    const body = (await response.json()) as GenerateTripResponseBody;

    expect(response.status).toBe(200);
    expect(body.proposals.some((proposal) => proposal.id === 'inventada')).toBe(false);
    for (const proposal of body.proposals) {
      expect(proposal.estimatedTotal).toBeGreaterThan(1);
    }
  });
});

// Sección 8.2 y regla 3 de CLAUDE.md: el rate limiting entra en esta fase.
describe('POST /api/trips/generate — límite de peticiones', () => {
  it('devuelve 429 y Retry-After al superar el tope', async () => {
    const rateLimiter = new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 2 });
    const handler = buildHandler({ rateLimiter });

    expect((await handler(postRequest(validBody()))).status).toBe(200);
    expect((await handler(postRequest(validBody()))).status).toBe(200);

    const blocked = await handler(postRequest(validBody()));
    const body = (await blocked.json()) as ApiErrorBody;

    expect(blocked.status).toBe(429);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('cuenta el límite por IP', async () => {
    const rateLimiter = new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    const handler = buildHandler({ rateLimiter });

    expect((await handler(postRequest(validBody(), { ip: '1.1.1.1' }))).status).toBe(200);
    expect((await handler(postRequest(validBody(), { ip: '1.1.1.1' }))).status).toBe(429);
    expect((await handler(postRequest(validBody(), { ip: '2.2.2.2' }))).status).toBe(200);
  });

  it('frena antes de validar, para no hacer el trabajo caro de quien insiste', async () => {
    const rateLimiter = new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    const handler = buildHandler({ rateLimiter });

    await handler(postRequest(validBody()));
    // Cuerpo inválido: si el límite no fuera lo primero, saldría un 400.
    const response = await handler(postRequest('{"roto":'));

    expect(response.status).toBe(429);
  });

  it('deja pasar de nuevo cuando la ventana ha caducado', async () => {
    const rateLimiter = new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    const handler = buildHandler({ rateLimiter });

    expect((await handler(postRequest(validBody()))).status).toBe(200);
    expect((await handler(postRequest(validBody()))).status).toBe(429);

    vi.setSystemTime(new Date(NOW.getTime() + 60_001));

    expect((await handler(postRequest(validBody()))).status).toBe(200);
  });
});

// Sección 17.2: "Endpoint → mocks → motor → propuestas".
describe('POST /api/trips/generate — respuesta correcta', () => {
  it('devuelve tres propuestas distintas dentro del presupuesto', async () => {
    const response = await buildHandler()(postRequest(validBody()));
    const body = (await response.json()) as GenerateTripResponseBody;

    expect(response.status).toBe(200);
    expect(body.proposals).toHaveLength(3);
    expect(new Set(body.proposals.map((proposal) => proposal.type)).size).toBe(3);
    for (const proposal of body.proposals) {
      expect(proposal.estimatedTotal).toBeLessThanOrEqual(3000);
      expect(proposal.reasons.length).toBeGreaterThan(0);
    }
  });

  it('devuelve el identificador de petición y el momento de generación', async () => {
    const response = await buildHandler()(postRequest(validBody()));
    const body = (await response.json()) as GenerateTripResponseBody;

    expect(body.requestId.length).toBeGreaterThan(0);
    expect(body.generatedAt).toBe(NOW.toISOString());
  });

  // Sección 16.3: el diagnóstico del motor es material de log, no de respuesta.
  it('no devuelve el diagnóstico interno del motor', async () => {
    const raw = await (await buildHandler()(postRequest(validBody()))).text();

    expect(raw).not.toContain('discardReasons');
    expect(raw).not.toContain('providerDurationsMs');
  });

  it('no se guarda en ninguna caché intermedia', async () => {
    const response = await buildHandler()(postRequest(validBody()));

    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  // La misma búsqueda da siempre el mismo resultado: los mocks van con semilla.
  it('la misma búsqueda devuelve las mismas propuestas', async () => {
    const first = (await (await buildHandler()(postRequest(validBody()))).json()) as GenerateTripResponseBody;
    const second = (await (await buildHandler()(postRequest(validBody()))).json()) as GenerateTripResponseBody;

    expect(first.proposals.map((proposal) => proposal.id)).toEqual(
      second.proposals.map((proposal) => proposal.id),
    );
  });
});

// Sección 17.2: "Fallo de proveedor → respuesta controlada".
describe('POST /api/trips/generate — fallos', () => {
  function stubProviders(overrides: Partial<TripPlannerProviders>): TripPlannerProviders {
    const flights: FlightProvider = { searchFlights: async () => [] };
    const accommodations: AccommodationProvider = { searchAccommodations: async () => [] };
    const places: PlacesProvider = { searchActivities: async () => [] };

    return { flights, accommodations, places, ...overrides };
  }

  it('devuelve 502 cuando un proveedor externo falla', async () => {
    const handler = buildHandler({
      providers: stubProviders({
        flights: {
          searchFlights: () => Promise.reject(new Error('timeout de Amadeus')),
        },
      }),
    });

    const response = await handler(postRequest(validBody()));
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(502);
    expect(body.error.code).toBe('PROVIDER_ERROR');
    // CLAUDE.md: al usuario nunca le llega el detalle técnico.
    expect(body.error.message).not.toContain('Amadeus');
  });

  it('devuelve 500 ante un fallo inesperado', async () => {
    const handler = buildHandler({
      providers: stubProviders({
        // Un proveedor que incumple su contrato: el motor revienta al usarlo.
        flights: { searchFlights: async () => null as unknown as FlightOffer[] },
      }),
    });

    const response = await handler(postRequest(validBody()));
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.requestId.length).toBeGreaterThan(0);
  });

  // Que no haya propuestas viables no es un error: es la respuesta correcta.
  it('devuelve 200 y un mensaje cuando no hay ninguna propuesta viable', async () => {
    const handler = buildHandler({ providers: stubProviders({}) });

    const response = await handler(postRequest(validBody()));
    const body = (await response.json()) as GenerateTripResponseBody;

    expect(response.status).toBe(200);
    expect(body.proposals).toEqual([]);
    expect(body.message).toBeDefined();
  });
});

// Sección 17.2: "Endpoint → Supabase". Sin base de datos real: lo que se
// comprueba es qué le pide el endpoint al repositorio y, sobre todo, que un
// fallo de escritura no cambie ni una coma de lo que ve el usuario.
describe('POST /api/trips/generate — persistencia', () => {
  class RecordingRepository implements TripRepository {
    readonly created: NewTripRequest[] = [];
    readonly completed: { tripRequestId: string; outcome: TripGenerationOutcome }[] = [];

    async createTripRequest(record: NewTripRequest): Promise<string | null> {
      this.created.push(record);
      return 'solicitud-1';
    }

    async saveGenerationOutcome(
      tripRequestId: string,
      outcome: TripGenerationOutcome,
    ): Promise<void> {
      this.completed.push({ tripRequestId, outcome });
    }
  }

  function withRepository(repository: TripRepository): TripPersistence {
    return new BestEffortTripPersistence(repository);
  }

  it('guarda la solicitud y devuelve su identificador', async () => {
    const repository = new RecordingRepository();
    const response = await buildHandler({ persistence: withRepository(repository) })(
      postRequest(validBody()),
    );
    const body = (await response.json()) as GenerateTripResponseBody;

    expect(response.status).toBe(200);
    expect(body.tripId).toBe('solicitud-1');
    expect(repository.created).toHaveLength(1);
    expect(repository.created[0]?.request.destination).toBe('Lisboa');
  });

  // Las cuentas llegan en la fase 8; hasta entonces la fila no es de nadie.
  it('guarda la solicitud sin usuario mientras no haya cuentas', async () => {
    const repository = new RecordingRepository();
    await buildHandler({ persistence: withRepository(repository) })(postRequest(validBody()));

    expect(repository.created[0]?.userId).toBeNull();
  });

  it('cierra la solicitud como completada con sus propuestas', async () => {
    const repository = new RecordingRepository();
    await buildHandler({ persistence: withRepository(repository) })(postRequest(validBody()));

    const [completed] = repository.completed;
    expect(completed?.tripRequestId).toBe('solicitud-1');
    expect(completed?.outcome.status).toBe('completed');
    expect(completed?.outcome.proposals).toHaveLength(3);
    expect(completed?.outcome.diagnostics).not.toBeNull();
  });

  // Criterio de la fase 6: si la base de datos falla, el viaje se genera igual.
  it('devuelve las propuestas aunque la base de datos falle entera', async () => {
    const persistence = withRepository({
      createTripRequest: () => Promise.reject(new Error('base de datos caída')),
      saveGenerationOutcome: () => Promise.reject(new Error('base de datos caída')),
    });

    const response = await buildHandler({ persistence })(postRequest(validBody()));
    const body = (await response.json()) as GenerateTripResponseBody;

    expect(response.status).toBe(200);
    expect(body.proposals).toHaveLength(3);
    // Sin fila guardada no hay identificador que prometer.
    expect(body.tripId).toBeUndefined();
  });

  it('devuelve las propuestas aunque falle solo el cierre', async () => {
    const persistence = withRepository({
      createTripRequest: async () => 'solicitud-1',
      saveGenerationOutcome: () => Promise.reject(new Error('se cayó al guardar')),
    });

    const response = await buildHandler({ persistence })(postRequest(validBody()));
    const body = (await response.json()) as GenerateTripResponseBody;

    expect(response.status).toBe(200);
    expect(body.proposals).toHaveLength(3);
  });

  // CLAUDE.md: al usuario nunca le llega el detalle técnico.
  it('no filtra el error de base de datos en la respuesta', async () => {
    const persistence = withRepository({
      createTripRequest: () => Promise.reject(new Error('contraseña de postgres incorrecta')),
      saveGenerationOutcome: async () => {},
    });

    const raw = await (await buildHandler({ persistence })(postRequest(validBody()))).text();

    expect(raw).not.toContain('postgres');
    expect(raw).not.toContain('contraseña');
  });

  it('marca la solicitud como vacía cuando no hay propuestas viables', async () => {
    const repository = new RecordingRepository();
    const providers: TripPlannerProviders = {
      flights: { searchFlights: async () => [] },
      accommodations: { searchAccommodations: async () => [] },
      places: { searchActivities: async () => [] },
    };

    await buildHandler({ providers, persistence: withRepository(repository) })(
      postRequest(validBody()),
    );

    expect(repository.completed[0]?.outcome.status).toBe('empty');
  });

  // Sección 13.1: una solicitud no puede quedarse en `pending` como si la
  // generación siguiera viva cuando en realidad se cayó.
  it('cierra la solicitud como fallida y anota el proveedor culpable', async () => {
    const repository = new RecordingRepository();
    const providers: TripPlannerProviders = {
      flights: { searchFlights: () => Promise.reject(new Error('timeout de Amadeus')) },
      accommodations: { searchAccommodations: async () => [] },
      places: { searchActivities: async () => [] },
    };

    const response = await buildHandler({ providers, persistence: withRepository(repository) })(
      postRequest(validBody()),
    );

    expect(response.status).toBe(502);
    const [completed] = repository.completed;
    expect(completed?.outcome.status).toBe('failed');
    expect(completed?.outcome.failure?.provider).toBe('flights');
  });

  // La fila se crea a la vez que se genera, no antes ni después.
  it('no guarda nada cuando la solicitud ni siquiera es válida', async () => {
    const repository = new RecordingRepository();
    await buildHandler({ persistence: withRepository(repository) })(
      postRequest(validBody({ budget: 0 })),
    );

    expect(repository.created).toHaveLength(0);
  });

  it('no guarda nada cuando la petición se ha frenado por límite', async () => {
    const repository = new RecordingRepository();
    const rateLimiter = new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    const handler = buildHandler({ rateLimiter, persistence: withRepository(repository) });

    await handler(postRequest(validBody()));
    await handler(postRequest(validBody()));

    expect(repository.created).toHaveLength(1);
  });
});
