import { describe, expect, it } from 'vitest';
import { hasCoordinates, MAP_CANVAS, projectStops } from './map-projection.ts';
import type { ItineraryItem } from '../types/api.ts';

// Geometría pura: sin DOM y sin React. La usan el mapa de la pantalla y el mapa
// del PDF, y por eso vive fuera del componente.

function stop(
  id: string,
  latitude: number | undefined,
  longitude: number | undefined,
  title = `Parada ${id}`,
): ItineraryItem {
  return {
    id,
    startTime: '2026-09-11T10:00:00.000Z',
    endTime: '2026-09-11T11:00:00.000Z',
    type: 'visit',
    title,
    durationMinutes: 60,
    latitude,
    longitude,
    verificationStatus: 'unverified',
  };
}

const TRES_PARADAS = [
  stop('a', 38.71, -9.14, 'Museo'),
  stop('b', 38.72, -9.13, 'Mirador'),
  stop('c', 38.73, -9.16, 'Playa'),
];

describe('hasCoordinates', () => {
  it('acepta una parada con las dos coordenadas', () => {
    expect(hasCoordinates(stop('a', 38.7, -9.1))).toBe(true);
  });

  // Las comidas no traen coordenadas: no hay proveedor de restaurantes. Que no
  // salgan en el mapa es la alternativa correcta a ponerlas en un sitio inventado.
  it('descarta una parada a la que le falta alguna', () => {
    expect(hasCoordinates(stop('a', 38.7, undefined))).toBe(false);
    expect(hasCoordinates(stop('a', undefined, -9.1))).toBe(false);
    expect(hasCoordinates(stop('a', undefined, undefined))).toBe(false);
  });
});

describe('projectStops', () => {
  it('sitúa cada parada dentro del lienzo', () => {
    for (const punto of projectStops(TRES_PARADAS)) {
      expect(punto.x).toBeGreaterThanOrEqual(0);
      expect(punto.x).toBeLessThanOrEqual(MAP_CANVAS);
      expect(punto.y).toBeGreaterThanOrEqual(0);
      expect(punto.y).toBeLessThanOrEqual(MAP_CANVAS);
    }
  });

  it('numera las paradas en el orden en que llegan', () => {
    expect(projectStops(TRES_PARADAS).map((punto) => punto.order)).toEqual([1, 2, 3]);
  });

  // El norte arriba: la latitud crece hacia arriba y la Y del lienzo hacia abajo.
  it('pone más arriba lo que está más al norte', () => {
    const [sur, norte] = projectStops([stop('sur', 38.70, -9.14), stop('norte', 38.75, -9.14)]);

    expect(norte?.y).toBeLessThan(sur?.y ?? 0);
  });

  it('pone más a la derecha lo que está más al este', () => {
    const [oeste, este] = projectStops([stop('oeste', 38.71, -9.20), stop('este', 38.71, -9.10)]);

    expect(este?.x).toBeGreaterThan(oeste?.x ?? 0);
  });

  // Si cada eje se estirara a su propio rango, dos paradas casi alineadas
  // saldrían en esquinas opuestas y el esquema diría algo falso sobre la ciudad.
  it('usa la misma escala en los dos ejes', () => {
    const puntos = projectStops([
      stop('a', 38.70, -9.20),
      stop('b', 38.71, -9.20),
      stop('c', 38.70, -9.10),
    ]);

    const distanciaVertical = Math.abs((puntos[1]?.y ?? 0) - (puntos[0]?.y ?? 0));
    const distanciaHorizontal = Math.abs((puntos[2]?.x ?? 0) - (puntos[0]?.x ?? 0));

    // Diez veces más lejos en longitud que en latitud tiene que dibujarse más
    // lejos. Si cada eje se estirara a su propio rango, los dos ocuparían el
    // lienzo entero y estas dos distancias saldrían parecidas.
    expect(distanciaHorizontal).toBeGreaterThan(distanciaVertical * 2);
  });

  // Sin esto la división daría infinito y las chinchetas desaparecerían.
  it('no revienta con una sola parada', () => {
    const [punto] = projectStops([stop('a', 38.71, -9.14)]);

    expect(Number.isFinite(punto?.x)).toBe(true);
    expect(Number.isFinite(punto?.y)).toBe(true);
  });

  it('no revienta con paradas en línea recta', () => {
    const puntos = projectStops([stop('a', 38.71, -9.14), stop('b', 38.75, -9.14)]);

    for (const punto of puntos) {
      expect(Number.isFinite(punto.x)).toBe(true);
      expect(Number.isFinite(punto.y)).toBe(true);
    }
  });

  it('ignora las paradas sin coordenadas', () => {
    const puntos = projectStops([stop('a', 38.71, -9.14), stop('comida', undefined, undefined)]);

    expect(puntos).toHaveLength(1);
  });

  it('no devuelve nada si ninguna parada trae coordenadas', () => {
    expect(projectStops([stop('comida', undefined, undefined)])).toEqual([]);
    expect(projectStops([])).toEqual([]);
  });
});
