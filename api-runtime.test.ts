import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Segundo fallo seguido que solo aparecía desplegado, y por la misma razón que
// el primero: los tests de `server/http/` llaman a los handlers a mano, con un
// `Request` construido por ellos mismos, así que comprueban la lógica pero no
// **cómo llega la petición**. Entre el handler y Vercel había un tramo que no
// miraba nadie, y ahí cabían los dos errores.
//
// Este fichero cubre ese tramo. Levanta un servidor `node:http` de verdad, le
// enchufa los módulos de `api/` tal cual, y les habla por HTTP con `fetch`. Lo
// que llega al servidor es un `IncomingMessage` auténtico —cabeceras en un
// objeto plano y en minúsculas, `url` sin origen, cuerpo en un stream—, que es
// exactamente lo que recibe el runtime de Node de Vercel.
//
// Y sobre todo: `callLikeVercel` decide con qué firma llamar **mirando la forma
// del export**, con la misma regla que aplica Vercel. Por eso una vuelta atrás
// no falla aquí por incumplir una convención, sino reventando igual que en
// producción: `TypeError: request.headers.get is not a function`.

// Los ficheros de `api/` tal y como los descubre Vercel. Con `glob` no hay lista
// que mantener: una función nueva entra sola en todos los tests de abajo.
const API_MODULES = import.meta.glob<Record<string, unknown>>('./api/**/*.ts');

const ROUTES = Object.keys(API_MODULES).map((key) => ({
  key,
  // './api/trips/generate.ts' → '/api/trips/generate'
  route: key.replace(/^\./, '').replace(/\.ts$/, ''),
}));

type WebFunction = { fetch: (request: Request) => Promise<Response> };
type NodeFunction = (request: IncomingMessage, response: ServerResponse) => unknown;

// Errores que se han escapado de un handler. Se comprueban en cada test: sin
// esto, una excepción se vería como un 500 cualquiera y podría confundirse con
// un 500 legítimo de la aplicación.
const crashes: Error[] = [];

function expectNoCrash(): void {
  expect(crashes.map((error) => `${error.name}: ${error.message}`)).toEqual([]);
}

async function readBody(request: IncomingMessage): Promise<Buffer | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

// La conversión que hace el runtime cuando la función exporta `{ fetch }`. Es lo
// único que este fichero pone de su parte, y a propósito no perdona nada: las
// cabeceras salen del objeto plano de Node, y la URL se vuelve absoluta con el
// `host`, que es de donde tiene que salir.
function toWebRequest(request: IncomingMessage, body: Buffer | undefined): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else if (value !== undefined) headers.set(name, value);
  }

  return new Request(new URL(request.url ?? '/', `http://${request.headers.host}`), {
    method: request.method,
    headers,
    body: body && body.length > 0 ? body : undefined,
  });
}

async function writeResponse(target: ServerResponse, response: Response): Promise<void> {
  target.statusCode = response.status;
  response.headers.forEach((value, name) => target.setHeader(name, value));
  target.end(Buffer.from(await response.arrayBuffer()));
}

// La regla del runtime de Node de Vercel, tal cual: un `export default` que sea
// función recibe los objetos de Node; un objeto con `fetch`, un `Request`.
async function callLikeVercel(
  loaded: Record<string, unknown>,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const exported = loaded.default;

  if (typeof exported === 'function') {
    await (exported as NodeFunction)(request, response);

    // Con la firma de Node, la respuesta se escribe en `response`; devolver un
    // `Response` no vale porque no lo lee nadie. Sin esta comprobación, exportar
    // el handler a pelo deja la petición colgada hasta que salte el tiempo de
    // espera —que es lo que hace en producción— y el test tarda en decir por qué.
    if (!response.writableEnded) {
      throw new Error(
        'La función no escribió ninguna respuesta: se la llamó con la firma de Node ' +
          '(porque exporta una función a pelo) y devolvió un `Response`.',
      );
    }
    return;
  }

  if (exported && typeof (exported as WebFunction).fetch === 'function') {
    const body = await readBody(request);
    await writeResponse(response, await (exported as WebFunction).fetch(toWebRequest(request, body)));
    return;
  }

  throw new Error('El fichero de api/ no exporta ni una función de Node ni un objeto con `fetch`.');
}

const modules = new Map<string, Record<string, unknown>>();
let server: Server;
let origin: string;

beforeAll(async () => {
  // Los handlers escriben una línea de log por petición; el test no la necesita.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  for (const { key, route } of ROUTES) modules.set(route, await API_MODULES[key]());

  server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      const loaded = modules.get(path);

      if (!loaded) {
        response.statusCode = 404;
        response.end();
        return;
      }

      try {
        await callLikeVercel(loaded, request, response);
      } catch (error) {
        crashes.push(error as Error);
        response.statusCode = 500;
        response.setHeader('content-type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ harnessError: String(error) }));
      }
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  vi.restoreAllMocks();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

beforeEach(() => {
  crashes.length = 0;
});

// Cada test estrena IP: el limitador cuenta por IP y los módulos se cargan una
// sola vez, así que sin esto los tests se gastarían el cupo unos a otros.
let nextIp = 0;
function call(path: string, init: RequestInit = {}): Promise<Response> {
  nextIp += 1;
  return fetch(`${origin}${path}`, {
    ...init,
    headers: { 'x-forwarded-for': `203.0.113.${nextIp}`, ...init.headers },
  });
}

// Lo que decide con qué firma llama Vercel. Es un error que compila, que pasa
// los tests unitarios y que no se ve hasta que está desplegado.
describe('la forma del export de cada función', () => {
  it('las encuentra todas', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(5);
  });

  it.each(ROUTES.map(({ route }) => route))('%s exporta { fetch }', (route) => {
    const exported = modules.get(route)?.default;

    // Un `export default handler` a pelo compila igual de bien y es lo que
    // tumbó la producción: Vercel lo lee como la firma de Node.
    expect(typeof exported).toBe('object');
    expect(typeof (exported as WebFunction).fetch).toBe('function');
  });
});

describe('GET /api/config por HTTP', () => {
  it('contesta 200 con la configuración pública', async () => {
    const response = await call('/api/config');

    expectNoCrash();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    // Sin variables de Supabase en el entorno del test: la aplicación dice que
    // no hay cuentas, que es su respuesta correcta, no un error.
    expect(await response.json()).toEqual({ supabase: null });
  });

  it('resuelve la IP del cliente desde las cabeceras reales', async () => {
    // El fallo desplegado era justo este: `resolveClientIp` llamaba a
    // `.get()` sobre las cabeceras, que con la firma de Node son un objeto
    // plano. Que salgan las cabeceras del limitador prueba que la IP se leyó.
    const response = await call('/api/config');

    expectNoCrash();
    expect(response.headers.get('ratelimit-limit')).toBe('60');
    expect(response.headers.get('ratelimit-remaining')).toBe('59');
  });

  it('cuenta por IP y no todas juntas', async () => {
    const primera = await call('/api/config');
    const segunda = await fetch(`${origin}/api/config`, {
      headers: { 'x-forwarded-for': primera.headers.get('ratelimit-remaining') ?? '1.2.3.4' },
    });

    expectNoCrash();
    // Dos IPs distintas, dos cubos distintos: las dos gastan su primera ficha.
    expect(segunda.headers.get('ratelimit-remaining')).toBe('59');
  });

  it('devuelve 405 y la cabecera Allow ante un método que no es GET', async () => {
    const response = await call('/api/config', { method: 'POST' });

    expectNoCrash();
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(await response.json()).toMatchObject({ error: { code: 'METHOD_NOT_ALLOWED' } });
  });
});

describe('GET /api/health por HTTP', () => {
  it('contesta 200 y dice que el servicio está vivo', async () => {
    const response = await call('/api/health');

    expectNoCrash();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });
});

describe('POST /api/trips/generate por HTTP', () => {
  // El esquema compara la salida con "hoy" y aquí el reloj es el de verdad: un
  // servidor HTTP no convive con los temporizadores falsos de Vitest. Las fechas
  // se calculan desde hoy para que el test no caduque solo.
  function isoDaysFromNow(days: number): string {
    const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  }

  const validBody = {
    origin: 'Valencia',
    destination: 'Lisboa',
    departureDate: isoDaysFromNow(30),
    returnDate: isoDaysFromNow(37),
    travelers: { adults: 2, children: 0 },
    budget: 3000,
    currency: 'EUR',
    travelStyle: 'balanced',
    preferences: {
      beach: 1,
      culture: 3,
      gastronomy: 3,
      nightlife: 0,
      nature: 2,
      shopping: 0,
      family: 0,
      relax: 1,
    },
  };

  // La ruta larga entera, con cuerpo que viaja por el socket de verdad: es la
  // que lee el body como stream y la que más piezas atraviesa.
  it('genera las tres propuestas con un cuerpo que llega por el socket', async () => {
    const response = await call('/api/trips/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    });

    expectNoCrash();
    expect(response.status).toBe(200);

    const body = (await response.json()) as { proposals?: unknown[] };
    expect(body.proposals).toHaveLength(3);
  });

  it('rechaza un cuerpo que no es JSON con 400', async () => {
    const response = await call('/api/trips/generate', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hola',
    });

    expectNoCrash();
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it('devuelve 405 y la cabecera Allow ante un método que no es POST', async () => {
    const response = await call('/api/trips/generate');

    expectNoCrash();
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });
});

// Estas dos piden sesión, y en el test no hay ninguna. Lo que se comprueba es
// que la petición llega entera hasta donde tiene que llegar: pasa el filtro de
// método, gasta su ficha del limitador —o sea, se resolvió la IP— y contesta el
// 401 que corresponde a quien no ha iniciado sesión.
describe.each([
  { route: '/api/trips/saved', method: 'GET', allow: 'GET, POST, DELETE' },
  { route: '/api/trips/itinerary-edits', method: 'PUT', allow: 'PUT, DELETE' },
])('$route por HTTP', ({ route, method, allow }) => {
  it('atraviesa el limitador antes de mirar la sesión', async () => {
    const response = await call(route, { method });

    expectNoCrash();
    expect(response.status).toBe(401);
    expect(response.headers.get('ratelimit-limit')).toBe('40');
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('devuelve 405 y la cabecera Allow ante un método imprevisto', async () => {
    const response = await call(route, { method: 'PATCH' });

    expectNoCrash();
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe(allow);
  });
});
