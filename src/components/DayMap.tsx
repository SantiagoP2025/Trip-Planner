import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ItineraryItem } from '../types/api.ts';

// Mapa del día: las paradas numeradas y unidas por una línea, en el orden en que
// las visita el itinerario.
//
// **Sin capa de teselas, y no es un descuido.** Regla 12 de PLAN-2.md: las
// coordenadas que hoy devuelve el proveedor de lugares son simuladas. Son
// coordenadas posibles —la fase 9 arregló que no lo fueran— pero no son las de
// Lisboa. Dibujarlas sobre un mapa real enseñaría al usuario un pueblo húngaro
// con sus calles y sus nombres cuando ha buscado Tokio: no parece provisional,
// parece que la aplicación miente. Es el fallo B.1 de la auditoría, y estaba
// desplegado en producción.
//
// Así que lo que se dibuja es un esquema: posiciones relativas verdaderas —quién
// está cerca de quién, en qué dirección, en qué orden— sobre un fondo que no
// pretende ser ningún sitio. Cuando el proveedor de lugares sea real, esto se
// sustituye por teselas de verdad y el esquema se tira. Ver la sección "Mapas"
// del README para el proveedor elegido y su coste.
//
// Regla 13: el encuadre se rehace **solo al cambiar de día**. Si dependiera del
// array de paradas, que se reconstruye en cada render, el mapa se recolocaría
// solo y el usuario no podría moverlo (fallo B.2 de la auditoría).

// Unidades internas del lienzo. El SVG escala solo con su contenedor, así que
// este número no es píxeles: es el sistema de coordenadas del dibujo.
const CANVAS = 1000;
const PADDING = 90;
const CENTER = CANVAS / 2;

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const ZOOM_STEP = 1.5;

interface MapView {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const INITIAL_VIEW: MapView = { scale: 1, offsetX: 0, offsetY: 0 };

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
    // El norte arriba: la latitud crece hacia arriba y la Y del SVG hacia abajo.
    return { stop, x, y: -stop.latitude };
  });

  const spanX = maxX - minX;
  const spanY = maxLat - minLat;
  // Una sola parada, o varias en línea recta, dejan un lado sin extensión. Sin
  // esto la división daría infinito y las chinchetas desaparecerían del lienzo.
  const span = Math.max(spanX, spanY);
  const usable = CANVAS - PADDING * 2;

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

export interface DayMapProps {
  items: ItineraryItem[];
  // Identificador estable del día. Es la dependencia del encuadre: una cadena
  // que solo cambia cuando cambia el día, nunca en cada render (regla 13).
  dayKey: string;
}

export function DayMap({ items, dayKey }: DayMapProps) {
  const stops = useMemo(() => projectStops(items), [items]);

  const [view, setView] = useState<MapView>(INITIAL_VIEW);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // Regla 13, y el fallo B.2 de la auditoría: la dependencia es `dayKey`, una
  // cadena, y **no** `stops`. Un array reconstruido en cada render cambia de
  // identidad en cada render, así que este efecto se dispararía siempre y
  // devolvería el mapa a su sitio en cuanto el usuario lo moviera.
  useEffect(() => {
    setView(INITIAL_VIEW);
  }, [dayKey]);

  const zoom = useCallback((factor: number) => {
    setView((current) => ({
      ...current,
      scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor)),
    }));
  }, []);

  const reset = useCallback(() => setView(INITIAL_VIEW), []);

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const origin = dragRef.current;
    if (!origin) return;

    // De píxeles de pantalla a unidades del lienzo. Sin ancho medible —jsdom, o
    // un contenedor todavía sin pintar— no se mueve nada, en vez de propagar un
    // `Infinity` que dejaría el mapa en blanco.
    const width = svgRef.current?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return;

    const ratio = CANVAS / width;
    const deltaX = ((event.clientX - origin.x) * ratio) / view.scale;
    const deltaY = ((event.clientY - origin.y) * ratio) / view.scale;

    dragRef.current = { x: event.clientX, y: event.clientY };
    setView((current) => ({
      ...current,
      offsetX: current.offsetX + deltaX,
      offsetY: current.offsetY + deltaY,
    }));
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  // Si el día no tiene paradas, no se renderiza el mapa. Un lienzo vacío no
  // informa de nada y, en la versión anterior, `fitBounds([])` lanzaba (B.3).
  if (stops.length === 0) return null;

  const path = stops.map((stop) => `${stop.x},${stop.y}`).join(' ');

  // Zoom alrededor del centro y después desplazamiento: `p ↦ C + s·(p − C + d)`.
  const transform =
    `translate(${CENTER} ${CENTER}) scale(${view.scale}) ` +
    `translate(${-CENTER + view.offsetX} ${-CENTER + view.offsetY})`;

  return (
    <figure className="mt-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS} ${CANVAS}`}
        className="aspect-square w-full max-w-md touch-none rounded-md border border-slate-200 bg-slate-50"
        role="img"
        aria-label={`Esquema de las ${stops.length} paradas del día, en orden de visita.`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <g transform={transform} data-testid="mapa-lienzo">
          {stops.length > 1 && (
            <polyline
              points={path}
              fill="none"
              stroke="#0284c7"
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="18 14"
            />
          )}

          {stops.map((stop) => (
            <g key={stop.id} data-testid="mapa-parada">
              <circle cx={stop.x} cy={stop.y} r={30} fill="#0284c7" />
              <text
                x={stop.x}
                y={stop.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#ffffff"
                fontSize={32}
                fontWeight="600"
              >
                {stop.order}
              </text>
              {/* Para lectores de pantalla y para el `title` del navegador: el
                  número solo no dice a dónde se va. */}
              <title>{`${stop.order}. ${stop.title}`}</title>
            </g>
          ))}
        </g>
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => zoom(ZOOM_STEP)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700
            hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          Acercar
        </button>
        <button
          type="button"
          onClick={() => zoom(1 / ZOOM_STEP)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700
            hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          Alejar
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700
            hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          Centrar
        </button>
      </div>

      {/* Decirlo en la propia pantalla, no solo en el código: el usuario tiene
          que saber que las posiciones son relativas y el fondo no es un mapa. */}
      <figcaption className="mt-2 text-xs text-slate-500">
        Esquema de las paradas del día: enseña el orden y la posición de unas
        respecto a otras, no su ubicación sobre un mapa real.
      </figcaption>
    </figure>
  );
}
