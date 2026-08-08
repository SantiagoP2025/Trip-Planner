import { createSessionVerifier } from '../../server/auth/create-session-verifier.js';
import { GENERATE_RATE_LIMIT, RATE_LIMIT_MAX_TRACKED_KEYS } from '../../server/config/limits.js';
import type { VercelWebFunction } from '../../server/http/handler.js';
import { createGenerateTripHandler } from '../../server/http/handle-generate-trip.js';
import { logError } from '../../server/http/logger.js';
import { FixedWindowRateLimiter } from '../../server/http/rate-limit.js';
import { MockAccommodationProvider } from '../../server/providers/mock-accommodation.provider.js';
import { MockFlightProvider } from '../../server/providers/mock-flight.provider.js';
import { MockPlacesProvider } from '../../server/providers/mock-places.provider.js';
import { MockRoutesProvider } from '../../server/providers/mock-routes.provider.js';
import { createTripRepository } from '../../server/repositories/create-trip-repository.js';
import { BestEffortTripPersistence } from '../../server/services/trip-persistence.service.js';

// Sección 7.2: POST /api/trips/generate.
//
// Este fichero es solo el enchufe a Vercel: elige qué proveedores se usan, con
// qué límite y contra qué se guarda, y delega. Sección 14.2: cuando los
// proveedores simulados se sustituyan por los reales, se cambian estas tres
// líneas y nada más.

// Fuera del handler a propósito: así el contador y el cliente de base de datos
// sobreviven a las invocaciones que reutilicen la misma instancia de la función.
const rateLimiter = new FixedWindowRateLimiter({
  ...GENERATE_RATE_LIMIT,
  maxTrackedKeys: RATE_LIMIT_MAX_TRACKED_KEYS,
});

const selection = createTripRepository();

// Fase 8: la sesión es opcional aquí. Si viene, la solicitud queda a nombre de
// su dueño y podrá guardarse; si no viene, el viaje se genera igual.
const verifierSelection = createSessionVerifier();

// Una aplicación que no guarda nada tiene que decirlo al arrancar. Sin esto, la
// primera pista de que Supabase está mal configurado llegaría el día que
// alguien eche de menos sus viajes.
if (selection.status === 'invalid') {
  logError('arranque', 'supabase.config_invalid', new Error(selection.reason ?? 'desconocido'));
} else if (selection.status === 'disabled') {
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'supabase.disabled',
      message: 'Sin SUPABASE_URL ni SUPABASE_SERVICE_ROLE_KEY: los viajes no se guardarán.',
    }),
  );
}

// `{ fetch }` y no el handler a pelo: es lo que hace que Vercel llame con un
// `Request` estándar en vez de con los objetos de Node. El porqué, en
// `server/http/handler.ts`.
export default {
  fetch: createGenerateTripHandler({
    providers: {
      flights: new MockFlightProvider(),
      accommodations: new MockAccommodationProvider(),
      places: new MockPlacesProvider(),
      routes: new MockRoutesProvider(),
    },
    rateLimiter,
    persistence: new BestEffortTripPersistence(selection.repository, { onError: logError }),
    sessionVerifier: verifierSelection.verifier,
  }),
} satisfies VercelWebFunction;
