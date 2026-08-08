import type { ItineraryItem } from '../types/api.ts';

// Proyección de las paradas de un día sobre un lienzo cuadrado.
//
// Vive aquí, y no dentro de `DayMap.tsx`, porque la usan dos cosas que no
// comparten nada más: el mapa de la pantalla (SVG, React) y el mapa del PDF
// (vectores, sin DOM). Es geometría pura, sin estado y sin React.
//
// Regla 1 de CLAUDE.md: esto no inventa una coordenada. Recoloca las que trae
// cada parada del proveedor de lugares, y descarta las paradas que no traen
// ninguna.

// Unidades internas del lienzo. Quien dibuja decide a cuántos píxeles —o a
// cuántos puntos de PDF— equivale cada unidad; aquí solo hay proporciones.
export const MAP_CANVAS = 1000;

const PADDING = 90;
const CENTER = MAP_CANVAS / 2;

export interface MapStop {
  id: string;
  title: string;
  order: number;
  x: number;
  y: number;
}

// Una parada es un elemento del itinerario que trae coordenadas del proveedor.
// Las comidas no traen —no hay proveedor de restaurantes— y por eso no salen en
// el mapa en vez de aparecer en un sitio inventado.
export function hasCoordinates(
  item: ItineraryItem,
): item is ItineraryItem & { latitude: number; longitude: number } {
  return item.latitude !== undefined && item.longitude !== undefined;
}

const DEGREES_TO_RADIANS = Math.PI / 180;

// Proyección equirectangular sencilla, con la longitud corregida por la latitud
// media para que las distancias no salgan estiradas al alejarse del ecuador.
// Para un esquema de una ciudad es exacta de sobra; lo que importa es que las
// posiciones relativas entre paradas sean las verdaderas.
export function projectStops(items: readonly ItineraryItem[]): MapStop[] {
  const stops = items.filter(hasCoordinates);
  if (stops.length === 0) return [];

  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let sumLat = 0;

  // Regla 6 de CLAUDE.md: los agregados del conjunto se calculan una vez, antes
  // del bucle que sitúa cada parada. Y en un solo recorrido, no en tres.
  //
  // Regla 7: un bucle, no `Math.min(...array)`. El itinerario de hoy trae pocas
  // paradas por día, pero el tamaño de este array no lo acota nada del código.
  for (const stop of stops) {
    if (stop.latitude < minLat) minLat = stop.latitude;
    if (stop.latitude > maxLat) maxLat = stop.latitude;
    sumLat += stop.latitude;
  }

  const meanLatitude = sumLat / stops.length;
  const longitudeScale = Math.cos(meanLatitude * DEGREES_TO_RADIANS) || 1;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;

  const planar = stops.map((stop) => {
    const x = stop.longitude * longitudeScale;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    // El norte arriba: la latitud crece hacia arriba y la Y del lienzo hacia abajo.
    return { stop, x, y: -stop.latitude };
  });

  const spanX = maxX - minX;
  const spanY = maxLat - minLat;
  // Una sola parada, o varias en línea recta, dejan un lado sin extensión. Sin
  // esto la división daría infinito y las chinchetas desaparecerían del lienzo.
  const span = Math.max(spanX, spanY);
  const usable = MAP_CANVAS - PADDING * 2;

  // La misma escala en los dos ejes: si cada uno se estirara a su propio rango,
  // dos paradas casi alineadas saldrían en esquinas opuestas y el esquema diría
  // algo falso sobre la ciudad.
  const scale = span > 0 ? usable / span : 0;
  const centerX = (minX + maxX) / 2;
  const centerY = -(minLat + maxLat) / 2;

  return planar.map(({ stop, x, y }, index) => ({
    id: stop.id,
    title: stop.title,
    order: index + 1,
    x: CENTER + (x - centerX) * scale,
    y: CENTER + (y - centerY) * scale,
  }));
}
