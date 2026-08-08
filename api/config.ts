import { CONFIG_RATE_LIMIT, RATE_LIMIT_MAX_TRACKED_KEYS } from '../server/config/limits.js';
import { readSupabasePublicConfig } from '../server/config/env.js';
import { createConfigHandler } from '../server/http/handle-config.js';
import { logError } from '../server/http/logger.js';
import { FixedWindowRateLimiter } from '../server/http/rate-limit.js';

// Fase 8: GET /api/config.
//
// Este fichero es solo el enchufe a Vercel; toda la lógica vive en
// `server/http/handle-config.ts`.

const rateLimiter = new FixedWindowRateLimiter({
  ...CONFIG_RATE_LIMIT,
  maxTrackedKeys: RATE_LIMIT_MAX_TRACKED_KEYS,
});

// Una aplicación sin cuentas tiene que decirlo al arrancar. Sin esto, la primera
// pista de que falta la clave anónima llegaría cuando un usuario no pueda entrar
// en la suya.
const configuration = readSupabasePublicConfig();

if (configuration.status === 'invalid') {
  logError('arranque', 'supabase.public_config_invalid', new Error(configuration.reason));
} else if (configuration.status === 'disabled') {
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'supabase.accounts_disabled',
      message: 'Sin SUPABASE_URL ni SUPABASE_ANON_KEY: no habrá cuentas de usuario.',
    }),
  );
}

export default createConfigHandler({ rateLimiter });
