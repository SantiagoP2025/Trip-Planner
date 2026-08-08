import type { SupabaseClient } from '@supabase/supabase-js';
import type { ItineraryEdit, SavedTrip } from '../types/saved-trip.js';
import type { ProposalType } from '../types/trip.js';
import { toItineraryEdits, toSavedTrip, toSavedTripRow } from './saved-trip-rows.js';
import type {
  NewSavedTrip,
  SavedTripRepository,
  TripRequestOwnership,
} from './saved-trip.repository.js';

// Implementación de `SavedTripRepository` contra Supabase (migración 0002).
//
// Se conecta con la clave de servicio, que salta Row Level Security, así que
// **todas** las consultas de este fichero filtran por `user_id` a mano. Las
// políticas de la migración protegen al navegador; aquí no protegen a nadie, y
// olvidar un `.eq('user_id', ...)` sería enseñarle a un usuario los viajes de
// otro. Por eso el filtro está en cada método y no en un sitio compartido: se ve
// en la línea, no hay que ir a buscarlo.

// Lo que se pide de cada viaje guardado: la fila, la propuesta completa y los
// cuatro campos de la solicitud que necesita la lista. Ni un campo más
// (sección 13.2: no arrastrar datos innecesarios).
const SAVED_TRIP_SELECT =
  'id, title, created_at, trip_request_id, ' +
  'trip_proposals ( data ), ' +
  'trip_requests ( origin, destination, departure_date, return_date ), ' +
  // Fase 11: las ediciones del usuario, en la misma consulta. Traerlas aparte
  // sería una segunda ida y vuelta por viaje para pintar la misma pantalla.
  'saved_trip_edits ( item_id, title, description, updated_at )';

export class SupabaseSavedTripRepository implements SavedTripRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async findTripRequest(tripRequestId: string): Promise<TripRequestOwnership | null> {
    const { data, error } = await this.client
      .from('trip_requests')
      .select('user_id, origin, destination, departure_date, return_date')
      .eq('id', tripRequestId)
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo leer la solicitud de viaje: ${error.message}`, { cause: error });
    }

    if (!data) return null;

    return {
      userId: (data.user_id as string | null) ?? null,
      origin: data.origin as string,
      destination: data.destination as string,
      departureDate: data.departure_date as string,
      returnDate: data.return_date as string,
    };
  }

  async findProposalId(
    tripRequestId: string,
    proposalType: ProposalType,
  ): Promise<string | null> {
    const { data, error } = await this.client
      .from('trip_proposals')
      .select('id')
      .eq('trip_request_id', tripRequestId)
      .eq('proposal_type', proposalType)
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo leer la propuesta: ${error.message}`, { cause: error });
    }

    return data ? (data.id as string) : null;
  }

  async findSavedTripId(userId: string, tripProposalId: string): Promise<string | null> {
    const { data, error } = await this.client
      .from('saved_trips')
      .select('id')
      .eq('user_id', userId)
      .eq('trip_proposal_id', tripProposalId)
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo comprobar si el viaje ya estaba guardado: ${error.message}`, {
        cause: error,
      });
    }

    return data ? (data.id as string) : null;
  }

  async countByUser(userId: string): Promise<number> {
    // `head: true` pide solo el recuento: sin esto, contar cien viajes se
    // llevaría los cien viajes por la red para tirarlos después.
    const { count, error } = await this.client
      .from('saved_trips')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      throw new Error(`No se pudieron contar los viajes guardados: ${error.message}`, {
        cause: error,
      });
    }

    return count ?? 0;
  }

  async save(record: NewSavedTrip): Promise<SavedTrip> {
    // `upsert` y no `insert`: guardar dos veces la misma propuesta actualiza el
    // título en vez de fallar con una violación de la restricción única. Es lo
    // que espera quien pulsa "Guardar" dos veces.
    const { data, error } = await this.client
      .from('saved_trips')
      .upsert(toSavedTripRow(record), { onConflict: 'user_id,trip_proposal_id' })
      .select(SAVED_TRIP_SELECT)
      .single();

    if (error) {
      throw new Error(`No se pudo guardar el viaje: ${error.message}`, { cause: error });
    }

    const saved = toSavedTrip(data);
    if (!saved) {
      throw new Error('El viaje se guardó pero la fila devuelta no tiene la forma esperada.');
    }

    return saved;
  }

  async listByUser(userId: string, limit: number): Promise<SavedTrip[]> {
    const { data, error } = await this.client
      .from('saved_trips')
      .select(SAVED_TRIP_SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      // Regla 5: ninguna lectura sin tope. El límite lo pone quien llama, con el
      // máximo de viajes por usuario.
      .limit(limit);

    if (error) {
      throw new Error(`No se pudieron leer los viajes guardados: ${error.message}`, {
        cause: error,
      });
    }

    // Una fila rota se descarta y las demás se enseñan: es preferible una lista
    // a la que le falta un viaje que una pantalla de error con todos dentro.
    const trips: SavedTrip[] = [];
    for (const row of data ?? []) {
      const saved = toSavedTrip(row);
      if (saved) trips.push(saved);
    }

    return trips;
  }

  async deleteById(savedTripId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('saved_trips')
      .delete()
      .eq('id', savedTripId)
      // Sin este filtro, cualquiera con el identificador de un viaje ajeno
      // podría borrarlo: la clave de servicio salta las políticas.
      .eq('user_id', userId)
      .select('id');

    if (error) {
      throw new Error(`No se pudo borrar el viaje guardado: ${error.message}`, { cause: error });
    }

    return (data ?? []).length > 0;
  }

  // --- Fase 11: ediciones del itinerario ---

  async findSavedTripForUser(savedTripId: string, userId: string): Promise<SavedTrip | null> {
    const { data, error } = await this.client
      .from('saved_trips')
      .select(SAVED_TRIP_SELECT)
      .eq('id', savedTripId)
      // Sin este filtro, cualquiera con el identificador de un viaje ajeno
      // podría leer su itinerario: la clave de servicio salta las políticas.
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo leer el viaje guardado: ${error.message}`, { cause: error });
    }

    return data ? toSavedTrip(data) : null;
  }

  async upsertEdit(
    savedTripId: string,
    edit: Omit<ItineraryEdit, 'updatedAt'>,
  ): Promise<ItineraryEdit> {
    // `updated_at` se escribe a mano y no con un disparador: un disparador es
    // otra cosa que mantener en la base de datos, y aquí el único que escribe
    // es el servidor.
    const updatedAt = new Date().toISOString();

    const { data, error } = await this.client
      .from('saved_trip_edits')
      .upsert(
        {
          saved_trip_id: savedTripId,
          item_id: edit.itemId,
          // `null` y no ausente: al reescribir solo la descripción, el título
          // editado que hubiera antes tiene que desaparecer, no quedarse.
          title: edit.title ?? null,
          description: edit.description ?? null,
          updated_at: updatedAt,
        },
        { onConflict: 'saved_trip_id,item_id' },
      )
      .select('item_id, title, description, updated_at')
      .single();

    if (error) {
      throw new Error(`No se pudo guardar la edición: ${error.message}`, { cause: error });
    }

    const [stored] = toItineraryEdits([data]);
    if (!stored) {
      throw new Error('La edición se guardó pero la fila devuelta no tiene la forma esperada.');
    }

    return stored;
  }

  async deleteEdit(savedTripId: string, itemId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('saved_trip_edits')
      .delete()
      .eq('saved_trip_id', savedTripId)
      .eq('item_id', itemId)
      .select('id');

    if (error) {
      throw new Error(`No se pudo deshacer la edición: ${error.message}`, { cause: error });
    }

    return (data ?? []).length > 0;
  }
}
