import type { AccommodationOffer } from '../types/accommodation.ts';
import type { FlightOffer } from '../types/flight.ts';

// Regla 8 de CLAUDE.md: recortar antes de combinar. 200 vuelos por 300
// alojamientos son 60.000 combinaciones para acabar enseñando tres; con el
// recorte son 625 y el resultado final es prácticamente el mismo.
export const DEFAULT_TOP_FLIGHTS = 25;
export const DEFAULT_TOP_ACCOMMODATIONS = 25;

export interface ScoredOffer<T> {
  offer: T;
  score: number;
}

export interface OfferPair {
  flight: FlightOffer;
  accommodation: AccommodationOffer;
}

export interface CombineOffersOptions {
  maxFlights?: number;
  maxAccommodations?: number;
}

// Devuelve los N mejores por puntuación individual, sin tocar el array de
// entrada (fase 3: todo función pura). El desempate por identidad mantiene el
// resultado estable ante dos ofertas con la misma puntuación.
export function takeTopN<T>(
  items: readonly ScoredOffer<T>[],
  count: number,
  identityOf: (item: T) => string,
): ScoredOffer<T>[] {
  if (count <= 0) return [];
  return [...items]
    .sort((a, b) => b.score - a.score || identityOf(a.offer).localeCompare(identityOf(b.offer)))
    .slice(0, count);
}

// Producto cartesiano de vuelos por alojamientos, ya recortados.
export function combineOffers(
  flights: readonly ScoredOffer<FlightOffer>[],
  accommodations: readonly ScoredOffer<AccommodationOffer>[],
  options: CombineOffersOptions = {},
): OfferPair[] {
  const topFlights = takeTopN(flights, options.maxFlights ?? DEFAULT_TOP_FLIGHTS, (offer) => offer.id);
  const topAccommodations = takeTopN(
    accommodations,
    options.maxAccommodations ?? DEFAULT_TOP_ACCOMMODATIONS,
    (offer) => offer.id,
  );

  const pairs: OfferPair[] = [];
  for (const flight of topFlights) {
    for (const accommodation of topAccommodations) {
      pairs.push({ flight: flight.offer, accommodation: accommodation.offer });
    }
  }

  return pairs;
}
