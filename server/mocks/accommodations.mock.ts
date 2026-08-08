import type { AccommodationOffer } from '../types/accommodation.js';
import type { AccommodationSearchRequest } from '../types/provider.js';
import { randomBoolean, randomFloat, randomInt, randomItem } from './prng.js';
import { deriveBaseCoordinate, jitterCoordinate } from './geo.js';

const NAME_PREFIXES = ['Hotel', 'Apartamentos', 'Hostal', 'Residencia', 'Suites', 'Posada'];
const NAME_QUALIFIERS = ['Central', 'del Puerto', 'Plaza Mayor', 'Vista', 'Real', 'del Parque', 'Jardín', 'Terraza'];

const MIN_OFFERS = 15;
const MAX_OFFERS = 20;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CENTER_RADIUS_KM = 6;

function countNights(checkIn: string, checkOut: string): number {
  const nights = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / MS_PER_DAY);
  return Math.max(1, nights);
}

// Sección 11.3 y 14.1: mismos campos que producirá el proveedor real (p.ej.
// Booking), para que el motor de puntuación no distinga entre ambos.
export function generateAccommodationOffers(
  request: AccommodationSearchRequest,
  random: () => number,
  clock: () => Date = () => new Date(),
): AccommodationOffer[] {
  const travelers = request.adults + request.children;
  const nights = countNights(request.checkIn, request.checkOut);
  const offerCount = randomInt(random, MIN_OFFERS, MAX_OFFERS);
  const baseCoordinate = deriveBaseCoordinate(request.destination);
  const fetchedAt = clock().toISOString();
  const offers: AccommodationOffer[] = [];

  for (let i = 0; i < offerCount; i += 1) {
    const nightlyPrice = randomFloat(random, 25, 320, 2);
    const coordinate = jitterCoordinate(baseCoordinate, random, CENTER_RADIUS_KM);
    const hasRating = randomBoolean(random, 0.9);

    offers.push({
      id: `mock-hotel-${i}`,
      provider: 'mock-accommodations',
      name: `${randomItem(random, NAME_PREFIXES)} ${randomItem(random, NAME_QUALIFIERS)} ${request.destination}`,
      totalPrice: Math.round(nightlyPrice * nights * 100) / 100,
      currency: request.currency,
      rating: hasRating ? randomFloat(random, 2.5, 5, 1) : undefined,
      reviewCount: hasRating ? randomInt(random, 10, 3200) : undefined,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      distanceToCenterKm: randomFloat(random, 0, CENTER_RADIUS_KM, 1),
      breakfastIncluded: randomBoolean(random, 0.45),
      freeCancellation: randomBoolean(random, 0.5),
      capacity: travelers + randomInt(random, 0, 4),
      bookingUrl: `https://mock-accommodations.example.com/offers/mock-hotel-${i}`,
      fetchedAt,
    });
  }

  return offers;
}
