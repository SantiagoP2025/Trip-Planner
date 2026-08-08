// Regla 5 de CLAUDE.md: tope duro de tamaño del body. Un TripRequest válido
// pesa unos pocos KB; 20 KB deja margen sin permitir bodies arbitrariamente grandes.
export const MAX_REQUEST_BODY_BYTES = 20 * 1024;

export function isWithinBodySizeLimit(rawBody: string | Uint8Array): boolean {
  const size =
    typeof rawBody === 'string' ? Buffer.byteLength(rawBody, 'utf8') : rawBody.byteLength;
  return size <= MAX_REQUEST_BODY_BYTES;
}

export interface RateLimitPolicy {
  windowMs: number;
  maxRequests: number;
}

// Sección 8.2: "Aplicar rate limiting cuando existan APIs de pago". El plan lo
// adelanta a esta fase en vez de esperar a los proveedores reales, porque fue
// justamente aplazarlo lo que dejó el endpoint anterior público y tumbable.
// Generar un viaje consulta tres proveedores; cuando dejen de ser simulados,
// cada petición cuesta dinero.
export const GENERATE_RATE_LIMIT: RateLimitPolicy = {
  windowMs: 60_000,
  maxRequests: 10,
};

// El endpoint de salud no consulta proveedores, pero sigue siendo público. Un
// tope holgado corta el abuso sin estorbar a los sondeos de disponibilidad.
export const HEALTH_RATE_LIMIT: RateLimitPolicy = {
  windowMs: 60_000,
  maxRequests: 60,
};

// Fase 8. Los viajes guardados no consultan proveedores, pero cada petición
// comprueba la sesión contra Supabase y toca la base de datos, así que tampoco
// pueden quedar sin tope (sección 8.2). Es más holgado que el de generación
// porque abrir la lista y borrar un par de viajes son varias peticiones seguidas
// perfectamente normales.
export const SAVED_TRIPS_RATE_LIMIT: RateLimitPolicy = {
  windowMs: 60_000,
  maxRequests: 40,
};

// La configuración pública la pide el navegador una vez por carga de página.
// Sigue siendo un endpoint público, así que lleva su tope como los demás.
export const CONFIG_RATE_LIMIT: RateLimitPolicy = {
  windowMs: 60_000,
  maxRequests: 60,
};

// El limitador guarda un contador por IP en memoria. Sin tope de claves, una
// avalancha desde direcciones distintas convierte el propio limitador en la
// fuga de memoria que debía evitar.
export const RATE_LIMIT_MAX_TRACKED_KEYS = 10_000;
