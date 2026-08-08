import type { TripRepository } from './trip.repository.ts';

// Implementación para cuando Supabase no está configurado: no guarda nada y no
// se queja. Sostiene el criterio de la fase 6 —"si la base de datos falla, el
// viaje se genera igual"— también en el caso de que directamente no la haya, que
// es lo que ocurre en desarrollo y en los tests.
export class NoopTripRepository implements TripRepository {
  async createTripRequest(): Promise<string | null> {
    return null;
  }

  async saveGenerationOutcome(): Promise<void> {
    // Sin base de datos no hay nada que escribir.
  }
}
