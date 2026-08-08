// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider.tsx';
import type { AuthGateway } from '../auth/auth-gateway.ts';
import { createFakeAuthGateway, TEST_SESSION } from '../auth/test-fixtures.ts';
import type { SavedTrip } from '../types/api.ts';
import SavedTrips from './SavedTrips.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  localStorage.clear();
});

// Viaje guardado con la forma exacta que devuelve el servidor. Vive dentro del
// test a propósito: un constructor de propuestas en `src/` fuera de un test es
// justo lo que el cierre de la fase 7 manda buscar y borrar.
function buildSavedTrip(overrides: Partial<SavedTrip> = {}): SavedTrip {
  return {
    id: 'guardado-1',
    title: 'Valencia → Lisboa',
    savedAt: '2026-08-08T10:00:00.000Z',
    tripRequestId: 'solicitud-1',
    origin: 'Valencia',
    destination: 'Lisboa',
    departureDate: '2026-09-10',
    returnDate: '2026-09-17',
    proposal: {
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
            departureTime: '2026-09-10T15:15:00.000Z',
            arrivalTime: '2026-09-10T17:20:00.000Z',
            carrier: 'Iberia',
            flightNumber: 'IB123',
            durationMinutes: 125,
          },
        ],
        totalDurationMinutes: 250,
        stops: 0,
        baggageIncluded: true,
        refundable: false,
        fetchedAt: '2026-08-01T00:00:00.000Z',
      },
      accommodation: {
        id: 'mock-stay-0',
        provider: 'mock-stays',
        name: 'Hotel Alfama',
        totalPrice: 890,
        currency: 'EUR',
        latitude: 38.7,
        longitude: -9.1,
        capacity: 3,
        fetchedAt: '2026-08-01T00:00:00.000Z',
      },
      itinerary: [],
      evaluatedCombinations: 342,
      discardedCombinations: 317,
      reasons: [],
      warnings: [],
    },
    ...overrides,
  };
}

function renderSavedTrips(createGateway: () => Promise<AuthGateway | null>) {
  return render(
    <AuthProvider createGateway={createGateway}>
      <MemoryRouter initialEntries={['/viajes']}>
        <Routes>
          <Route path="/viajes" element={<SavedTrips />} />
          <Route path="/cuenta" element={<p>Formulario de acceso</p>} />
          <Route path="/" element={<p>Formulario</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

function withSession(): () => Promise<AuthGateway> {
  const fake = createFakeAuthGateway({ session: TEST_SESSION });
  return async () => fake.gateway;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Mis viajes guardados', () => {
  it('pinta los viajes que devuelve el servidor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ requestId: 'r', savedTrips: [buildSavedTrip()] })),
    );

    renderSavedTrips(withSession());

    expect(await screen.findByRole('heading', { name: 'Valencia → Lisboa' })).toBeTruthy();
    expect(screen.getByText('Hotel Alfama')).toBeTruthy();
  });

  it('los pide con el token de la sesión', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ requestId: 'r', savedTrips: [] }));
    vi.stubGlobal('fetch', fetchMock);

    renderSavedTrips(withSession());
    await screen.findByText('Todavía no has guardado ningún viaje.');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${TEST_SESSION.accessToken}`,
    );
  });

  // Regla 15: cargando, éxito y error visible. Los tres.
  it('enseña el estado de carga', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );

    renderSavedTrips(withSession());

    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('enseña el error y deja reintentar cuando el servidor falla', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: 'INTERNAL_ERROR', message: 'No hemos podido cargarlos.', requestId: 'r' } },
          500,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ requestId: 'r', savedTrips: [buildSavedTrip()] }));
    vi.stubGlobal('fetch', fetchMock);

    renderSavedTrips(withSession());

    expect(await screen.findByText('No hemos podido cargarlos.')).toBeTruthy();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Volver a intentarlo' }));

    expect(await screen.findByRole('heading', { name: 'Valencia → Lisboa' })).toBeTruthy();
  });

  // Sección 8.2: "Añadir autenticación antes de permitir acceso a viajes
  // privados". Sin sesión no se pide nada.
  it('no llama al servidor si no hay sesión', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const fake = createFakeAuthGateway({ session: null });

    renderSavedTrips(async () => fake.gateway);

    expect(await screen.findByText('Entra para ver tus viajes')).toBeTruthy();
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it('dice que las cuentas no están disponibles cuando no hay Supabase', async () => {
    vi.stubGlobal('fetch', vi.fn());

    renderSavedTrips(async () => null);

    expect(await screen.findByText(/no están disponibles/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Entrar o crear cuenta' })).toBeNull();
  });

  describe('borrar un viaje', () => {
    it('lo quita de la lista', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init?: RequestInit) =>
          init?.method === 'DELETE'
            ? jsonResponse({ requestId: 'r', deletedId: 'guardado-1' })
            : jsonResponse({ requestId: 'r', savedTrips: [buildSavedTrip()] }),
        ),
      );

      renderSavedTrips(withSession());
      await screen.findByRole('heading', { name: 'Valencia → Lisboa' });

      await userEvent.setup().click(screen.getByRole('button', { name: 'Quitar de mis viajes' }));

      expect(await screen.findByText('Todavía no has guardado ningún viaje.')).toBeTruthy();
    });

    // Regla 15: un `try/finally` sin `catch` deja al usuario mirando un botón
    // que aparentemente no hace nada.
    it('enseña el error si el borrado falla, y no quita el viaje', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init?: RequestInit) =>
          init?.method === 'DELETE'
            ? jsonResponse(
                { error: { code: 'NOT_FOUND', message: 'No hemos encontrado este viaje.', requestId: 'r' } },
                404,
              )
            : jsonResponse({ requestId: 'r', savedTrips: [buildSavedTrip()] }),
        ),
      );

      renderSavedTrips(withSession());
      await screen.findByRole('heading', { name: 'Valencia → Lisboa' });

      await userEvent.setup().click(screen.getByRole('button', { name: 'Quitar de mis viajes' }));

      expect(await screen.findByText('No hemos encontrado este viaje.')).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Valencia → Lisboa' })).toBeTruthy();
    });
  });

  describe('copia local', () => {
    // Regla 9: `localStorage` es caché, nunca fuente de verdad.
    it('guarda una copia de lo que devuelve el servidor', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse({ requestId: 'r', savedTrips: [buildSavedTrip()] })),
      );

      renderSavedTrips(withSession());
      await screen.findByRole('heading', { name: 'Valencia → Lisboa' });

      await waitFor(() =>
        expect(localStorage.getItem('trip-planner.saved-trips')).toContain('guardado-1'),
      );
    });

    // Regla 14 y fallo A.9: si la copia local no puede escribirse, el usuario se
    // entera. Antes era una excepción sin capturar y silencio.
    it('avisa si no ha podido guardar la copia en el dispositivo', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse({ requestId: 'r', savedTrips: [buildSavedTrip()] })),
      );

      renderSavedTrips(withSession());

      expect(await screen.findByText(/No hemos podido guardar una copia/)).toBeTruthy();
      // Y los viajes se ven igual: la copia local no es la fuente de verdad.
      expect(screen.getByRole('heading', { name: 'Valencia → Lisboa' })).toBeTruthy();
    });

    it('la respuesta del servidor pisa siempre a la copia local', async () => {
      localStorage.setItem(
        'trip-planner.saved-trips',
        JSON.stringify({
          userId: TEST_SESSION.user.id,
          savedTrips: [buildSavedTrip({ title: 'Copia vieja' })],
        }),
      );
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          jsonResponse({
            requestId: 'r',
            savedTrips: [buildSavedTrip({ title: 'Lo que dice el servidor' })],
          }),
        ),
      );

      renderSavedTrips(withSession());

      expect(await screen.findByRole('heading', { name: 'Lo que dice el servidor' })).toBeTruthy();
      expect(screen.queryByRole('heading', { name: 'Copia vieja' })).toBeNull();
    });
  });
});
