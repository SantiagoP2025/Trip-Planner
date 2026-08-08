import { readSupabaseConfig, type SupabaseConfigResult } from '../config/env.js';
import { NoopTripRepository } from './noop-trip.repository.js';
import {
  createSupabaseClient,
  SupabaseTripRepository,
} from './supabase-trip.repository.js';
import type { TripRepository } from './trip.repository.js';

// Único sitio donde se decide contra qué se guarda. Aísla del resto del código
// la comprobación de configuración, para que ni el handler ni el fichero de
// `api/` tengan que saber que Supabase puede no estar.

export interface TripRepositorySelection {
  repository: TripRepository;
  // Qué se ha decidido y por qué, para poder registrarlo al arrancar. Una
  // aplicación que no guarda nada debe decirlo en el log; si no, la primera
  // pista llega cuando alguien echa de menos sus viajes.
  status: SupabaseConfigResult['status'];
  reason?: string;
}

export function createTripRepository(
  env: Record<string, string | undefined> = process.env,
): TripRepositorySelection {
  const result = readSupabaseConfig(env);

  if (result.status === 'configured') {
    return {
      repository: new SupabaseTripRepository(createSupabaseClient(result.config)),
      status: result.status,
    };
  }

  // Ni una configuración ausente ni una a medias pueden impedir que se genere un
  // viaje. La diferencia está en el log: `disabled` es una decisión, `invalid`
  // es un error de configuración que alguien tiene que arreglar.
  return {
    repository: new NoopTripRepository(),
    status: result.status,
    ...(result.status === 'invalid' ? { reason: result.reason } : {}),
  };
}
