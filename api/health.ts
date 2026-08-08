import { HEALTH_RATE_LIMIT, RATE_LIMIT_MAX_TRACKED_KEYS } from '../server/config/limits.js';
import { createHealthHandler } from '../server/http/handle-health.js';
import { FixedWindowRateLimiter } from '../server/http/rate-limit.js';

// Sección 7.1: GET /api/health.
//
// Este fichero es solo el enchufe a Vercel. Toda la lógica vive en
// `server/http/`, que no sabe nada de la plataforma y por eso se puede probar
// llamando a la función con un `Request`.

// Fuera del handler a propósito: así el contador sobrevive a las invocaciones
// que reutilicen la misma instancia de la función.
const rateLimiter = new FixedWindowRateLimiter({
  ...HEALTH_RATE_LIMIT,
  maxTrackedKeys: RATE_LIMIT_MAX_TRACKED_KEYS,
});

export default createHealthHandler({ rateLimiter });
