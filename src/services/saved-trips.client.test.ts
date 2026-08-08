import { afterEach, describe, expect, it, vi } from 'vitest';
import { TripApiError } from './api-client.ts';
import { deleteSavedTrip, listSavedTrips, saveTrip } from './saved-trips.client.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(response: Response | (() => Response)) {
  const fetchMock = vi.fn(async () => (typeof response === 'function' ? response() : response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('listSavedTrips', () => {
  it('devuelve los viajes que manda el servidor', async () => {
    stubFetch(jsonResponse({ requestId: 'r', savedTrips: [{ id: 'guardado-1' }] }));

    const trips = await listSavedTrips('token');

    expect(trips).toEqual([{ id: 'guardado-1' }]);
  });

  // El token va en la cabecera y nunca en la URL: las URL acaban en logs de
  // servidor, en historiales y en cabeceras `Referer`.
  it('manda el token en la cabecera y no en la dirección', async () => {
    const fetchMock = stubFetch(jsonResponse({ requestId: 'r', savedTrips: [] }));

    await listSavedTrips('token-secreto');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('token-secreto');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-secreto');
  });
});

describe('saveTrip', () => {
  it('manda solo los identificadores y el título', async () => {
    const fetchMock = stubFetch(jsonResponse({ requestId: 'r', savedTrip: { id: 'g1' } }, 201));

    await saveTrip('token', {
      tripId: 'solicitud-1',
      proposalType: 'comfort',
      title: 'Puente de mayo',
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/trips/saved');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      tripId: 'solicitud-1',
      proposalType: 'comfort',
      title: 'Puente de mayo',
    });
  });

  // CLAUDE.md: el mensaje viene ya redactado en español desde el servidor y el
  // frontend no lo reescribe.
  it('propaga el mensaje del servidor cuando la respuesta es un error', async () => {
    stubFetch(
      jsonResponse(
        {
          error: {
            code: 'SAVED_TRIPS_LIMIT',
            message: 'Has alcanzado el máximo de viajes guardados.',
            requestId: 'r',
          },
        },
        400,
      ),
    );

    await expect(saveTrip('token', { tripId: 'solicitud-1', proposalType: 'recommended' })).rejects.toThrow(
      'Has alcanzado el máximo de viajes guardados.',
    );
  });

  it('no filtra el detalle técnico cuando se cae la red', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    const error = await saveTrip('token', {
      tripId: 'solicitud-1',
      proposalType: 'recommended',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TripApiError);
    expect((error as TripApiError).message).not.toContain('Failed to fetch');
  });
});

describe('deleteSavedTrip', () => {
  it('borra por identificador y devuelve el borrado', async () => {
    const fetchMock = stubFetch(jsonResponse({ requestId: 'r', deletedId: 'guardado-1' }));

    const deleted = await deleteSavedTrip('token', 'guardado-1');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/trips/saved?id=guardado-1');
    expect(init.method).toBe('DELETE');
    expect(deleted).toBe('guardado-1');
  });

  it('escapa el identificador en la dirección', async () => {
    const fetchMock = stubFetch(jsonResponse({ requestId: 'r', deletedId: 'x' }));

    await deleteSavedTrip('token', 'a b&c');

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe('/api/trips/saved?id=a%20b%26c');
  });
});
