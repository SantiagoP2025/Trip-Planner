import { readSupabaseConfig, type SupabaseConfigResult } from '../config/env.ts';
import type { SavedTrip } from '../types/saved-trip.ts';
import type { ProposalType } from '../types/trip.ts';
import type {
  NewSavedTrip,
  SavedTripRepository,
  TripRequestOwnership,
} from './saved-trip.repository.ts';
import { createSupabaseClient } from './supabase-trip.repository.ts';
import { SupabaseSavedTripRepository } from './supabase-saved-trip.repository.ts';

// Único sitio donde se decide contra qué se guardan los viajes del usuario,
// igual que `create-trip-repository.ts` para las generaciones.

// Sin base de datos no hay dónde guardar, y a diferencia de la generación —que
// sigue adelante sin persistencia— aquí guardar *es* la operación. Este
// repositorio lanza siempre, y el endpoint lo traduce en un error visible.
//
// En la práctica no llega a usarse: sin Supabase tampoco hay forma de comprobar
// una sesión, así que la petición muere antes en el control de autenticación.
// Existe para que "no hay base de datos" no pueda convertirse nunca, por
// descuido, en "se ha guardado".
export class UnavailableSavedTripRepository implements SavedTripRepository {
  private readonly reason: string;

  constructor(reason: string) {
    this.reason = reason;
  }

  private fail(): never {
    throw new Error(`No hay base de datos para los viajes guardados: ${this.reason}`);
  }

  findTripRequest(_tripRequestId: string): Promise<TripRequestOwnership | null> {
    this.fail();
  }

  findProposalId(_tripRequestId: string, _proposalType: ProposalType): Promise<string | null> {
    this.fail();
  }

  findSavedTripId(_userId: string, _tripProposalId: string): Promise<string | null> {
    this.fail();
  }

  countByUser(_userId: string): Promise<number> {
    this.fail();
  }

  save(_record: NewSavedTrip): Promise<SavedTrip> {
    this.fail();
  }

  listByUser(_userId: string, _limit: number): Promise<SavedTrip[]> {
    this.fail();
  }

  deleteById(_savedTripId: string, _userId: string): Promise<boolean> {
    this.fail();
  }
}

export interface SavedTripRepositorySelection {
  repository: SavedTripRepository;
  status: SupabaseConfigResult['status'];
  reason?: string;
}

export function createSavedTripRepository(
  env: Record<string, string | undefined> = process.env,
): SavedTripRepositorySelection {
  const result = readSupabaseConfig(env);

  if (result.status === 'configured') {
    return {
      repository: new SupabaseSavedTripRepository(createSupabaseClient(result.config)),
      status: result.status,
    };
  }

  const reason =
    result.status === 'invalid'
      ? result.reason
      : 'faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.';

  return {
    repository: new UnavailableSavedTripRepository(reason),
    status: result.status,
    ...(result.status === 'invalid' ? { reason: result.reason } : {}),
  };
}
