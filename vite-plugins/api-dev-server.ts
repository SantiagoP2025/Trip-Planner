import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

// En producción, Vercel ejecuta los ficheros de `api/` como funciones. El
// servidor de desarrollo de Vite no sabe hacer eso, así que sin este plugin
// `npm run dev` serviría el frontend contra un `/api` que no existe.
//
// Y esa es exactamente la situación que empuja a hacer lo que prohíbe la regla 1
// de CLAUDE.md: montarse un generador en el cliente "para ir viendo la pantalla
// mientras". Este plugin quita esa excusa montando los handlers de verdad, los
// mismos que ejecuta Vercel, contra los mocks del servidor.
//
// Solo en desarrollo (`apply: 'serve'`): no toca el bundle de producción ni
// arrastra una línea de `server/` al navegador.

// Rutas relativas a la raíz del proyecto, no a este fichero: `ssrLoadModule`
// resuelve desde la raíz de Vite.
const ROUTES: Record<string, string> = {
  '/api/health': '/api/health.ts',
  '/api/config': '/api/config.ts',
  '/api/trips/generate': '/api/trips/generate.ts',
  '/api/trips/saved': '/api/trips/saved.ts',
  '/api/trips/itinerary-edits': '/api/trips/itinerary-edits.ts',
};

type Handler = (request: Request) => Promise<Response>;

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function toWebRequest(req: IncomingMessage, body: Buffer | undefined, url: URL): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(', '));
  }

  // El limitador por IP necesita saber de quién viene la petición; en local
  // siempre es la misma, pero así el camino es el mismo que en producción.
  if (!headers.has('x-real-ip') && req.socket.remoteAddress) {
    headers.set('x-real-ip', req.socket.remoteAddress);
  }

  return new Request(url, {
    method: req.method ?? 'GET',
    headers,
    body: body && body.length > 0 ? body : undefined,
  });
}

async function sendResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function apiDevServer(): Plugin {
  return {
    name: 'trip-planner-api-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const modulePath = ROUTES[url.pathname];
        if (!modulePath) return next();

        try {
          // `ssrLoadModule` recarga el handler en caliente, así que tocar el
          // servidor no obliga a reiniciar el servidor de desarrollo.
          const loaded = await server.ssrLoadModule(modulePath);
          const handler = loaded.default as Handler;
          const request = toWebRequest(req, await readBody(req), url);
          await sendResponse(res, await handler(request));
        } catch (error) {
          server.config.logger.error(`[api] ${url.pathname}: ${String(error)}`);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Ha ocurrido un error inesperado. Inténtalo de nuevo en unos minutos.',
                requestId: 'dev',
              },
            }),
          );
        }
      });
    },
  };
}
