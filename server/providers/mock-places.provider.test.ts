import { describe, expect, it } from 'vitest';
import type { ActivitySearchRequest } from '../types/provider.js';
import { MockPlacesProvider } from './mock-places.provider.js';

const request: ActivitySearchRequest = { destination: 'Lisboa' };
const PREFERENCE_KEYS = ['beach', 'culture', 'gastronomy', 'nightlife', 'nature', 'shopping', 'family', 'relax'];

describe('MockPlacesProvider', () => {
  it('la misma búsqueda da siempre la misma lista de candidatos', async () => {
    const provider = new MockPlacesProvider();
    const first = await provider.searchActivities(request);
    const second = await provider.searchActivities(request);
    expect(first).toEqual(second);
  });

  it('una búsqueda distinta da una lista distinta', async () => {
    const provider = new MockPlacesProvider();
    const first = await provider.searchActivities(request);
    const second = await provider.searchActivities({ destination: 'Roma' });
    expect(first).not.toEqual(second);
  });

  it('respeta el límite pedido', async () => {
    const provider = new MockPlacesProvider();
    const limited = await provider.searchActivities({ destination: 'Lisboa', limit: 5 });
    expect(limited.length).toBeLessThanOrEqual(5);
  });

  it('respeta el contrato de ActivityCandidate', async () => {
    const provider = new MockPlacesProvider();
    const candidates = await provider.searchActivities(request);

    expect(candidates.length).toBeGreaterThanOrEqual(20);
    expect(candidates.length).toBeLessThanOrEqual(30);

    for (const candidate of candidates) {
      expect(typeof candidate.id).toBe('string');
      expect(typeof candidate.name).toBe('string');
      expect(typeof candidate.category).toBe('string');
      expect(Object.keys(candidate.profile).sort()).toEqual([...PREFERENCE_KEYS].sort());
      for (const level of Object.values(candidate.profile)) {
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(3);
      }
      expect(Number.isFinite(candidate.latitude)).toBe(true);
      expect(Number.isFinite(candidate.longitude)).toBe(true);
      expect(candidate.estimatedDurationMinutes).toBeGreaterThan(0);
      // Sección 15.2: sin fuente externa real, ningún candidato simulado puede
      // marcarse como verificado.
      expect(candidate.verificationStatus).toBe('unverified');
    }
  });
});
