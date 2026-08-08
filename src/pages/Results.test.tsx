// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider.tsx';
import type { AuthGateway } from '../auth/auth-gateway.ts';
import { createFakeAuthGateway, TEST_SESSION } from '../auth/test-fixtures.ts';
import type { GenerateTripResponseBody, TripProposal, TripRequest } from '../types/api.ts';
import { toSearchParams } from '../services/trip-search-params.ts';
import Results from './Results.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const REQUEST: TripRequest = {
  origin: 'Valencia',
  destination: 'Lisboa',
  departureDate: '2099-09-10',
  returnDate: '2099-09-17',
  travelers: { adults: 2, children: 1 },
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

// Propuesta de ejemplo con la forma exacta que devuelve el backend. Vive dentro
// del test a propósito: un constructor de propuestas en `src/` fuera de un test
// es justo lo que el cierre de la fase 7 manda buscar y borrar.
function buildProposal(overrides: Partial<TripProposal> = {}): TripProposal {
  return {
    id: 'recommended-1',
    type: 'recommended',
    rank: 1,
    score: 82.4,
    estimatedTotal: 2386.06,
    currency: 'EUR',
    budget: {
      mainTransportCost: 555.46,
      accommodationCost: 890,
      foodBudget: 480,
      activityCost: 210,
      localTransportCost: 120,
      insuranceCost: 40,
      emergencyReserve: 90.6,
      totalTripCost: 2386.06,
      currency: 'EUR',
    },
    flight: {
      id: 'mock-flight-0',
      provider: 'mock-flights',
      totalPrice: 555.46,
      currency: 'EUR',
      outbound: [
        {
          origin: 'VAL',
          destination: 'LIS',
          departureTime: '2099-09-10T15:15:00.000Z',
          arrivalTime: '2099-09-10T17:20:00.000Z',
          carrier: 'Iberia',
          flightNumber: 'IB123',
          durationMinutes: 125,
        },
      ],
      totalDurationMinutes: 250,
      stops: 0,
      baggageIncluded: true,
      refundable: false,
      fetchedAt: '2099-08-01T00:00:00.000Z',
    },
    accommodation: {
      id: 'mock-stay-0',
      provider: 'mock-stays',
      name: 'Hotel Alfama',
      totalPrice: 890,
      currency: 'EUR',
      rating: 8.6,
      reviewCount: 412,
      latitude: 38.7,
      longitude: -9.1,
      distanceToCenterKm: 1.2,
      capacity: 3,
      fetchedAt: '2099-08-01T00:00:00.000Z',
    },
    itinerary: [],
    evaluatedCombinations: 342,
    discardedCombinations: 317,
    reasons: ['Es la mejor relación entre precio y calidad del alojamiento.'],
    warnings: [],
    ...overrides,
  };
}

function buildResponse(proposals: TripProposal[]): GenerateTripResponseBody {
  return {
    requestId: 'req-1',
    generatedAt: '2099-08-01T00:00:00.000Z',
    proposals,
  };
}

// Sin cuentas configuradas por defecto: lo que se prueba aquí es la pantalla de
// resultados, y sin sesión se comporta como se comportaba antes de la fase 8.
// Los tests que necesitan sesión pasan su propia puerta de autenticación.
function renderResults(
  params: URLSearchParams = toSearchParams(REQUEST),
  createGateway: () => Promise<AuthGateway | null> = async () => null,
) {
  return render(
    <AuthProvider createGateway={createGateway}>
      <MemoryRouter initialEntries={[`/results?${params.toString()}`]}>
        <Routes>
          <Route path="/results" element={<Results />} />
          <Route path="/" element={<p>Formulario</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

// Regla 15: cargando, éxito y error visible. Los tres.
describe('Pantalla de resultados', () => {
  it('enseña el estado de carga mientras espera al endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );

    renderResults();

    expect(screen.getByRole('status').textContent).toContain('Buscando');
  });

  // Criterio de la sección 17.3: "La página /results muestra la respuesta sin
  // depender de datos codificados".
  it('pinta las propuestas que devuelve el endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(buildResponse([buildProposal()])))),
    );

    renderResults();

    expect(await screen.findByText('Hotel Alfama')).toBeTruthy();
    expect(screen.getByText('La recomendada')).toBeTruthy();
    expect(screen.getByText(/Es la mejor relación/)).toBeTruthy();
  });

  it('pide las propuestas con la búsqueda que venía en la URL', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(buildResponse([buildProposal()]))),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderResults();
    await screen.findByText('Hotel Alfama');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      origin: 'Valencia',
      destination: 'Lisboa',
      budget: 3000,
    });
  });

  it('enseña el error y deja reintentar cuando el endpoint falla', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 'PROVIDER_ERROR', message: 'No hemos podido consultar.', requestId: 'r' },
          }),
          { status: 502, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(buildResponse([buildProposal()]))));
    vi.stubGlobal('fetch', fetchMock);

    renderResults();

    expect(await screen.findByText('No hemos podido consultar.')).toBeTruthy();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Volver a intentarlo' }));

    expect(await screen.findByText('Hotel Alfama')).toBeTruthy();
  });

  it('enseña un mensaje si la red se cae, no una pantalla en blanco', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    renderResults();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('No hemos podido preparar tu viaje');
    expect(alert.textContent).not.toContain('Failed to fetch');
  });

  // Que no haya propuestas viables no es un error, y no puede enseñarse como tal.
  it('distingue "no hay propuestas" de "ha fallado algo"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ ...buildResponse([]), message: 'Prueba a ampliar el presupuesto.' }),
          ),
      ),
    );

    renderResults();

    expect(await screen.findByText('No hemos encontrado propuestas')).toBeTruthy();
    expect(screen.getByText('Prueba a ampliar el presupuesto.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Volver a intentarlo' })).toBeNull();
  });

  // Una URL manipulada no puede lanzar una petición condenada al 400.
  it('avisa y no llama al endpoint si la URL no trae una búsqueda válida', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderResults(new URLSearchParams({ origin: 'Valencia' }));

    expect(screen.getByRole('alert').textContent).toContain('no son válidos');
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it('deja volver al formulario', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(buildResponse([buildProposal()])))),
    );

    renderResults();

    expect(screen.getByRole('link', { name: /Cambiar la búsqueda/ })).toBeTruthy();
  });
});

// Fase 8: guardar el viaje desde los resultados.
describe('Pantalla de resultados — guardar el viaje', () => {
  function withSession() {
    const fake = createFakeAuthGateway({ session: TEST_SESSION });
    return { fake, createGateway: async () => fake.gateway };
  }

  it('manda el token de la sesión al generar, para que el viaje tenga dueño', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(buildResponse([buildProposal()]))),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderResults(toSearchParams(REQUEST), withSession().createGateway);
    await screen.findByText('Hotel Alfama');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${TEST_SESSION.accessToken}`,
    );
  });

  it('guarda la propuesta mandando solo los identificadores', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('/api/trips/saved')) {
        return new Response(
          JSON.stringify({
            requestId: 'req-1',
            savedTrip: { id: 'guardado-1', title: 'Valencia → Lisboa' },
          }),
          { status: 201 },
        );
      }
      return new Response(
        JSON.stringify({ ...buildResponse([buildProposal()]), tripId: 'solicitud-1' }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderResults(toSearchParams(REQUEST), withSession().createGateway);

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Guardar viaje' }));

    expect(await screen.findByText(/Guardado como/)).toBeTruthy();

    const saveCall = (fetchMock.mock.calls as unknown as [string, RequestInit][]).find(([url]) =>
      url.startsWith('/api/trips/saved'),
    );
    const init = saveCall?.[1] as RequestInit;
    // Sección 8.2: "No confiar en cálculos enviados por el frontend".
    expect(JSON.parse(init.body as string)).toEqual({
      tripId: 'solicitud-1',
      proposalType: 'recommended',
    });
  });

  // Regla 15: la tercera es la que faltaba siempre.
  it('enseña el error cuando guardar falla', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('/api/trips/saved')) {
          return new Response(
            JSON.stringify({
              error: { code: 'INTERNAL_ERROR', message: 'No hemos podido guardarlo.', requestId: 'r' },
            }),
            { status: 500, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({ ...buildResponse([buildProposal()]), tripId: 'solicitud-1' }),
        );
      }),
    );

    renderResults(toSearchParams(REQUEST), withSession().createGateway);

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Guardar viaje' }));

    expect(await screen.findByText('No hemos podido guardarlo.')).toBeTruthy();
  });

  // Sin fila en la base de datos no hay nada a lo que apuntar: se dice, en vez
  // de enseñar un botón que solo puede fallar.
  it('no ofrece guardar cuando la generación no llegó a registrarse', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(buildResponse([buildProposal()])))),
    );

    renderResults(toSearchParams(REQUEST), withSession().createGateway);
    await screen.findByText('Hotel Alfama');

    expect(screen.queryByRole('button', { name: 'Guardar viaje' })).toBeNull();
    expect(screen.getByText(/no se ha podido registrar/)).toBeTruthy();
  });

  it('invita a entrar en la cuenta cuando no hay sesión', async () => {
    const fake = createFakeAuthGateway({ session: null });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ...buildResponse([buildProposal()]), tripId: 'solicitud-1' })),
      ),
    );

    renderResults(toSearchParams(REQUEST), async () => fake.gateway);
    await screen.findByText('Hotel Alfama');

    expect(screen.getByRole('link', { name: 'Entra en tu cuenta' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Guardar viaje' })).toBeNull();
  });

  // Un viaje generado en anónimo no es de nadie, así que al entrar hay que
  // volver a pedirlo: si no, guardarlo daría un 403.
  it('vuelve a pedir el viaje cuando el usuario inicia sesión desde esta pantalla', async () => {
    const fake = createFakeAuthGateway({ session: null });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ...buildResponse([buildProposal()]), tripId: 'solicitud-1' })),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderResults(toSearchParams(REQUEST), async () => fake.gateway);
    await screen.findByText('Hotel Alfama');

    const before = fetchMock.mock.calls.length;
    await act(async () => fake.emit(TEST_SESSION));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });
});
