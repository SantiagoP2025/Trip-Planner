import { describe, expect, it } from 'vitest';
import type { RouteMatrixRequest } from '../types/provider.js';
import { MockRoutesProvider } from './mock-routes.provider.js';

const pointA = { id: 'a', latitude: 40.4168, longitude: -3.7038 };
const pointB = { id: 'b', latitude: 40.42, longitude: -3.71 };
const pointC = { id: 'c', latitude: 40.43, longitude: -3.7 };

describe('MockRoutesProvider', () => {
  it('la misma petición da siempre la misma matriz', async () => {
    const provider = new MockRoutesProvider();
    const request: RouteMatrixRequest = { origins: [pointA, pointB], destinations: [pointB, pointC] };
    const first = await provider.calculateMatrix(request);
    const second = await provider.calculateMatrix(request);
    expect(first).toEqual(second);
  });

  it('devuelve una entrada por cada combinación origen-destino', async () => {
    const provider = new MockRoutesProvider();
    const entries = await provider.calculateMatrix({ origins: [pointA, pointB], destinations: [pointB, pointC] });
    expect(entries).toHaveLength(4);
  });

  it('la distancia entre un punto y sí mismo es cero', async () => {
    const provider = new MockRoutesProvider();
    const [entry] = await provider.calculateMatrix({ origins: [pointA], destinations: [pointA] });
    expect(entry.distanceKm).toBe(0);
    expect(entry.durationMinutes).toBeGreaterThanOrEqual(1);
  });

  it('la distancia es simétrica entre dos puntos', async () => {
    const provider = new MockRoutesProvider();
    const [forward] = await provider.calculateMatrix({ origins: [pointA], destinations: [pointB] });
    const [backward] = await provider.calculateMatrix({ origins: [pointB], destinations: [pointA] });
    expect(forward.distanceKm).toBe(backward.distanceKm);
  });

  it('usa el modo de transporte pedido', async () => {
    const provider = new MockRoutesProvider();
    const [walking] = await provider.calculateMatrix({ origins: [pointA], destinations: [pointC], mode: 'walking' });
    const [driving] = await provider.calculateMatrix({ origins: [pointA], destinations: [pointC], mode: 'driving' });
    expect(walking.mode).toBe('walking');
    expect(driving.mode).toBe('driving');
    expect(walking.durationMinutes).toBeGreaterThan(driving.durationMinutes);
  });
});
