import type { AccommodationOffer } from '../types/accommodation.ts';
import type { AccommodationSearchRequest } from '../types/provider.ts';
import { generateAccommodationOffers } from '../mocks/accommodations.mock.ts';
import { createSeededRandom } from '../mocks/prng.ts';
import type { AccommodationProvider } from './accommodation.provider.ts';

function buildSeed(request: AccommodationSearchRequest): string {
  return [
    request.destination,
    request.checkIn,
    request.checkOut,
    request.adults,
    request.children,
    request.currency,
  ].join('|');
}

// Sección 14.1: implementación simulada de AccommodationProvider. La semilla
// depende solo de la búsqueda, así que la misma búsqueda siempre da la misma lista.
export class MockAccommodationProvider implements AccommodationProvider {
  private readonly clock: () => Date;

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock;
  }

  async searchAccommodations(request: AccommodationSearchRequest): Promise<AccommodationOffer[]> {
    const random = createSeededRandom(buildSeed(request));
    return generateAccommodationOffers(request, random, this.clock);
  }
}
