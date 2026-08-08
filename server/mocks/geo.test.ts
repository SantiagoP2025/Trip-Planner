import { describe, expect, it } from 'vitest';
import { createSeededRandom } from './prng.ts';
import {
  deriveBaseCoordinate,
  haversineDistanceKm,
  jitterCoordinate,
  wrapLongitude,
} from './geo.ts';

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

// Regla 12 del plan y fallo B.1 de la auditoría: las coordenadas simuladas no
// serán las de verdad, pero tienen que ser coordenadas. Una longitud de -428 no
// es un punto de la Tierra, y el mapa de la fase 10 no puede dibujarla.
describe('las coordenadas simuladas son coordenadas posibles', () => {
  // Suficientes destinos para tocar las dos mitades del hash: el fallo original
  // solo aparecía cuando el bit más alto estaba a uno.
  const DESTINOS = [
    'Lisboa', 'Tokio', 'Valencia', 'Roma', 'Oslo', 'El Cairo', 'Bogotá', 'Seúl',
    'Nairobi', 'Reikiavik', 'Auckland', 'Lima', 'Praga', 'Dakar', 'Hanói', 'Quito',
  ];

  it('la latitud está dentro de [-90, 90] y la longitud dentro de [-180, 180]', () => {
    for (const destino of DESTINOS) {
      const { latitude, longitude } = deriveBaseCoordinate(destino);

      expect(latitude, destino).toBeGreaterThanOrEqual(-90);
      expect(latitude, destino).toBeLessThanOrEqual(90);
      expect(longitude, destino).toBeGreaterThanOrEqual(-180);
      expect(longitude, destino).toBeLessThanOrEqual(180);
    }
  });

  it('dispersar un punto tampoco lo saca del mundo', () => {
    for (const destino of DESTINOS) {
      const base = deriveBaseCoordinate(destino);
      const random = createSeededRandom(destino);
      const { latitude, longitude } = jitterCoordinate(base, random, 10);

      expect(latitude, destino).toBeGreaterThanOrEqual(-90);
      expect(latitude, destino).toBeLessThanOrEqual(90);
      expect(longitude, destino).toBeGreaterThanOrEqual(-180);
      expect(longitude, destino).toBeLessThanOrEqual(180);
    }
  });

  it('devuelve la longitud al otro lado del antimeridiano', () => {
    expect(wrapLongitude(180.2)).toBeCloseTo(-179.8, 6);
    expect(wrapLongitude(-180.5)).toBeCloseTo(179.5, 6);
    expect(wrapLongitude(-9.14)).toBeCloseTo(-9.14, 6);
  });
});
