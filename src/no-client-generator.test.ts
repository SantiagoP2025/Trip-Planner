import { describe, expect, it } from 'vitest';

// Cierre de la fase 7, el más importante del plan: en `src/` no puede haber
// nada que construya propuestas, vuelos, alojamientos o precios.
//
// Esta comprobación existe porque el fallo que arrastra el proyecto de partida
// desde hace meses no fue escribir un generador en el cliente: fue no borrarlo.
// Una revisión a ojo se hace una vez; esta se hace en cada `npm test`.
//
// Lee los ficheros con `import.meta.glob` y no con `node:fs` a propósito: `src/`
// se compila sin los tipos de Node, y meterlos aquí abriría la puerta a que
// alguien use `process.env` en código que acaba en el navegador.
const SOURCES = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Lo único de `server/` que el frontend puede importar, y por qué.
const ALLOWED_SERVER_IMPORTS: Record<string, { reason: string; onlyFrom?: string }> = {
  // Los topes de la regla 5, compartidos para que el formulario no diga una cosa
  // y el servidor acepte otra.
  'config/trip-limits.ts': { reason: 'topes compartidos del formulario' },
  // El mismo esquema que ejecuta el endpoint, para que "las mismas validaciones
  // que el servidor" sea literal y no una copia que se separa con el tiempo.
  'schemas/trip.schema.ts': {
    reason: 'validación compartida',
    onlyFrom: 'services/trip-validation.ts',
  },
};

const IMPORT_PATTERN =
  /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)\s+from\s+['"]((?:\.\.\/)+server\/[^'"]+)['"]/g;

// Los tests sí pueden construir propuestas de ejemplo: para eso están. Lo que no
// puede es hacerlo el código que se envía al navegador.
//
// Los `test-fixtures.ts` cuentan como material de pruebas: son propuestas de
// ejemplo que comparten varios tests para no copiarlas en cada uno. Que no se
// revisen aquí no los deja sueltos: el último test del fichero comprueba que no
// los importa nadie de producción, que es la parte que de verdad importa.
const isTestFile = (path: string) =>
  /\.test\.tsx?$/.test(path) || /(?:^|\/)test-fixtures\.ts$/.test(path);

const PRODUCTION_FILES = Object.entries(SOURCES)
  .filter(([path]) => !isTestFile(path))
  .map(([path, content]) => ({ path: path.replace(/^\.\//, ''), content }));

function isTypeOnly(clause: string): boolean {
  const trimmed = clause.trimStart();
  if (trimmed.startsWith('type')) return true;

  // También vale `import { type A, type B }`, siempre que no se cuele un
  // especificador de valor entre medias.
  const named = trimmed.match(/^\{([\s\S]*)\}$/);
  if (!named?.[1]) return false;

  return named[1]
    .split(',')
    .map((specifier) => specifier.trim())
    .filter((specifier) => specifier.length > 0)
    .every((specifier) => specifier.startsWith('type '));
}

interface ServerImport {
  file: string;
  target: string;
  clause: string;
}

const SERVER_IMPORTS: ServerImport[] = PRODUCTION_FILES.flatMap(({ path, content }) =>
  [...content.matchAll(IMPORT_PATTERN)].flatMap((match) => {
    const [, clause, specifier] = match;
    if (!clause || !specifier) return [];
    return [{ file: path, target: specifier.replace(/^(?:\.\.\/)+server\//, ''), clause }];
  }),
);

describe('el frontend no genera datos de viaje', () => {
  it('encuentra ficheros que revisar', () => {
    expect(PRODUCTION_FILES.length).toBeGreaterThan(0);
  });

  // Regla 1 de CLAUDE.md. El motor, los proveedores, los mocks y los
  // repositorios viven en el servidor y solo allí se ejecutan.
  it('ningún fichero de src importa el motor, los proveedores ni los mocks', () => {
    const forbidden = SERVER_IMPORTS.filter(({ target }) => {
      if (target.startsWith('types/')) return false;
      return !(target in ALLOWED_SERVER_IMPORTS);
    }).map(({ file, target }) => `${file} → server/${target}`);

    expect(forbidden).toEqual([]);
  });

  it('los tipos del servidor se importan solo como tipos', () => {
    const runtimeTypeImports = SERVER_IMPORTS.filter(
      ({ target, clause }) => target.startsWith('types/') && !isTypeOnly(clause),
    ).map(({ file, target }) => `${file} → server/${target}`);

    expect(runtimeTypeImports).toEqual([]);
  });

  it('la validación compartida se importa solo desde donde debe', () => {
    const misplaced = SERVER_IMPORTS.filter(({ file, target }) => {
      const rule = ALLOWED_SERVER_IMPORTS[target];
      return rule?.onlyFrom !== undefined && rule.onlyFrom !== file;
    }).map(({ file, target }) => `${file} → server/${target}`);

    expect(misplaced).toEqual([]);
  });

  // CLAUDE.md: en los mocks, nunca `Math.random()` directo. En el cliente no
  // debería haber ni mocks ni aleatoriedad de ningún tipo.
  it('no hay aleatoriedad en el frontend', () => {
    const offenders = PRODUCTION_FILES.filter(({ content }) =>
      content.includes('Math.random'),
    ).map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  // Los tipos del servidor entran por un solo sitio: así comprobar que siguen
  // siendo reexportaciones de tipo es mirar un fichero, no cuarenta.
  it('los tipos del servidor entran por src/types/api.ts', () => {
    const others = SERVER_IMPORTS.filter(
      ({ file, target }) => target.startsWith('types/') && file !== 'types/api.ts',
    ).map(({ file }) => file);

    expect(others).toEqual([]);
  });

  // Las propuestas de ejemplo son la única cosa de `src/` que construye vuelos,
  // alojamientos y precios, y existen para que los tests tengan qué pintar. El
  // día que una acabe importada desde un componente, la aplicación estaría
  // enseñando datos inventados con toda la naturalidad del mundo: es la forma
  // exacta que tenía el fallo que arrastra el proyecto de partida.
  it('las propuestas de ejemplo no se importan desde código de producción', () => {
    const offenders = PRODUCTION_FILES.filter(({ content }) =>
      /from\s+['"][^'"]*test-fixtures(?:\.ts)?['"]/.test(content),
    ).map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});
