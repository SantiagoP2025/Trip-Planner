import { describe, expect, it } from 'vitest';

// Lo primero que pide la fase 12: **la librería de PDF se carga con `import()`
// dinámico, solo al pulsar el botón, y nunca en el bundle principal.**
//
// Es fácil de cumplir el primer día y fácil de romper el segundo: basta con que
// alguien necesite un tipo de `pdf-lib` en otro fichero y escriba el import de
// siempre. Nadie lo notaría —todo seguiría funcionando— salvo por medio megabyte
// que descargaría cada visita a la portada para no usarlo nunca.
//
// Se comprueba sobre el código, como el resto de comprobaciones estructurales de
// este repositorio, y por eso se hace en cada `npm test`.
const SOURCES = import.meta.glob('../../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Las claves de `import.meta.glob` son relativas a este fichero. Se resuelven a
// rutas del proyecto para que los mensajes de fallo digan qué fichero mirar.
function resolvePath(key: string): string {
  const segments: string[] = [];

  for (const segment of `src/services/pdf/${key}`.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }

  return segments.join('/');
}

const FILES = Object.entries(SOURCES).map(([path, content]) => ({
  path: resolvePath(path),
  content,
}));

// `import ... from 'pdf-lib'` o `export ... from 'pdf-lib'`: los estáticos, que
// son los que acaban en el bundle principal.
const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]{0,200}?from\s+['"]pdf-lib['"]/;

const RENDERER = 'src/services/pdf/render-trip-pdf.ts';

describe('la librería de PDF no entra en el bundle principal', () => {
  it('encuentra ficheros que revisar', () => {
    expect(FILES.length).toBeGreaterThan(0);
    expect(FILES.some(({ path }) => path === RENDERER)).toBe(true);
  });

  it('ningún fichero de producción importa pdf-lib de forma estática', () => {
    const offenders = FILES.filter(
      ({ path, content }) => !path.endsWith('.test.ts') && STATIC_IMPORT.test(content),
    ).map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('el renderizador la carga con import() dinámico', () => {
    const renderer = FILES.find(({ path }) => path === RENDERER);

    expect(renderer?.content).toContain("await import('pdf-lib')");
  });

  // Que solo la toque un fichero es lo que hace que sustituirla —o quitarla— sea
  // un cambio localizado, y no una búsqueda por todo el proyecto.
  it('solo el renderizador la nombra', () => {
    const others = FILES.filter(
      ({ path, content }) => path !== RENDERER && !path.endsWith('.test.ts') && content.includes('pdf-lib'),
    ).map(({ path }) => path);

    expect(others).toEqual([]);
  });
});
