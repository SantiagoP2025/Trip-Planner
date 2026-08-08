import { createSessionVerifier } from '../../server/auth/create-session-verifier.ts';
import { GENERATE_RATE_LIMIT, RATE_LIMIT_MAX_TRACKED_KEYS } from '../../server/config/limits.ts';
import { createGenerateTripHandler } from '../../server/http/handle-generate-trip.ts';
import { logError } from '../../server/http/logger.ts';
import { FixedWindowRateLimiter } from '../../server/http/rate-limit.ts';
import { MockAccommodationProvider } from '../../server/providers/mock-accommodation.provider.ts';
import { MockFlightProvider } from '../../server/providers/mock-flight.provider.ts';
import { MockPlacesProvider } from '../../server/providers/mock-places.provider.ts';
import { MockRoutesProvider } from '../../server/providers/mock-routes.provider.ts';
import { createTripRepository } from '../../server/repositories/create-trip-repository.ts';
import { BestEffortTripPersistence } from '../../server/services/trip-persistence.service.ts';

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

export default createGenerateTripHandler({
  providers: {
    flights: new MockFlightProvider(),
    accommodations: new MockAccommodationProvider(),
    places: new MockPlacesProvider(),
    routes: new MockRoutesProvider(),
  },
  rateLimiter,
  persistence: new BestEffortTripPersistence(selection.repository, { onError: logError }),
  sessionVerifier: verifierSelection.verifier,
});
