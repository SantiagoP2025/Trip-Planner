import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MAP_CANVAS, projectStops } from '../services/map-projection.ts';
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
// este número no es píxeles: es el sistema de coordenadas del dibujo. La
// proyección de las paradas está en `services/map-projection.ts`, porque el PDF
// de la fase 12 dibuja el mismo esquema sin DOM ni React.
const CANVAS = MAP_CANVAS;
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
