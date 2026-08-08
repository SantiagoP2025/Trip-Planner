import { createSessionVerifier } from '../../server/auth/create-session-verifier.ts';
import { RATE_LIMIT_MAX_TRACKED_KEYS, SAVED_TRIPS_RATE_LIMIT } from '../../server/config/limits.ts';
import { createSavedTripsHandler } from '../../server/http/handle-saved-trips.ts';
import { logError } from '../../server/http/logger.ts';
import { FixedWindowRateLimiter } from '../../server/http/rate-limit.ts';
import { createSavedTripRepository } from '../../server/repositories/create-saved-trip-repository.ts';

// Fase 8: GET, POST y DELETE de /api/trips/saved.
//
// Este fichero es solo el enchufe a Vercel: elige contra qué se comprueban las
// sesiones y contra qué se guarda, y delega.

// Fuera del handler a propósito: así el contador, el cliente de base de datos y
// el de autenticación sobreviven a las invocaciones que reutilicen la misma
// instancia de la función.
const rateLimiter = new FixedWindowRateLimiter({
  ...SAVED_TRIPS_RATE_LIMIT,
  maxTrackedKeys: RATE_LIMIT_MAX_TRACKED_KEYS,
});

const repositorySelection = createSavedTripRepository();
const verifierSelection = createSessionVerifier();

if (repositorySelection.status === 'invalid') {
  logError(
    'arranque',
    'supabase.config_invalid',
    new Error(repositorySelection.reason ?? 'desconocido'),
  );
}

if (verifierSelection.status === 'invalid') {
  logError(
    'arranque',
    'supabase.public_config_invalid',
    new Error(verifierSelection.reason ?? 'desconocido'),
  );
}

export default createSavedTripsHandler({
  repository: repositorySelection.repository,
  sessionVerifier: verifierSelection.verifier,
  rateLimiter,
});
