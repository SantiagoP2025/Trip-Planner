import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TripRequest } from '../types/api.ts';
import { generateTrip, TripApiError } from './trip-api.client.ts';

const REQUEST: TripRequest = {
  origin: 'Valencia',
  destination: 'Lisboa',
  departureDate: '2099-09-10',
  returnDate: '2099-09-17',
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
};

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateTrip', () => {
  it('envía la solicitud como POST JSON al endpoint', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { requestId: 'r1', proposals: [] }));

    await generateTrip(REQUEST);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/trips/generate');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(REQUEST);
  });

  it('devuelve la respuesta del servidor tal cual', async () => {
    const body = { requestId: 'r1', generatedAt: '2026-08-08T00:00:00.000Z', proposals: [] };
    stubFetch(jsonResponse(200, body));

    await expect(generateTrip(REQUEST)).resolves.toEqual(body);
  });

  // CLAUDE.md: el mensaje en español lo redacta el servidor, que es quien sabe
  // qué ha pasado. El cliente no lo reescribe ni lo adorna.
  it('propaga el mensaje de error del servidor', async () => {
    stubFetch(
      jsonResponse(429, {
        error: {
          code: 'RATE_LIMITED',
          message: 'Has hecho demasiadas peticiones seguidas.',
          requestId: 'r1',
        },
      }),
    );

    await expect(generateTrip(REQUEST)).rejects.toMatchObject({
      message: 'Has hecho demasiadas peticiones seguidas.',
      status: 429,
      requestId: 'r1',
    });
  });

  it('conserva el detalle por campo de un 400', async () => {
    stubFetch(
      jsonResponse(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Algunos datos del viaje no son válidos.',
          requestId: 'r1',
          details: [{ field: 'budget', message: 'El presupuesto debe ser mayor que 0.' }],
        },
      }),
    );

    await expect(generateTrip(REQUEST)).rejects.toMatchObject({
      fieldErrors: [{ field: 'budget', message: 'El presupuesto debe ser mayor que 0.' }],
    });
  });

  it('convierte un fallo de red en un mensaje que se puede enseñar', async () => {
    stubFetch(new TypeError('Failed to fetch'));

    const error = await generateTrip(REQUEST).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TripApiError);
    expect((error as TripApiError).message).toContain('conexión');
    // El detalle técnico se queda en `cause`, no en pantalla.
    expect((error as TripApiError).message).not.toContain('Failed to fetch');
  });

  it('no se queda en blanco si el servidor devuelve algo que no es JSON', async () => {
    stubFetch(new Response('<html>502</html>', { status: 502 }));

    await expect(generateTrip(REQUEST)).rejects.toBeInstanceOf(TripApiError);
  });

  it('no se queda en blanco si el error no tiene la forma esperada', async () => {
    stubFetch(jsonResponse(500, { vaya: 'esto no es un ApiErrorBody' }));

    await expect(generateTrip(REQUEST)).rejects.toMatchObject({ status: 500 });
  });

  // Cancelar no es fallar: sube tal cual para que quien llama lo ignore en vez
  // de enseñar un error al usuario que ya se ha ido de la pantalla.
  it('deja pasar la cancelación sin convertirla en error de usuario', async () => {
    stubFetch(new DOMException('The operation was aborted.', 'AbortError'));

    const error = await generateTrip(REQUEST).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DOMException);
    expect(error).not.toBeInstanceOf(TripApiError);
  });
});
