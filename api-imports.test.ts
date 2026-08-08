import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Un fallo que en local no existe: en `npm run dev` los ficheros de `api/` los
// carga Vite, que resuelve `'./limits.ts'` sin rechistar. Vercel no. Allí cada
// fichero se transpila a `.js` por separado y lo ejecuta Node a pelo, sin
// resolutor de TypeScript y sin empaquetar nada: los especificadores del código
// llegan tal cual al `import` de Node. Uno que diga `.ts` busca un fichero que
// en el paquete desplegado ya no existe, y la función entera revienta al
// cargarse con `ERR_MODULE_NOT_FOUND` y un 500 en la primera petición.
//
// Por eso los imports relativos de `server/` y `api/` se escriben con la
// extensión del fichero *compilado* (`.js`), que es la convención de Node ESM y
// lo que TypeScript espera con `module: nodenext`.
//
// `tsc -b` ya rechaza el `.ts` porque `tsconfig.server.json` no lleva
// `allowImportingTsExtensions`. Este test cubre lo que el compilador no mira:
// recorre el grafo de módulos de cada función tal y como lo haría Node en
// producción y comprueba que cada salto aterriza en un fichero que existe. Es
// la única forma de enterarse sin desplegar.

const API_DIR = 'api';

// Las tres formas de nombrar un módulo que sobreviven a la compilación:
// `import ... from`, `import` de efecto lateral e `import()` dinámico.
const IMPORT_PATTERNS = [
  /\bfrom\s*'([^']+)'/g,
  /^\s*import\s+'([^']+)'/gm,
  /\bimport\(\s*'([^']+)'\s*\)/g,
];

function collectSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return collectSources(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

function relativeImportsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const specifiers = new Set<string>();

  for (const pattern of IMPORT_PATTERNS) {
    for (const [, specifier] of source.matchAll(pattern)) {
      if (specifier.startsWith('.')) specifiers.add(specifier);
    }
  }

  return [...specifiers];
}

// El fichero que Node acabará cargando: `./x.js` lo escribe el compilador a
// partir de `./x.ts`, así que el que tiene que existir hoy es el fuente.
function sourceBehind(specifier: string, importer: string): string | undefined {
  const target = resolve(dirname(importer), specifier);
  const candidates = [target.replace(/\.js$/, '.ts'), target.replace(/\.js$/, '.tsx'), target];
  return candidates.find((candidate) => existsSync(candidate));
}

/** Recorre el grafo desde `entrypoint` y describe cada salto que Node no daría. */
function unresolvableImports(entrypoint: string): string[] {
  const problems: string[] = [];
  const pending = [entrypoint];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (visited.has(file)) continue;
    visited.add(file);

    for (const specifier of relativeImportsOf(file)) {
      // Ni `.ts` (no llega al despliegue) ni sin extensión (Node ESM no la
      // adivina, a diferencia de CommonJS).
      if (!specifier.endsWith('.js')) {
        problems.push(`${file}: '${specifier}' tiene que terminar en '.js'`);
        continue;
      }

      const source = sourceBehind(specifier, file);
      if (!source) {
        problems.push(`${file}: '${specifier}' no apunta a ningún fichero`);
        continue;
      }

      pending.push(relative('.', source));
    }
  }

  return problems;
}

const ENTRYPOINTS = collectSources(API_DIR);

describe('funciones de api/', () => {
  // Si un día no hay entrypoints, el `it.each` de abajo no ejecutaría nada y el
  // test pasaría sin comprobar nada.
  it('las encuentra todas', () => {
    expect(ENTRYPOINTS.length).toBeGreaterThanOrEqual(5);
  });

  it.each(ENTRYPOINTS)('%s se puede cargar en Node sin resolutor de TypeScript', (entrypoint) => {
    expect(unresolvableImports(entrypoint)).toEqual([]);
  });
});
