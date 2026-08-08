// Los handlers son funciones de `Request` a `Response`, el contrato web
// estándar. No hay nada de la plataforma en la firma, así que un test puede
// llamarlos construyendo un `Request` y leyendo el `Response`.
//
// Que Vercel les dé un `Request` de verdad no es gratis: **depende de lo que
// exporte el fichero de `api/`**, y esa es la parte que se hizo mal y solo se
// vio desplegada. El runtime de Node de Vercel admite dos firmas y elige por la
// forma del `export default`:
//
//   export default handler                  → firma de Node: (IncomingMessage, ServerResponse)
//   export default { fetch: handler }        → firma web: (Request) => Response
//
// Con la primera, `request.headers` es un objeto plano y `request.headers.get`
// no existe (`TypeError` en `resolveClientIp`), y `request.url` es solo la ruta,
// así que `new URL(request.url)` de `handle-saved-trips` también reventaría.
//
// Por eso cada fichero de `api/` exporta `{ fetch: handler }`, la "fetch Web
// Standard export" de la documentación de Vercel, y no el handler a pelo. La
// forma del export la comprueba `api-runtime.test.ts`, porque es un error que
// compila, pasa los tests unitarios y solo aparece en producción.
export type RequestHandler = (request: Request) => Promise<Response>;

// Lo que Vercel espera encontrar en el `export default` de un fichero de `api/`.
export interface VercelWebFunction {
  fetch: RequestHandler;
}
