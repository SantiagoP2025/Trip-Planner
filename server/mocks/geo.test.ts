import { describe, expect, it } from 'vitest';
import { createSeededRandom } from './prng.ts';
import { deriveBaseCoordinate, haversineDistanceKm, jitterCoordinate } from './geo.ts';

describe('deriveBaseCoordinate', () => {
  it('el mismo destino da siempre la misma coordenada', () => {
    expect(deriveBaseCoordinate('Lisboa')).toEqual(deriveBaseCoordinate('Lisboa'));
  });

  it('destinos distintos dan coordenadas distintas', () => {
    expect(deriveBaseCoordinate('Lisboa')).not.toEqual(deriveBaseCoordinate('Tokio'));
  });
});

describe('jitterCoordinate', () => {
  it('se mantiene dentro del radio pedido', () => {
    const base = deriveBaseCoordinate('Roma');
    const random = createSeededRandom('jitter');
    for (let i = 0; i < 50; i += 1) {
      const point = jitterCoordinate(base, random, 5);
      expect(haversineDistanceKm(base, point)).toBeLessThanOrEqual(5.01);
    }
  });
});

describe('haversineDistanceKm', () => {
  it('la distancia de un punto a sí mismo es cero', () => {
    const point = { latitude: 40.4168, longitude: -3.7038 };
    expect(haversineDistanceKm(point, point)).toBe(0);
  });

  it('es simétrica', () => {
    const madrid = { latitude: 40.4168, longitude: -3.7038 };
    const paris = { latitude: 48.8566, longitude: 2.3522 };
    expect(haversineDistanceKm(madrid, paris)).toBe(haversineDistanceKm(paris, madrid));
  });
});
