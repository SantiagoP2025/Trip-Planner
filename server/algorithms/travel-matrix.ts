import type { RouteMatrixEntry, RouteTransportMode } from '../types/provider.js';

// Sección 12.3: `calculateTravelMatrix()`. Convierte la lista plana que devuelve
// el proveedor de rutas en algo que se pueda consultar por pares.
//
// Existe por la regla 6 de CLAUDE.md: el planificador consulta el tiempo entre
// dos puntos una vez por cada paso del horario. Si cada consulta recorriera la
// lista de entradas, planificar un día sería cuadrático sobre una lista que
// crece con el cuadrado de los lugares. Se indexa una vez, aquí, y después cada
// consulta es directa.
//
// Un mapa de mapas y no un mapa con la clave compuesta: componer claves con un
// separador obliga a garantizar que el separador no aparece dentro de ningún
// identificador de lugar, y esa garantía depende de lo que devuelva un tercero.

export interface TravelMatrix {
  // `undefined` cuando el proveedor no devolvió ese par. Quien llama decide qué
  // hacer, y lo que **no** puede hacer es inventarse un tiempo de desplazamiento
  // (regla 12 del plan: nada de datos inventados que parezcan reales).
  minutesBetween(originId: string, destinationId: string): number | undefined;
  entry(originId: string, destinationId: string): RouteMatrixEntry | undefined;
  readonly size: number;
}

export function calculateTravelMatrix(entries: readonly RouteMatrixEntry[]): TravelMatrix {
  const byOrigin = new Map<string, Map<string, RouteMatrixEntry>>();
  let size = 0;

  for (const entry of entries) {
    let destinations = byOrigin.get(entry.originId);
    if (!destinations) {
      destinations = new Map<string, RouteMatrixEntry>();
      byOrigin.set(entry.originId, destinations);
    }
    if (!destinations.has(entry.destinationId)) size += 1;
    destinations.set(entry.destinationId, entry);
  }

  const lookup = (originId: string, destinationId: string): RouteMatrixEntry | undefined =>
    byOrigin.get(originId)?.get(destinationId);

  return {
    entry: lookup,

    minutesBetween(originId, destinationId) {
      // Ir de un sitio a ese mismo sitio no cuesta nada, lo diga o no la matriz.
      // Pasa de verdad: el alojamiento como punto de partida de un día en el que
      // además hay algo que hacer en el propio alojamiento.
      if (originId === destinationId) return 0;
      return lookup(originId, destinationId)?.durationMinutes;
    },

    get size() {
      return size;
    },
  };
}

// Modo de desplazamiento por defecto del itinerario.
//
// Transporte público y no "a pie": las actividades de una ciudad se reparten por
// varios kilómetros, y a pie los trayectos salían de más de dos horas, con lo
// que casi ninguna visita entraba en el día. Un turista con dos paradas en
// puntas opuestas coge el metro, no camina doce kilómetros.
//
// El proveedor real podrá decidir el modo tramo a tramo —a pie lo cercano,
// transporte lo lejano— y la matriz ya trae el modo en cada entrada para que el
// itinerario lo enseñe.
export const DEFAULT_TRANSPORT_MODE: RouteTransportMode = 'transit';
