import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseServerConfig } from '../config/env.ts';
import type {
  NewTripRequest,
  TripGenerationOutcome,
  TripRepository,
} from './trip.repository.ts';
import { toProviderSearchRows, toTripProposalRows, toTripRequestRow } from './trip-rows.ts';

// Sección 13: implementación de TripRepository contra Supabase.
//
// Se conecta con la clave de servicio, que salta Row Level Security. Por eso
// este fichero solo puede importarse desde `server/` y `api/`: en el navegador
// esa clave sería acceso completo a la base de datos (regla 4 de CLAUDE.md).
//
// Las políticas de la migración no protegen a este cliente —lo salta—, protegen
// al navegador, que en la fase 8 hablará con Supabase usando la clave anónima.

export function createSupabaseClient(config: SupabaseServerConfig): SupabaseClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      // Es un proceso de servidor sin usuario: no hay sesión que persistir ni
      // token que refrescar en segundo plano, y hacerlo dejaría estado colgando
      // entre invocaciones de la función.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export class SupabaseTripRepository implements TripRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async createTripRequest(record: NewTripRequest): Promise<string | null> {
    const { data, error } = await this.client
      .from('trip_requests')
      .insert(toTripRequestRow(record))
      .select('id')
      .single();

    if (error) {
      throw new Error(`No se pudo crear la solicitud de viaje: ${error.message}`, { cause: error });
    }

    return data.id as string;
  }

  async saveGenerationOutcome(
    tripRequestId: string,
    outcome: TripGenerationOutcome,
  ): Promise<void> {
    const proposalRows = toTripProposalRows(tripRequestId, outcome.proposals);
    const searchRows = toProviderSearchRows(tripRequestId, outcome);

    // Las tres escrituras son independientes entre sí, así que van en paralelo.
    // No hay transacción: son inserciones de auditoría, y perder una fila de
    // `provider_searches` no puede impedir que se guarden las propuestas.
    //
    // `PromiseLike` y no `Promise`: los constructores de consulta de Supabase no
    // son promesas, son objetos con `then` que solo lanzan la petición cuando
    // alguien los espera.
    const writes: PromiseLike<{ error: { message: string } | null }>[] = [
      this.client.from('trip_requests').update({ status: outcome.status }).eq('id', tripRequestId),
    ];

    if (proposalRows.length > 0) {
      writes.push(this.client.from('trip_proposals').insert(proposalRows));
    }
    if (searchRows.length > 0) {
      writes.push(this.client.from('provider_searches').insert(searchRows));
    }

    const results = await Promise.all(writes);

    // Un solo fallo basta para que la persistencia se dé por fallida; quien
    // decide que eso no rompe la respuesta al usuario es la capa de arriba.
    const failed = results.find((result) => result.error !== null);
    if (failed?.error) {
      throw new Error(`No se pudo guardar la generación: ${failed.error.message}`, {
        cause: failed.error,
      });
    }
  }
}
