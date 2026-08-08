import { useState } from 'react';
import { WORLD_COLLAGE_PHOTOS } from '../constants/collagePhotos.ts';

// Fase 14: el mosaico de fondo de la pantalla de búsqueda. Cinco columnas por
// dos filas, diez fotos.
//
// Es decoración, así que cada tesela va con `alt=""` y el conjunto con
// `aria-hidden`: un lector de pantalla que anunciara diez fotos antes del
// formulario estaría cobrando por algo que no aporta nada. Quien quiera saber
// de dónde salen las fotos lo tiene en el pie, en texto.

// Colores de reserva para cuando una foto no carga. Sin esto, una URL caída
// deja un hueco del color del fondo y el mosaico se ve roto; con esto se ve
// como un mosaico de colores, que es una degradación y no una avería.
const FALLBACK_COLORS = [
  '#d1471f',
  '#0c766d',
  '#5c4a42',
  '#f2603d',
  '#0f9488',
  '#8a7a72',
  '#ff9a78',
  '#14b8a6',
  '#3f2e29',
  '#ffd1be',
];

export function WorldCollage() {
  const [failed, setFailed] = useState<Record<number, boolean>>({});

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="grid h-full w-full grid-cols-5 grid-rows-2">
        {WORLD_COLLAGE_PHOTOS.map((photo, index) =>
          failed[index] ? (
            <div
              key={photo.url}
              style={{ backgroundColor: FALLBACK_COLORS[index % FALLBACK_COLORS.length] }}
            />
          ) : (
            <img
              key={photo.url}
              src={photo.url}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
              onError={() => setFailed((current) => ({ ...current, [index]: true }))}
            />
          ),
        )}
      </div>

      {/* Dos capas sobre las fotos: una plana que baja el brillo lo suficiente
          para que el texto cumpla contraste (regla 18), y un degradado vertical
          que oscurece arriba y abajo, donde caen la barra de navegación y el pie.
          *
          El diseño pedía la capa plana al 72%, y al 72% no sale. El caso peor no
          es la foto media: es un píxel blanco —la nieve del Cervino, la espuma
          del Iguazú— justo debajo de una letra. Sobre ese píxel, la capa al 72%
          deja el coral claro del eyebrow y de los mensajes de error en 3,81, por
          debajo del 4,5 que pide un texto normal. Al 80% sube a 4,91 y el resto
          de la pantalla sube con él, sin cambiar ni un color del sistema. */}
      <div className="absolute inset-0 bg-ink-900/80" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink-900/50 via-transparent to-ink-900/70" />
    </div>
  );
}
