import { describe, expect, it } from 'vitest';

// Fase 13: las dos cosas de accesibilidad que se rompen sin que nadie lo note.
//
// El foco visible es la primera. Quien escribe un botón nuevo navega con el
// ratón, y un botón sin indicador de foco se ve perfecto: el fallo solo existe
// para quien usa el teclado, que no es quien lo está escribiendo. Por eso el
// indicador ya no lo pone cada componente sino una regla de `index.css`, y por
// eso esto comprueba que nadie la desactiva.
// Que la regla siga existiendo se comprueba en `project-config.test.ts`, que lee
// del disco: bajo Vitest el CSS no llega como texto a `import.meta.glob`.
const SOURCES = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const FILES = Object.entries(SOURCES)
  .filter(([path]) => !/\.test\.tsx?$/.test(path))
  .map(([path, content]) => ({ path: path.replace(/^\.\//, ''), content }));

describe('foco visible', () => {
  it('encuentra ficheros que revisar', () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  // `focus:outline-none` de Tailwind gana en especificidad a la regla global y
  // deja el elemento sin ningún indicador. Es exactamente el patrón que había
  // repetido en diecisiete sitios antes de esta fase.
  it('nadie apaga el contorno del foco', () => {
    const offenders = FILES.filter(({ content }) =>
      /outline-none|outline:\s*none/.test(content),
    ).map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

});

describe('contraste', () => {
  // sky-600 sobre blanco se queda en 4,1 y el mínimo para texto normal es 4,5.
  // Con texto blanco encima —que es como se usa en los botones— el problema es
  // el mismo. sky-700 llega a 5,9.
  it('los botones macizos no usan sky-600 con texto blanco', () => {
    const offenders = FILES.filter(({ content }) => /bg-sky-600[^"'`]*text-white/.test(content)).map(
      ({ path }) => path,
    );

    expect(offenders).toEqual([]);
  });

  // Fase 14. `ink-500` es el tono de apoyo de la paleta y sobre el crema del
  // fondo se queda en 3,90: vale para un borde o un icono, no para texto.
  // `ink-700` llega a 7,93.
  //
  // Es una trampa fácil de pisar, porque el gris que sustituyó —`slate-500`
  // sobre blanco— sí llegaba, y el cambio de paleta lo bajó sin que se viera.
  it('ningún texto usa ink-500', () => {
    const offenders = FILES.filter(({ content }) => /text-ink-500/.test(content)).map(
      ({ path }) => path,
    );

    expect(offenders).toEqual([]);
  });

  // Fase 14, regla 18: un blanco translúcido sobre una foto no cumple por mucha
  // capa oscura que haya encima. El peor caso no es la foto media, es el píxel
  // blanco justo debajo de la letra: sobre él, y con la capa al 80%, el blanco
  // al 80% se queda en 4,69 y el del 75% ya cae a 4,24. De ahí el corte.
  it('no hay texto blanco muy translúcido sobre el mosaico', () => {
    const offenders = FILES.filter(({ content }) =>
      /text-white\/(?:[1-7]\d|[1-9])\b/.test(content),
    ).map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});
