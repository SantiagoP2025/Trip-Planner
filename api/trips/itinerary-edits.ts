import { createSessionVerifier } from '../../server/auth/create-session-verifier.js';
import { RATE_LIMIT_MAX_TRACKED_KEYS, SAVED_TRIPS_RATE_LIMIT } from '../../server/config/limits.js';
import type { VercelWebFunction } from '../../server/http/handler.js';
import { createItineraryEditsHandler } from '../../server/http/handle-itinerary-edits.js';
import { logError } from '../../server/http/logger.js';
import { FixedWindowRateLimiter } from '../../server/http/rate-limit.js';
import { createSavedTripRepository } from '../../server/repositories/create-saved-trip-repository.js';

// Fase 11: PUT y DELETE de /api/trips/itinerary-edits.
//
// Este fichero es solo el enchufe a Vercel. La ruta es hermana de
// `/api/trips/saved` y no está debajo de ella a propósito: un fichero `saved.ts`
// y una carpeta `saved/` con el mismo nombre se resuelven distinto según la
// plataforma, y no merece la pena averiguarlo por una ruta.

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

// `{ fetch }` y no el handler a pelo: es lo que hace que Vercel llame con un
// `Request` estándar en vez de con los objetos de Node. Aquí importa doble,
// porque este handler lee `new URL(request.url)` para sacar el `id`, y con la
// firma de Node `request.url` es solo la ruta y `new URL` lanza. El porqué, en
// `server/http/handler.ts`.
export default {
  fetch: createItineraryEditsHandler({
    repository: repositorySelection.repository,
    sessionVerifier: verifierSelection.verifier,
    rateLimiter,
  }),
} satisfies VercelWebFunction;
