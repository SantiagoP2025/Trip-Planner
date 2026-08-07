import type { FlightOffer } from '../types/flight.ts';
import type { FlightSearchRequest } from '../types/provider.ts';
import { generateFlightOffers } from '../mocks/flights.mock.ts';
import { createSeededRandom } from '../mocks/prng.ts';
import type { FlightProvider } from './flight.provider.ts';

function buildSeed(request: FlightSearchRequest): string {
  return [
    request.origin,
    request.destination,
    request.departureDate,
    request.returnDate,
    request.adults,
    request.children,
    request.currency,
  ].join('|');
}

// Sección 14.1: implementación simulada de FlightProvider. La semilla depende
// solo de la búsqueda, así que la misma búsqueda siempre da la misma lista.
export class MockFlightProvider implements FlightProvider {
  private readonly clock: () => Date;

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock;
  }

  async searchFlights(request: FlightSearchRequest): Promise<FlightOffer[]> {
    const random = createSeededRandom(buildSeed(request));
    return generateFlightOffers(request, random, this.clock);
  }
}
