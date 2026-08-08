import { GENERATE_RATE_LIMIT, RATE_LIMIT_MAX_TRACKED_KEYS } from '../../server/config/limits.ts';
import { createGenerateTripHandler } from '../../server/http/handle-generate-trip.ts';
import { FixedWindowRateLimiter } from '../../server/http/rate-limit.ts';
import { MockAccommodationProvider } from '../../server/providers/mock-accommodation.provider.ts';
import { MockFlightProvider } from '../../server/providers/mock-flight.provider.ts';
import { MockPlacesProvider } from '../../server/providers/mock-places.provider.ts';

// Sección 7.2: POST /api/trips/generate.
//
// Este fichero es solo el enchufe a Vercel: elige qué proveedores se usan y con
// qué límite, y delega. Sección 14.2: cuando los proveedores simulados se
// sustituyan por los reales, se cambian estas tres líneas y nada más.

// Fuera del handler a propósito: así el contador sobrevive a las invocaciones
// que reutilicen la misma instancia de la función.
const rateLimiter = new FixedWindowRateLimiter({
  ...GENERATE_RATE_LIMIT,
  maxTrackedKeys: RATE_LIMIT_MAX_TRACKED_KEYS,
});

export default createGenerateTripHandler({
  providers: {
    flights: new MockFlightProvider(),
    accommodations: new MockAccommodationProvider(),
    places: new MockPlacesProvider(),
  },
  rateLimiter,
});
