import { describe, expect, it } from 'vitest';
import type { PreferenceProfile } from '../types/common.ts';
import type {
  TripGenerationDiagnostics,
  TripProposal,
  TripRequest,
} from '../types/trip.ts';
import type { TripGenerationOutcome } from './trip.repository.ts';
import { toProviderSearchRows, toTripProposalRows, toTripRequestRow } from './trip-rows.ts';

const PREFERENCES: PreferenceProfile = {
  beach: 1,
  culture: 3,
  gastronomy: 3,
  nightlife: 0,
  nature: 2,
  shopping: 0,
  family: 0,
  relax: 1,
};

function buildRequest(overrides: Partial<TripRequest> = {}): TripRequest {
  return {
    origin: 'Valencia',
    destination: 'Lisboa',
    departureDate: '2026-09-10',
    returnDate: '2026-09-17',
    travelers: { adults: 2, children: 1 },
    budget: 3000,
    currency: 'EUR',
    travelStyle: 'balanced',
    preferences: PREFERENCES,
    ...overrides,
  };
}

function buildDiagnostics(
  overrides: Partial<TripGenerationDiagnostics> = {},
): TripGenerationDiagnostics {
  return {
    flightsFound: 18,
    accommodationsFound: 19,
    activitiesFound: 25,
    evaluatedCombinations: 342,
    discardedCombinations: 317,
    discardReasons: {},
    providerDurationsMs: { flights: 3, accommodations: 2, places: 1 },
    ...overrides,
  };
}

function buildOutcome(overrides: Partial<TripGenerationOutcome> = {}): TripGenerationOutcome {
  return {
    status: 'completed',
    proposals: [],
    diagnostics: buildDiagnostics(),
    failure: null,
    ...overrides,
  };
}

// Sección 13.1: columnas de trip_requests.
describe('toTripRequestRow', () => {
  it('reparte los campos en las columnas de la sección 13.1', () => {
    const row = toTripRequestRow({ request: buildRequest(), userId: null });

    expect(row).toEqual({
      user_id: null,
      origin: 'Valencia',
      destination: 'Lisboa',
      departure_date: '2026-09-10',
      return_date: '2026-09-17',
      adults: 2,
      children: 1,
      budget: 3000,
      currency: 'EUR',
      travel_style: 'balanced',
      preferences: PREFERENCES,
      constraints: null,
      status: 'pending',
    });
  });

  it('guarda el usuario cuando la solicitud lleva uno', () => {
    const row = toTripRequestRow({ request: buildRequest(), userId: 'usuario-1' });

    expect(row.user_id).toBe('usuario-1');
  });

  // Sección 13.2: preferencias y restricciones en JSONB.
  it('guarda las restricciones tal cual cuando las hay', () => {
    const constraints = { reducedMobility: true, maxWalkingMinutes: 30 };
    const row = toTripRequestRow({ request: buildRequest({ constraints }), userId: null });

    expect(row.constraints).toEqual(constraints);
  });

  // La fila nace en `pending` y la cierra `saveGenerationOutcome`: una solicitud
  // que se quede así es una generación que murió por el camino.
  it('crea la fila en estado pendiente', () => {
    expect(toTripRequestRow({ request: buildRequest(), userId: null }).status).toBe('pending');
  });
});

// Sección 13.1: columnas de trip_proposals.
describe('toTripProposalRows', () => {
  const proposal = {
    id: 'recommended-1',
    type: 'recommended',
    rank: 1,
    score: 82.5,
    estimatedTotal: 2386.06,
    currency: 'EUR',
    reasons: ['motivo'],
    warnings: [],
  } as unknown as TripProposal;

  it('crea una fila por propuesta, atada a su solicitud', () => {
    const rows = toTripProposalRows('solicitud-1', [proposal]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      trip_request_id: 'solicitud-1',
      proposal_type: 'recommended',
      total_cost: 2386.06,
      score: 82.5,
      data: proposal,
    });
  });

  it('no crea ninguna fila si no hay propuestas', () => {
    expect(toTripProposalRows('solicitud-1', [])).toEqual([]);
  });
});

// Sección 13.1 y 16.3: auditoría de lo que devolvió cada proveedor.
describe('toProviderSearchRows', () => {
  it('crea una fila por proveedor con su número de ofertas', () => {
    const rows = toProviderSearchRows('solicitud-1', buildOutcome());

    expect(rows).toHaveLength(3);
    expect(rows).toContainEqual({
      trip_request_id: 'solicitud-1',
      provider: 'flights',
      status: 'ok',
      offers_found: 18,
      error_message: null,
    });
    expect(rows.find((row) => row.provider === 'places')?.offers_found).toBe(25);
  });

  // Sección 13.2: "No guardar respuestas brutas de proveedores indefinidamente
  // si contienen datos innecesarios".
  it('no guarda el volcado de la petición ni el de la respuesta', () => {
    const rows = toProviderSearchRows('solicitud-1', buildOutcome());

    for (const row of rows) {
      expect(row).not.toHaveProperty('request_data');
      expect(row).not.toHaveProperty('response_data');
    }
  });

  // El proveedor de lugares puede caerse sin tumbar la generación: si no está en
  // las duraciones, es que no llegó a responder.
  it('marca como fallido el proveedor que no llegó a responder', () => {
    const rows = toProviderSearchRows(
      'solicitud-1',
      buildOutcome({
        diagnostics: buildDiagnostics({ providerDurationsMs: { flights: 3, accommodations: 2 } }),
      }),
    );

    const places = rows.find((row) => row.provider === 'places');
    expect(places?.status).toBe('failed');
    expect(places?.offers_found).toBeNull();
    expect(places?.error_message).not.toBeNull();
  });

  it('registra el proveedor que tumbó la generación', () => {
    const rows = toProviderSearchRows(
      'solicitud-1',
      buildOutcome({
        status: 'failed',
        diagnostics: null,
        failure: { provider: 'flights', message: 'timeout' },
      }),
    );

    expect(rows).toEqual([
      {
        trip_request_id: 'solicitud-1',
        provider: 'flights',
        status: 'failed',
        offers_found: null,
        error_message: 'timeout',
      },
    ]);
  });

  it('acota el mensaje de error para que no engorde la tabla', () => {
    const rows = toProviderSearchRows(
      'solicitud-1',
      buildOutcome({
        status: 'failed',
        diagnostics: null,
        failure: { provider: null, message: 'x'.repeat(5_000) },
      }),
    );

    expect(rows[0]?.provider).toBe('desconocido');
    expect(rows[0]?.error_message?.length).toBeLessThanOrEqual(501);
  });
});
