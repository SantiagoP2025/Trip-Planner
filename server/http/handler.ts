// Los handlers son funciones de `Request` a `Response`, el contrato web
// estándar. Vercel ejecuta esta firma tal cual en su runtime de Node, y como no
// hay nada específico de la plataforma en la firma, un test puede llamarlos
// construyendo un `Request` y leyendo el `Response`, sin levantar servidor ni
// simular objetos de Node.
export type RequestHandler = (request: Request) => Promise<Response>;
