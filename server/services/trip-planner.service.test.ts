import { describe, expect, it } from 'vitest';
import { buildAccommodation, buildFlight } from '../algorithms/test-fixtures.ts';
import {
  DEFAULT_TOP_ACCOMMODATIONS,
  DEFAULT_TOP_FLIGHTS,
} from '../algorithms/combine-offers.ts';
import { MockAccommodationProvider } from '../providers/mock-accommodation.provider.ts';
import { MockFlightProvider } from '../providers/mock-flight.provider.ts';
import { MockPlacesProvider } from '../providers/mock-places.provider.ts';
import type { AccommodationProvider } from '../providers/accommodation.provider.ts';
import type { FlightProvider } from '../providers/flight.provider.ts';
import type { PlacesProvider } from '../providers/places.provider.ts';
import type { AccommodationOffer } from '../types/accommodation.ts';
import type { ActivityCandidate } from '../types/activity.ts';
import type { FlightOffer } from '../types/flight.ts';
import type { PreferenceProfile } from '../types/common.ts';
import type { TripRequest } from '../types/trip.ts';
import {
  generateTripProposals,
  TripProviderError,
  type TripPlannerProviders,
} from './trip-planner.service.ts';

const FIXED_CLOCK = () => new Date('2026-08-07T10:00:00.000Z');

function mockProviders(): TripPlannerProviders {
  return {
    flights: new MockFlightProvider(FIXED_CLOCK),
    accommodations: new MockAccommodationProvider(FIXED_CLOCK),
    places: new MockPlacesProvider(),
  };
}

// Proveedores de lista fija, para los casos donde hace falta controlar el número
// exacto de ofertas o forzar un fallo.
function stubProviders(overrides: {
  flights?: FlightOffer[] | Error;
  accommodations?: AccommodationOffer[] | Error;
  activities?: ActivityCandidate[] | Error;
}): TripPlannerProviders {
  const resolve = <T>(value: T[] | Error | undefined, fallback: T[]): Promise<T[]> =>
    value instanceof Error ? Promise.reject(value) : Promise.resolve(value ?? fallback);

  const flights: FlightProvider = {
    searchFlights: () => resolve(overrides.flights, []),
  };
  const accommodations: AccommodationProvider = {
    searchAccommodations: () => resolve(overrides.accommodations, []),
  };
  const places: PlacesProvider = {
    searchActivities: () => resolve(overrides.activities, []),
  };

  return { flights, accommodations, places };
}

const PREFERENCES_CULTURA: PreferenceProfile = {
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
    travelers: { adults: 2, children: 0 },
    budget: 3000,
    currency: 'EUR',
    travelStyle: 'balanced',
    preferences: PREFERENCES_CULTURA,
    ...overrides,
  };
}

// Sección 17.2: "Endpoint → mocks → motor → propuestas".
describe('generateTripProposals', () => {
  // Criterio de aceptación de la sección 17.3: "Se generan tres propuestas
  // simuladas distintas".
  it('devuelve tres propuestas, una por perfil de la sección 10.6', async () => {
    const result = await generateTripProposals(buildRequest(), mockProviders());

    expect(result.proposals).toHaveLength(3);
    expect(result.proposals.map((proposal) => proposal.type).sort()).toEqual([
      'comfort',
      'economical',
      'recommended',
    ]);
  });

  it('las tres propuestas son distintas entre sí', async () => {
    const result = await generateTripProposals(buildRequest(), mockProviders());

    const combinations = result.proposals.map(
      (proposal) => `${proposal.flight.id}|${proposal.accommodation.id}`,
    );

    expect(new Set(combinations).size).toBe(3);
  });

  // Sección 10.1: "Coste total dentro del presupuesto".
  it('ninguna propuesta supera el presupuesto', async () => {
    const request = buildRequest();
    const result = await generateTripProposals(request, mockProviders());

    for (const proposal of result.proposals) {
      expect(proposal.estimatedTotal).toBeLessThanOrEqual(request.budget);
      expect(proposal.budget.totalTripCost).toBe(proposal.estimatedTotal);
    }
  });

  // Criterio de aceptación de la sección 17.3: "Cada propuesta incluye coste,
  // puntuación, razones y advertencias".
  it('cada propuesta llega con coste, puntuación, razones y explicación del recuento', async () => {
    const result = await generateTripProposals(buildRequest(), mockProviders());

    for (const proposal of result.proposals) {
      expect(proposal.score).toBeGreaterThan(0);
      expect(proposal.estimatedTotal).toBeGreaterThan(0);
      expect(proposal.currency).toBe('EUR');
      expect(proposal.reasons.length).toBeGreaterThan(0);
      expect(Array.isArray(proposal.warnings)).toBe(true);
      expect(proposal.evaluatedCombinations).toBe(result.diagnostics.evaluatedCombinations);
      expect(proposal.discardedCombinations).toBe(result.diagnostics.discardedCombinations);
    }
  });

  it('ordena las propuestas por su posición en el ranking', async () => {
    const result = await generateTripProposals(buildRequest(), mockProviders());

    expect(result.proposals.map((proposal) => proposal.rank)).toEqual([1, 2, 3]);
  });

  // El itinerario día a día llega en su propia fase: aquí va vacío, nunca
  // inventado (regla 12 de PLAN-2.md, por analogía con las coordenadas).
  it('todavía no inventa itinerario', async () => {
    const result = await generateTripProposals(buildRequest(), mockProviders());

    for (const proposal of result.proposals) {
      expect(proposal.itinerary).toEqual([]);
    }
  });

  // Convención de CLAUDE.md: misma búsqueda, mismo resultado.
  it('la misma búsqueda devuelve siempre el mismo resultado', async () => {
    const [primera, segunda] = await Promise.all([
      generateTripProposals(buildRequest(), mockProviders()),
      generateTripProposals(buildRequest(), mockProviders()),
    ]);

    expect(primera.proposals).toEqual(segunda.proposals);
  });

  // Criterio de aceptación de la sección 17.3: "Las preferencias modifican el
  // resultado".
  it('las preferencias cambian el resultado', async () => {
    const cultural = await generateTripProposals(buildRequest(), mockProviders());
    const playero = await generateTripProposals(
      buildRequest({
        preferences: { ...PREFERENCES_CULTURA, culture: 0, gastronomy: 0, beach: 3, relax: 3 },
      }),
      mockProviders(),
    );

    expect(playero.proposals).not.toEqual(cultural.proposals);
  });

  // Regla 8 de CLAUDE.md: recortar antes de combinar.
  it('recorta a los mejores 25 de cada lado antes de combinar', async () => {
    const flights = Array.from({ length: 60 }, (_, index) =>
      buildFlight({ id: `f-${index}`, totalPrice: 200 + index }),
    );
    const accommodations = Array.from({ length: 60 }, (_, index) =>
      buildAccommodation({ id: `h-${index}`, totalPrice: 300 + index, distanceToCenterKm: 1 }),
    );

    const result = await generateTripProposals(
      buildRequest(),
      stubProviders({ flights, accommodations }),
    );

    expect(result.diagnostics.flightsFound).toBe(60);
    expect(result.diagnostics.accommodationsFound).toBe(60);
    expect(result.diagnostics.evaluatedCombinations).toBe(
      DEFAULT_TOP_FLIGHTS * DEFAULT_TOP_ACCOMMODATIONS,
    );
  });

  // Sección 16.3: "Registrar número de ofertas", "registrar descartes y causas",
  // "registrar duración de cada proveedor".
  it('registra ofertas, descartes con su causa y duración de cada proveedor', async () => {
    const result = await generateTripProposals(buildRequest(), mockProviders());
    const { diagnostics } = result;

    expect(diagnostics.flightsFound).toBeGreaterThan(0);
    expect(diagnostics.accommodationsFound).toBeGreaterThan(0);
    expect(diagnostics.activitiesFound).toBeGreaterThan(0);
    expect(diagnostics.discardedCombinations).toBeGreaterThan(0);
    expect(Object.keys(diagnostics.discardReasons).length).toBeGreaterThan(0);
    expect(Object.keys(diagnostics.providerDurationsMs).sort()).toEqual([
      'accommodations',
      'flights',
      'places',
    ]);
  });

  it('el total de descartes coincide con la suma de los motivos registrados', async () => {
    const { diagnostics } = await generateTripProposals(buildRequest(), mockProviders());

    // Una combinación puede caer por varios motivos a la vez, así que la suma de
    // los contadores nunca es menor que el número de combinaciones descartadas.
    const totalMotivos = Object.values(diagnostics.discardReasons).reduce(
      (total, count) => total + count,
      0,
    );

    expect(totalMotivos).toBeGreaterThanOrEqual(diagnostics.discardedCombinations);
    expect(diagnostics.discardedCombinations).toBeLessThan(diagnostics.evaluatedCombinations);
  });

  // Sección 10.1: si ninguna combinación cabe en el presupuesto no hay propuesta
  // que dar, y eso no es un error.
  it('devuelve cero propuestas y el motivo cuando nada cabe en el presupuesto', async () => {
    const result = await generateTripProposals(buildRequest({ budget: 200 }), mockProviders());

    expect(result.proposals).toEqual([]);
    expect(result.diagnostics.discardReasons['El coste total supera el presupuesto indicado.']).toBe(
      result.diagnostics.evaluatedCombinations,
    );
  });

  it('devuelve cero propuestas si un proveedor no encuentra nada', async () => {
    const result = await generateTripProposals(
      buildRequest(),
      stubProviders({ flights: [], accommodations: [buildAccommodation({ id: 'h1', totalPrice: 300 })] }),
    );

    expect(result.proposals).toEqual([]);
    expect(result.diagnostics.evaluatedCombinations).toBe(0);
  });

  // Sección 17.2: "Fallo de proveedor → respuesta controlada".
  it('convierte el fallo de un proveedor imprescindible en un error identificable', async () => {
    const caida = generateTripProposals(
      buildRequest(),
      stubProviders({ flights: new Error('502 del proveedor') }),
    );

    await expect(caida).rejects.toBeInstanceOf(TripProviderError);
    await expect(caida).rejects.toMatchObject({ provider: 'flights' });
  });

  // Sección 16.3: el detalle va al log a través de `cause`, nunca al mensaje que
  // acabará viendo el usuario.
  it('no expone el detalle técnico del fallo en el mensaje del error', async () => {
    let capturado: unknown;

    try {
      await generateTripProposals(
        buildRequest(),
        stubProviders({ accommodations: new Error('clave de API caducada') }),
      );
    } catch (error) {
      capturado = error;
    }

    expect(capturado).toBeInstanceOf(TripProviderError);
    const error = capturado as TripProviderError;
    expect(error.message).not.toContain('clave de API');
    expect(error.cause).toBeInstanceOf(Error);
  });

  // Sin actividades todavía se puede proponer vuelo y alojamiento, así que la
  // caída del proveedor de lugares degrada el resultado en vez de tumbarlo.
  it('sigue proponiendo viajes si se cae el proveedor de lugares', async () => {
    const result = await generateTripProposals(
      buildRequest(),
      {
        ...mockProviders(),
        places: { searchActivities: () => Promise.reject(new Error('sin servicio')) },
      },
    );

    expect(result.proposals.length).toBeGreaterThan(0);
    expect(result.diagnostics.activitiesFound).toBe(0);
    expect(result.diagnostics.providerDurationsMs.places).toBeUndefined();
  });
});
