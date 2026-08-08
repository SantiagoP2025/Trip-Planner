import { useState } from 'react';
import { WORLD_COLLAGE_PHOTOS } from '../constants/collagePhotos.ts';
import { Icon } from './Icon.tsx';

// Fase 14: la atribución de las fotos del mosaico.
//
// Las diez son de Wikimedia Commons y casi todas están bajo licencias que
// **exigen** citar autor y licencia. Usarlas sin crédito no es un descuido de
// estilo: es incumplir la licencia con la que se pueden usar.
//
// Va plegada porque son diez líneas que nadie necesita al buscar un viaje, y
// desplegada en un `<details>` y no en una ventana propia porque así funciona
// sin JavaScript, se puede buscar con Ctrl+F y el navegador ya sabe anunciarla.

export function PhotoCredits() {
  const [open, setOpen] = useState(false);

  return (
    <footer className="relative z-10 px-4 pb-8 sm:px-6">
      <details
        open={open}
        onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
        className="mx-auto max-w-3xl text-xs text-white/85"
      >
        <summary className="cursor-pointer list-none font-medium hover:text-white">
          Fotografías: Wikimedia Commons ({WORLD_COLLAGE_PHOTOS.length}) ·{' '}
          {open ? 'ocultar créditos' : 'ver créditos'}
        </summary>

        <ul className="mt-3 grid gap-1 sm:grid-cols-2">
          {WORLD_COLLAGE_PHOTOS.map((photo) => (
            <li key={photo.url}>
              <a
                href={photo.source}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline decoration-white/40
                  underline-offset-2 hover:decoration-white"
              >
                {photo.title}
                <Icon name="externalLink" size={11} />
              </a>{' '}
              — {photo.author}, {photo.license}
            </li>
          ))}
        </ul>
      </details>
    </footer>
  );
}
