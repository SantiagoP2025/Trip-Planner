import type { AccommodationOffer } from '../types/accommodation.js';
import type { FlightOffer, FlightSegment } from '../types/flight.js';
import type { ItineraryItem } from '../types/itinerary.js';

// Constructores de ofertas para las pruebas de los algoritmos. Solo lo usan los
// ficheros *.test.ts: el código de producción recibe estas ofertas de los
// proveedores (sección 14.1).

interface FlightOptions {
  id: string;
  totalPrice: number;
  totalDurationMinutes?: number;
  stops?: number;
  baggageIncluded?: boolean;
  refundable?: boolean;
  departureTime?: string;
  arrivalTime?: string;
  returnDepartureTime?: string;
  returnArrivalTime?: string;
}

function segment(origin: string, destination: string, departureTime: string, arrivalTime: string): FlightSegment {
  return {
    origin,
    destination,
    departureTime,
    arrivalTime,
    carrier: 'Iberia',
    flightNumber: 'IB100',
    durationMinutes: (new Date(arrivalTime).getTime() - new Date(departureTime).getTime()) / 60_000,
  };
}

export function buildFlight(options: FlightOptions): FlightOffer {
  const departureTime = options.departureTime ?? '2026-09-10T09:00:00.000Z';
  const arrivalTime = options.arrivalTime ?? '2026-09-10T11:00:00.000Z';
  const returnDepartureTime = options.returnDepartureTime ?? '2026-09-17T17:00:00.000Z';
  const returnArrivalTime = options.returnArrivalTime ?? '2026-09-17T19:00:00.000Z';

  return {
    id: options.id,
    provider: 'test',
    totalPrice: options.totalPrice,
    currency: 'EUR',
    outbound: [segment('MAD', 'LIS', departureTime, arrivalTime)],
    inbound: [segment('LIS', 'MAD', returnDepartureTime, returnArrivalTime)],
    totalDurationMinutes: options.totalDurationMinutes ?? 120,
    stops: options.stops ?? 0,
    baggageIncluded: options.baggageIncluded ?? true,
    refundable: options.refundable ?? false,
    fetchedAt: '2026-08-07T10:00:00.000Z',
  };
}

interface AccommodationOptions {
  id: string;
  totalPrice: number;
  rating?: number;
  reviewCount?: number;
  distanceToCenterKm?: number;
  capacity?: number;
  breakfastIncluded?: boolean;
  freeCancellation?: boolean;
}

export function buildAccommodation(options: AccommodationOptions): AccommodationOffer {
  return {
    id: options.id,
    provider: 'test',
    name: `Hotel ${options.id}`,
    totalPrice: options.totalPrice,
    currency: 'EUR',
    rating: options.rating,
    reviewCount: options.reviewCount,
    latitude: 38.72,
    longitude: -9.14,
    distanceToCenterKm: options.distanceToCenterKm,
    breakfastIncluded: options.breakfastIncluded ?? false,
    freeCancellation: options.freeCancellation ?? false,
    capacity: options.capacity ?? 4,
    fetchedAt: '2026-08-07T10:00:00.000Z',
  };
}

export function buildItineraryItem(id: string, startTime: string, endTime: string): ItineraryItem {
  return {
    id,
    startTime,
    endTime,
    type: 'visit',
    title: `Visita ${id}`,
    durationMinutes: (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60_000,
    verificationStatus: 'unverified',
  };
}
