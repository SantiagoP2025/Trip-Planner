import type { FlightOffer, FlightSegment } from '../types/flight.ts';
import type { FlightSearchRequest } from '../types/provider.ts';
import { randomBoolean, randomFloat, randomInt, randomItem } from './prng.ts';

const CARRIERS = [
  'Iberia',
  'Vueling',
  'Ryanair',
  'Air Europa',
  'Lufthansa',
  'Air France',
  'KLM',
  'TAP Portugal',
  'Easyjet',
  'Norwegian',
];

const HUB_CODES = ['MAD', 'BCN', 'CDG', 'FRA', 'AMS', 'LIS', 'FCO', 'MXP'];

const MIN_OFFERS = 15;
const MAX_OFFERS = 20;
const MIN_SEGMENT_MINUTES = 60;
const MAX_SEGMENT_MINUTES = 360;
const LAYOVER_MIN_MINUTES = 40;
const LAYOVER_MAX_MINUTES = 150;

function toAirportCode(cityName: string): string {
  const letters = cityName.replace(/[^a-zA-Z]/g, '').toUpperCase();
  return (letters.slice(0, 3) || 'XXX').padEnd(3, 'X');
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function buildLeg(origin: string, destination: string, date: string, random: () => number, stops: number): FlightSegment[] {
  const originCode = toAirportCode(origin);
  const destinationCode = toAirportCode(destination);
  const waypoints = [originCode, ...Array.from({ length: stops }, () => randomItem(random, HUB_CODES)), destinationCode];
  const segments: FlightSegment[] = [];
  let cursor = `${date}T${String(randomInt(random, 5, 21)).padStart(2, '0')}:${randomItem(random, ['00', '15', '30', '45'])}:00.000Z`;
  const carrier = randomItem(random, CARRIERS);
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const durationMinutes = randomInt(random, MIN_SEGMENT_MINUTES, MAX_SEGMENT_MINUTES);
    const departureTime = cursor;
    const arrivalTime = addMinutes(departureTime, durationMinutes);
    segments.push({
      origin: waypoints[i],
      destination: waypoints[i + 1],
      departureTime,
      arrivalTime,
      carrier,
      flightNumber: `${carrier.slice(0, 2).toUpperCase()}${randomInt(random, 100, 999)}`,
      durationMinutes,
    });
    cursor = addMinutes(arrivalTime, randomInt(random, LAYOVER_MIN_MINUTES, LAYOVER_MAX_MINUTES));
  }
  return segments;
}

function sumDuration(segments: FlightSegment[]): number {
  return segments.reduce((total, segment) => total + segment.durationMinutes, 0);
}

// Sección 11.1 y 14.1: mismos campos que producirá el proveedor real de vuelos
// (p.ej. Amadeus), para que el motor de puntuación no distinga entre ambos.
export function generateFlightOffers(
  request: FlightSearchRequest,
  random: () => number,
  clock: () => Date = () => new Date(),
): FlightOffer[] {
  const travelers = request.adults + request.children;
  const offerCount = randomInt(random, MIN_OFFERS, MAX_OFFERS);
  const fetchedAt = clock().toISOString();
  const offers: FlightOffer[] = [];

  for (let i = 0; i < offerCount; i += 1) {
    const stops = randomInt(random, 0, 2);
    const outbound = buildLeg(request.origin, request.destination, request.departureDate, random, stops);
    const inboundStops = randomInt(random, 0, 2);
    const inbound = buildLeg(request.destination, request.origin, request.returnDate, random, inboundStops);
    const pricePerPerson = randomFloat(random, 45, 650, 2);

    offers.push({
      id: `mock-flight-${i}`,
      provider: 'mock-flights',
      totalPrice: Math.round(pricePerPerson * travelers * 100) / 100,
      currency: request.currency,
      outbound,
      inbound,
      totalDurationMinutes: sumDuration(outbound),
      stops,
      baggageIncluded: randomBoolean(random, 0.6),
      refundable: randomBoolean(random, 0.25),
      bookingUrl: `https://mock-flights.example.com/offers/mock-flight-${i}`,
      fetchedAt,
    });
  }

  return offers;
}
