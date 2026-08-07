import { describe, expect, it } from 'vitest';
import type { AccommodationSearchRequest } from '../types/provider.ts';
import { MockAccommodationProvider } from './mock-accommodation.provider.ts';

const request: AccommodationSearchRequest = {
  destination: 'Lisboa',
  checkIn: '2026-09-10',
  checkOut: '2026-09-17',
  adults: 2,
  children: 1,
  currency: 'EUR',
};

const fixedClock = () => new Date('2026-08-07T10:00:00.000Z');

describe('MockAccommodationProvider', () => {
  it('la misma búsqueda da siempre la misma lista de ofertas', async () => {
    const provider = new MockAccommodationProvider(fixedClock);
    const first = await provider.searchAccommodations(request);
    const second = await provider.searchAccommodations(request);
    expect(first).toEqual(second);
  });

  it('una búsqueda distinta da una lista distinta', async () => {
    const provider = new MockAccommodationProvider(fixedClock);
    const first = await provider.searchAccommodations(request);
    const second = await provider.searchAccommodations({ ...request, destination: 'Roma' });
    expect(first).not.toEqual(second);
  });

  it('respeta el contrato de AccommodationOffer', async () => {
    const provider = new MockAccommodationProvider(fixedClock);
    const offers = await provider.searchAccommodations(request);
    const travelers = request.adults + request.children;

    expect(offers.length).toBeGreaterThanOrEqual(15);
    expect(offers.length).toBeLessThanOrEqual(20);

    for (const offer of offers) {
      expect(typeof offer.id).toBe('string');
      expect(offer.name).toContain('Lisboa');
      expect(offer.totalPrice).toBeGreaterThan(0);
      expect(offer.currency).toBe('EUR');
      expect(offer.capacity).toBeGreaterThanOrEqual(travelers);
      expect(Number.isFinite(offer.latitude)).toBe(true);
      expect(Number.isFinite(offer.longitude)).toBe(true);
      expect(() => new Date(offer.fetchedAt).toISOString()).not.toThrow();
      if (offer.rating !== undefined) {
        expect(offer.rating).toBeGreaterThanOrEqual(2.5);
        expect(offer.rating).toBeLessThanOrEqual(5);
      }
    }
  });
});
