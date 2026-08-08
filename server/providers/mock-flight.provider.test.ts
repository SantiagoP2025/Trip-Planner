import { describe, expect, it } from 'vitest';
import type { FlightSearchRequest } from '../types/provider.js';
import { MockFlightProvider } from './mock-flight.provider.js';

const request: FlightSearchRequest = {
  origin: 'Madrid',
  destination: 'Lisboa',
  departureDate: '2026-09-10',
  returnDate: '2026-09-17',
  adults: 2,
  children: 1,
  currency: 'EUR',
};

const fixedClock = () => new Date('2026-08-07T10:00:00.000Z');

describe('MockFlightProvider', () => {
  it('la misma búsqueda da siempre la misma lista de ofertas', async () => {
    const provider = new MockFlightProvider(fixedClock);
    const first = await provider.searchFlights(request);
    const second = await provider.searchFlights(request);
    expect(first).toEqual(second);
  });

  it('una búsqueda distinta da una lista distinta', async () => {
    const provider = new MockFlightProvider(fixedClock);
    const first = await provider.searchFlights(request);
    const second = await provider.searchFlights({ ...request, destination: 'Roma' });
    expect(first).not.toEqual(second);
  });

  it('respeta el contrato de FlightOffer', async () => {
    const provider = new MockFlightProvider(fixedClock);
    const offers = await provider.searchFlights(request);

    expect(offers.length).toBeGreaterThanOrEqual(15);
    expect(offers.length).toBeLessThanOrEqual(20);

    for (const offer of offers) {
      expect(typeof offer.id).toBe('string');
      expect(offer.totalPrice).toBeGreaterThan(0);
      expect(offer.currency).toBe('EUR');
      expect(offer.outbound.length).toBeGreaterThan(0);
      expect(offer.inbound?.length ?? 0).toBeGreaterThan(0);
      expect(offer.stops).toBe(offer.outbound.length - 1);
      expect(offer.totalDurationMinutes).toBeGreaterThan(0);
      expect(typeof offer.baggageIncluded).toBe('boolean');
      expect(typeof offer.refundable).toBe('boolean');
      expect(() => new Date(offer.fetchedAt).toISOString()).not.toThrow();

      for (const segment of [...offer.outbound, ...(offer.inbound ?? [])]) {
        expect(segment.origin).toHaveLength(3);
        expect(segment.destination).toHaveLength(3);
        expect(new Date(segment.arrivalTime).getTime()).toBeGreaterThan(new Date(segment.departureTime).getTime());
        expect(segment.durationMinutes).toBeGreaterThan(0);
      }
    }
  });
});
