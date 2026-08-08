// Fase 14: los once iconos de la interfaz, en un fichero.
//
// Sin librería a propósito. Once iconos son unas pocas rutas SVG; el paquete
// más pequeño que los trae añade decenas de kilobytes al bundle para usar el
// diez por ciento, y la fase 13 se dejó el rendimiento donde está.
//
// Todos comparten rejilla de 24 y `currentColor`, así que heredan el color del
// texto y no hay que pintarlos uno a uno.

export type IconName =
  | 'plane'
  | 'suitcase'
  | 'mapPin'
  | 'sun'
  | 'moon'
  | 'compass'
  | 'externalLink'
  | 'footprint'
  | 'utensils'
  | 'download'
  | 'edit';

const PATHS: Record<IconName, string> = {
  plane: 'M10.5 19.5 12 22l1.5-2.5V15l8 2.5v-2L14 10V4a2 2 0 1 0-4 0v6l-7.5 5.5v2L10.5 15z',
  suitcase:
    'M4 8h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM9 8V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M9 12v4M15 12v4',
  mapPin: 'M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z',
  externalLink: 'M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  footprint:
    'M9 4.5c1.4 0 2.3 1.5 2.3 3.6 0 2-.8 3.4-.8 5 0 1.3.6 2 .6 3.1 0 1.3-.9 2.3-2.1 2.3s-2.1-1-2.1-2.3c0-1.1.6-1.8.6-3.1 0-1.6-.8-3-.8-5 0-2.1.9-3.6 2.3-3.6zM16.5 9c.9 0 1.5 1 1.5 2.4 0 1.3-.5 2.2-.5 3.3 0 .9.4 1.3.4 2.1 0 .9-.6 1.5-1.4 1.5s-1.4-.6-1.4-1.5c0-.8.4-1.2.4-2.1 0-1.1-.5-2-.5-3.3C15 10 15.6 9 16.5 9z',
  utensils: 'M5 3v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M7 12v9M17 3c-1.7 0-3 2-3 4.5s1.3 3.5 3 3.5V3zM17 11v10',
  download: 'M12 3v12M7.5 10.5 12 15l4.5-4.5M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  edit: 'M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16v4zM14.5 5.5l4 4',
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  /** Relleno sólido en vez de trazo. Para los iconos que marcan un estado activo. */
  filled?: boolean;
}

// `aria-hidden` siempre: un icono nunca es la única forma de saber qué hace un
// control. El nombre accesible lo pone el texto de al lado o el `aria-label` de
// quien lo usa, así que anunciarlo aquí solo duplicaría la lectura.
export function Icon({ name, size = 20, className, filled = false }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
