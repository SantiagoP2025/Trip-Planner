import { describe, expect, it } from 'vitest';
import type { RouteMatrixEntry } from '../types/provider.ts';
import { clusterPlacesByProximity, distributePlacesAcrossDays } from './cluster-places.ts';
import { calculateTravelMatrix, type TravelMatrix } from './travel-matrix.ts';

// Ciudad de juguete en una recta: el hotel en el kilómetro 0 y cada lugar a su
// distancia. Un minuto por kilómetro, para que los números se lean solos.
const POSITIONS: Record<string, number> = {
  hotel: 0,
  cerca1: 2,
  cerca2: 3,
  cerca3: 4,
  lejos1: 40,
  lejos2: 42,
  lejos3: 44,
};

function lineMatrix(positions: Record<string, number> = POSITIONS): TravelMatrix {
  const entries: RouteMatrixEntry[] = [];
  for (const [originId, from] of Object.entries(positions)) {
    for (const [destinationId, to] of Object.entries(positions)) {
      entries.push({
        originId,
        destinationId,
        distanceKm: Math.abs(to - from),
        durationMinutes: Math.abs(to - from),
        mode: 'transit',
      });
    }
  }
  return calculateTravelMatrix(entries);
}

describe('clusterPlacesByProximity', () => {
  // La razón de ser de la función: que un día no mande al usuario de una punta a
  // otra de la ciudad y vuelta.
  it('agrupa lo que está junto y separa lo que está lejos', () => {
    const clusters = clusterPlacesByProximity({
      placeIds: ['cerca1', 'cerca2', 'cerca3', 'lejos1', 'lejos2', 'lejos3'],
      anchorId: 'hotel',
      matrix: lineMatrix(),
      clusterCount: 2,
      maxPerCluster: 3,
    });

    expect(clusters).toHaveLength(2);
    const grupos = clusters.map((cluster) => [...cluster].sort());
    expect(grupos).toContainEqual(['cerca1', 'cerca2', 'cerca3']);
    expect(grupos).toContainEqual(['lejos1', 'lejos2', 'lejos3']);
  });

  // Lo lejano ancla su propio día en vez de quedar suelto al final y obligar a
  // una travesía extra.
  it('empieza por lo más lejano al alojamiento', () => {
    const [primero] = clusterPlacesByProximity({
      placeIds: ['cerca1', 'lejos1', 'lejos2'],
      anchorId: 'hotel',
      matrix: lineMatrix(),
      clusterCount: 2,
      maxPerCluster: 2,
    });

    expect(primero).toContain('lejos2');
  });

  it('ordena cada grupo como se recorrería desde el alojamiento', () => {
    const [grupo] = clusterPlacesByProximity({
      placeIds: ['cerca1', 'cerca2', 'cerca3'],
      anchorId: 'hotel',
      matrix: lineMatrix(),
      clusterCount: 1,
      maxPerCluster: 3,
    });

    expect(grupo).toEqual(['cerca1', 'cerca2', 'cerca3']);
  });

  it('respeta el tope de lugares por grupo', () => {
    const clusters = clusterPlacesByProximity({
      placeIds: ['cerca1', 'cerca2', 'cerca3', 'lejos1'],
      anchorId: 'hotel',
      matrix: lineMatrix(),
      clusterCount: 2,
      maxPerCluster: 2,
    });

    for (const cluster of clusters) {
      expect(cluster.length).toBeLessThanOrEqual(2);
    }
  });

  // Sección 12.1: apretar cuatro visitas en un día es justo lo que evita el tope
  // de tres. Lo que no cabe, no cabe.
  it('deja fuera lo que no cabe en ningún grupo', () => {
    const clusters = clusterPlacesByProximity({
      placeIds: ['cerca1', 'cerca2', 'cerca3', 'lejos1'],
      anchorId: 'hotel',
      matrix: lineMatrix(),
      clusterCount: 1,
      maxPerCluster: 2,
    });

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(2);
  });

  it('no devuelve grupos cuando no hay días para visitas', () => {
    expect(
      clusterPlacesByProximity({
        placeIds: ['cerca1'],
        anchorId: 'hotel',
        matrix: lineMatrix(),
        clusterCount: 0,
        maxPerCluster: 3,
      }),
    ).toEqual([]);
  });

  // Convención de CLAUDE.md: la misma búsqueda da siempre el mismo resultado.
  // Con empates a la misma distancia, el desempate por identificador es lo que
  // impide que el orden de iteración decida el itinerario.
  it('es determinista ante distancias empatadas', () => {
    const empatados = { hotel: 0, a: 5, b: 5, c: 5, d: 5 };
    const input = {
      placeIds: ['d', 'c', 'b', 'a'],
      anchorId: 'hotel',
      matrix: lineMatrix(empatados),
      clusterCount: 2,
      maxPerCluster: 2,
    };

    expect(clusterPlacesByProximity(input)).toEqual(clusterPlacesByProximity(input));
  });

  it('sobrevive a una matriz que no conoce algunos pares', () => {
    const matrix = calculateTravelMatrix([
      { originId: 'hotel', destinationId: 'a', distanceKm: 1, durationMinutes: 5, mode: 'transit' },
    ]);

    const clusters = clusterPlacesByProximity({
      placeIds: ['a', 'b'],
      anchorId: 'hotel',
      matrix,
      clusterCount: 1,
      maxPerCluster: 2,
    });

    expect(clusters[0]).toHaveLength(2);
  });
});

describe('distributePlacesAcrossDays', () => {
  it('reparte un grupo por día', () => {
    const byDay = distributePlacesAcrossDays({
      clusters: [['a', 'b'], ['c']],
      capacityPerDay: [3, 3],
    });

    expect(byDay).toHaveLength(2);
    expect(byDay.flat().sort()).toEqual(['a', 'b', 'c']);
  });

  // Al revés, un día largo se quedaría con dos visitas mientras el día de
  // llegada recibe tres y hay que recortarlas.
  it('da los grupos más grandes a los días con más hueco', () => {
    const byDay = distributePlacesAcrossDays({
      clusters: [['a'], ['b', 'c', 'd']],
      capacityPerDay: [1, 3],
    });

    expect(byDay[0]).toEqual(['a']);
    expect(byDay[1]).toEqual(['b', 'c', 'd']);
  });

  it('recorta el grupo a la capacidad del día', () => {
    const byDay = distributePlacesAcrossDays({
      clusters: [['a', 'b', 'c']],
      capacityPerDay: [2],
    });

    expect(byDay[0]).toEqual(['a', 'b']);
  });

  it('deja vacíos los días sin capacidad', () => {
    const byDay = distributePlacesAcrossDays({
      clusters: [['a', 'b']],
      capacityPerDay: [0, 2],
    });

    expect(byDay[0]).toEqual([]);
    expect(byDay[1]).toEqual(['a', 'b']);
  });

  it('devuelve un hueco por día aunque no haya grupos', () => {
    expect(distributePlacesAcrossDays({ clusters: [], capacityPerDay: [3, 3, 3] })).toEqual([
      [],
      [],
      [],
    ]);
  });
});
