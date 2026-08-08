import { createClient } from '@supabase/supabase-js';
import { readSupabasePublicConfig, type SupabasePublicConfigResult } from '../config/env.js';
import {
  SupabaseSessionVerifier,
  UnavailableSessionVerifier,
  type SessionVerifier,
} from './session.js';

// Único sitio donde se decide contra qué se comprueban las sesiones, igual que
// `create-trip-repository.ts` es el único que decide contra qué se guarda. Ni el
// handler ni el fichero de `api/` tienen que saber que Supabase puede no estar.

export interface SessionVerifierSelection {
  verifier: SessionVerifier;
  status: SupabasePublicConfigResult['status'];
  reason?: string;
}

export function createSessionVerifier(
  env: Record<string, string | undefined> = process.env,
): SessionVerifierSelection {
  const result = readSupabasePublicConfig(env);

  if (result.status === 'configured') {
    // Se comprueba con la clave anónima, no con la de servicio. Para validar un
    // token no hace falta ningún permiso especial, y usar aquí la clave que
    // salta Row Level Security sería darle a este camino más poder del que
    // necesita.
    const client = createClient(result.config.url, result.config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    return { verifier: new SupabaseSessionVerifier(client), status: result.status };
  }

  const reason =
    result.status === 'invalid'
      ? result.reason
      : 'Supabase no está configurado: no hay cuentas de usuario.';

  return {
    verifier: new UnavailableSessionVerifier(reason),
    status: result.status,
    ...(result.status === 'invalid' ? { reason: result.reason } : {}),
  };
}
