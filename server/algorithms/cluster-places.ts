import type { TravelMatrix } from './travel-matrix.js';

// Sección 12.3: `clusterPlacesByProximity()` y `distributePlacesAcrossDays()`.
//
// El objetivo no es la agrupación óptima —eso es un problema NP— sino que un día
// no mande al usuario de una punta a otra de la ciudad y vuelta. Un voraz
// determinista basta y se explica en tres líneas, que es justo lo que hace falta
// para poder revisarlo.
//
// Determinista de verdad: todos los empates se rompen por identificador. La
// misma búsqueda tiene que dar siempre el mismo itinerario (convención de
// CLAUDE.md sobre aleatoriedad), y un empate resuelto por orden de iteración de
// un `Set` no lo garantiza.

// Lo que se usa cuando la matriz no conoce un par. No es un tiempo de viaje
// inventado: es un "lo más lejos posible", para que un lugar inalcanzable no
// acabe emparejado con nada por casualidad. El planificador lo descartará
// después, cuando pregunte por ese mismo par y tampoco obtenga respuesta.
const UNKNOWN_DISTANCE = Number.POSITIVE_INFINITY;

export interface ClusterPlacesInput {
  placeIds: readonly string[];
  // El alojamiento: el punto del que se sale y al que se vuelve cada día.
  anchorId: string;
  matrix: TravelMatrix;
  clusterCount: number;
  maxPerCluster: number;
}

function pickBy(
  pending: ReadonlySet<string>,
  score: (id: string) => number,
  better: (candidate: number, current: number) => boolean,
): string | undefined {
  let chosen: string | undefined;
  let chosenScore = 0;

  for (const id of pending) {
    const value = score(id);
    if (chosen === undefined || better(value, chosenScore) || (value === chosenScore && id < chosen)) {
      chosen = id;
      chosenScore = value;
    }
  }

  return chosen;
}

// Ordena un grupo como se recorrería a pie: desde el alojamiento, siempre al más
// cercano de los que quedan. Es el orden en el que después se asignan las horas,
// así que decidirlo aquí evita que el planificador tenga que reordenar nada.
function orderAsRoute(
  placeIds: readonly string[],
  anchorId: string,
  matrix: TravelMatrix,
): string[] {
  const pending = new Set(placeIds);
  const route: string[] = [];
  let current = anchorId;

  while (pending.size > 0) {
    const next = pickBy(
      pending,
      (id) => matrix.minutesBetween(current, id) ?? UNKNOWN_DISTANCE,
      (candidate, best) => candidate < best,
    );
    if (next === undefined) break;

    pending.delete(next);
    route.push(next);
    current = next;
  }

  return route;
}

export function clusterPlacesByProximity(input: ClusterPlacesInput): string[][] {
  const maxPerCluster = Math.max(1, Math.floor(input.maxPerCluster));
  const clusterCount = Math.max(0, Math.floor(input.clusterCount));
  if (clusterCount === 0) return [];

  const pending = new Set(input.placeIds);

  // Regla 6 de CLAUDE.md: la distancia de cada lugar al alojamiento se calcula
  // una vez, aquí, y no dentro del bucle que elige semillas. Recalcularla en
  // cada vuelta convertiría el reparto en cuadrático sobre la lista de lugares.
  const fromAnchor = new Map<string, number>();
  for (const id of input.placeIds) {
    fromAnchor.set(id, input.matrix.minutesBetween(input.anchorId, id) ?? UNKNOWN_DISTANCE);
  }

  const clusters: string[][] = [];

  while (clusters.length < clusterCount && pending.size > 0) {
    // La semilla es el lugar más lejano del alojamiento que quede por asignar:
    // lo que está lejos ancla su propio día y arrastra a sus vecinos, en vez de
    // quedar suelto al final y obligar a una travesía extra.
    const seed = pickBy(
      pending,
      (id) => fromAnchor.get(id) ?? UNKNOWN_DISTANCE,
      (candidate, best) => candidate > best,
    );
    if (seed === undefined) break;

    pending.delete(seed);
    const members = [seed];

    while (members.length < maxPerCluster && pending.size > 0) {
      const nearest = pickBy(
        pending,
        (id) => input.matrix.minutesBetween(seed, id) ?? UNKNOWN_DISTANCE,
        (candidate, best) => candidate < best,
      );
      if (nearest === undefined) break;

      pending.delete(nearest);
      members.push(nearest);
    }

    clusters.push(orderAsRoute(members, input.anchorId, input.matrix));
  }

  // Los lugares que sobran no se devuelven: no caben en el viaje. Repartirlos a
  // la fuerza entre días ya llenos es exactamente lo que la sección 12.1 evita
  // con su tope de tres visitas diarias.
  return clusters;
}

export interface DistributePlacesInput {
  clusters: readonly (readonly string[])[];
  // Cuántas visitas admite cada día. El primero y el último suelen admitir menos
  // porque se los comen la llegada y el traslado de vuelta (sección 12.1).
  capacityPerDay: readonly number[];
}

export function distributePlacesAcrossDays(input: DistributePlacesInput): string[][] {
  const byDay: string[][] = input.capacityPerDay.map(() => []);

  // Los grupos más grandes van a los días con más hueco. Al revés, un día largo
  // se quedaría con dos visitas mientras el día de llegada recibe tres y hay que
  // recortarlas.
  const days = input.capacityPerDay
    .map((capacity, index) => ({ index, capacity: Math.max(0, Math.floor(capacity)) }))
    .sort((a, b) => b.capacity - a.capacity || a.index - b.index);

  const clusters = [...input.clusters].sort(
    (a, b) => b.length - a.length || (a[0] ?? '').localeCompare(b[0] ?? ''),
  );

  for (let position = 0; position < days.length; position += 1) {
    const day = days[position];
    const cluster = clusters[position];
    if (!day || !cluster) break;

    // El recorte se queda con las primeras, que son las más cercanas al
    // alojamiento en el orden de recorrido: es lo que cabe en un día corto.
    byDay[day.index] = cluster.slice(0, day.capacity);
  }

  return byDay;
}
