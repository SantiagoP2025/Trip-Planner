import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Regla 10 de CLAUDE.md, y el acabado de la fase 13: los ficheros que la
// aplicación necesita pero que no cuelgan de su grafo de módulos. Nada de lo
// que hay en `src/` los importa, así que ningún otro test los mira.
//
// Las dos mitades de esa regla se rompen en silencio y se notan tarde. Si el
// rewrite de `vercel.json` desaparece o se escribe mal, la aplicación sigue
// funcionando entera **salvo** al refrescar en una ruta interna, que es lo
// último que se prueba: fue el fallo A.5 de la auditoría y estuvo meses en
// producción. Y si se cae una metaetiqueta, el enlace compartido deja de tener
// vista previa sin que nada falle.
//
// Ninguna de las dos cosas la ve un test de componente, así que se miran aquí,
// sobre los ficheros de verdad.

const vercelConfig = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  rewrites?: { source: string; destination: string }[];
};

const indexHtml = readFileSync('index.html', 'utf8');

// Las rutas que declara `App.tsx`. Todas tienen que sobrevivir a un refresco.
const APP_ROUTES = ['/', '/results', '/cuenta', '/viajes'];

describe('vercel.json', () => {
  const rewrite = vercelConfig.rewrites?.[0];

  it('reescribe a index.html', () => {
    expect(vercelConfig.rewrites).toHaveLength(1);
    expect(rewrite?.destination).toBe('/index.html');
  });

  describe('el patrón del rewrite', () => {
    const pattern = new RegExp(`^${rewrite?.source ?? ''}$`);

    // Sin esto, refrescar en /viajes devuelve 404: el servidor busca un fichero
    // que no existe, porque la ruta la resuelve React Router en el navegador.
    it.each(APP_ROUTES)('cubre %s', (route) => {
      expect(pattern.test(route)).toBe(true);
    });

    // Y con esto de más, las funciones serverless dejarían de existir: cada
    // llamada al backend devolvería el HTML de la portada.
    it.each(['/api/health', '/api/trips/generate', '/api/trips/saved'])(
      'deja fuera %s',
      (route) => {
        expect(pattern.test(route)).toBe(false);
      },
    );
  });
});

describe('index.html', () => {
  it('declara el idioma de la aplicación', () => {
    expect(indexHtml).toContain('<html lang="es">');
  });

  it('lleva título y descripción', () => {
    expect(indexHtml).toMatch(/<title>.+<\/title>/);
    expect(indexHtml).toMatch(/name="description"\s+content="[^"]{50,}"/);
  });

  // Compartir el enlace sin esto da una vista previa vacía, que es lo que hacía
  // la versión anterior (fallo A.7).
  it.each([
    'og:type',
    'og:site_name',
    'og:locale',
    'og:title',
    'og:description',
    'og:image',
    'og:image:width',
    'og:image:height',
    'og:image:alt',
  ])('lleva la etiqueta %s', (property) => {
    expect(indexHtml).toContain(`property="${property}"`);
  });

  it('lleva la tarjeta de Twitter', () => {
    expect(indexHtml).toContain('name="twitter:card"');
  });

  it('lleva icono propio', () => {
    expect(indexHtml).toContain('href="/favicon.svg"');
    expect(indexHtml).toContain('href="/apple-touch-icon.png"');
  });

  // Las medidas que declaran las etiquetas tienen que ser las del fichero: si no
  // cuadran, algunas redes recortan la imagen por su cuenta.
  it('la imagen declarada existe y mide lo que dice', () => {
    const image = readFileSync('public/og-image.png');

    expect(indexHtml).toContain('content="1200"');
    expect(indexHtml).toContain('content="630"');

    // Cabecera IHDR de un PNG: ancho y alto en 32 bits, a partir del byte 16.
    expect(image.readUInt32BE(16)).toBe(1200);
    expect(image.readUInt32BE(20)).toBe(630);
  });
});

// Fase 13. El indicador de foco lo pone una sola regla de `index.css`, y esa
// regla es todo lo que hay: si alguien la borra, la aplicación entera se queda
// sin foco visible y ningún otro test se entera. Se mira aquí porque bajo
// Vitest el CSS no llega como texto a `import.meta.glob`.
describe('src/index.css', () => {
  const css = readFileSync('src/index.css', 'utf8');

  it('define el contorno del foco para todo lo enfocable', () => {
    expect(css).toContain(':focus-visible');
    expect(css).toMatch(/outline:\s*2px solid/);
  });

  // Fase 14, regla 18: sobre el mosaico el fondo es casi negro y el contorno
  // oscuro de la regla de arriba no se ve. Si alguien borra esta segunda regla,
  // el formulario entero —la pantalla principal— se queda sin foco visible, y
  // no lo nota nadie que navegue con el ratón.
  it('recupera el contorno en blanco sobre el fondo oscuro', () => {
    expect(css).toMatch(/\[data-on-dark\][^{]*:focus-visible[^}]*outline-color:\s*#ffffff/);
  });

  // Fase 14, regla 19. Las seis animaciones tienen que apagarse si el sistema lo
  // pide. Se comprueba una a una porque el fallo típico no es olvidar el bloque
  // entero: es añadir la séptima animación y no acordarse de meterla dentro.
  describe('prefers-reduced-motion', () => {
    const ANIMATIONS = [
      'fade-in-up',
      'tab-hop',
      'slide-in-trail',
      'tag-swing',
      'plane-takeoff',
      'fade-out',
    ];

    const reducedMotionBlock =
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';

    it('tiene su bloque', () => {
      expect(reducedMotionBlock).not.toBe('');
      expect(reducedMotionBlock).toMatch(/animation:\s*none/);
    });

    it.each(ANIMATIONS)('define la animación %s', (name) => {
      expect(css).toContain(`@keyframes ${name}`);
    });

    it.each(ANIMATIONS)('apaga la animación %s', (name) => {
      expect(reducedMotionBlock).toContain(`.animate-${name}`);
    });

    // `animation: none` a secas no basta: `fade-in-up` arranca en `opacity: 0` y
    // quien devuelve el elemento a la vista es la propia animación. Sin
    // devolverlo a su sitio, quien pide menos movimiento se queda con la mitad
    // de la pantalla en blanco, que es peor que la animación.
    it('devuelve los elementos a su sitio en vez de dejarlos invisibles', () => {
      expect(reducedMotionBlock).toMatch(/opacity:\s*1/);
      expect(reducedMotionBlock).toMatch(/transform:\s*none/);
    });
  });
});
