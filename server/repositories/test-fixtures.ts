import type { ItineraryEdit, SavedTrip } from '../types/saved-trip.js';
import type { ProposalType, TripProposal } from '../types/trip.js';
import type {
  NewSavedTrip,
  SavedTripRepository,
  TripRequestOwnership,
} from './saved-trip.repository.js';

// Doble de `SavedTripRepository` para los tests de los handlers: registra lo que
// se le pide y devuelve lo que le digan.
//
// Vive aquí, y no dentro de un fichero de test, porque lo usan los dos endpoints
// que tocan viajes guardados —el de la fase 8 y el de ediciones de la fase 11— y
// una copia por endpoint se separa de la otra en cuanto cambia la interfaz. Que
// el compilador obligue a actualizar un solo sitio es justo lo que queremos.

export const FIXTURE_USER = { id: 'usuario-1', email: 'alguien@ejemplo.test' };
export const FIXTURE_TRIP_ID = '3f1a5a1e-8b1a-4a4e-9a4c-0f0b2d3e4a5b';
export const FIXTURE_SAVED_ID = '7c2b6b2f-9c2b-4b5f-8b5d-1a1c3e4f5a6b';

export function buildSavedTrip(overrides: Partial<SavedTrip> = {}): SavedTrip {
  return {
    id: FIXTURE_SAVED_ID,
    title: 'Valencia → Lisboa',
    savedAt: '2026-08-08T10:00:00.000Z',
    tripRequestId: FIXTURE_TRIP_ID,
    origin: 'Valencia',
    destination: 'Lisboa',
    departureDate: '2026-09-10',
    returnDate: '2026-09-17',
    proposal: { id: 'recommended-1', type: 'recommended' } as unknown as TripProposal,
    edits: [],
    ...overrides,
  };
}

export class FakeSavedTripRepository implements SavedTripRepository {
  tripRequest: TripRequestOwnership | null = {
    userId: FIXTURE_USER.id,
    origin: 'Valencia',
    destination: 'Lisboa',
    departureDate: '2026-09-10',
    returnDate: '2026-09-17',
  };
  proposalId: string | null = 'propuesta-1';
  existingSavedId: string | null = null;
  count = 0;
  trips: SavedTrip[] = [];
  deleted = true;
  // Fase 11: el viaje que devuelve `findSavedTripForUser`. `null` es "no existe
  // o no es tuyo", que el handler contesta igual.
  savedTrip: SavedTrip | null = null;
  editDeleted = true;

  readonly savedRecords: NewSavedTrip[] = [];
  readonly listedFor: { userId: string; limit: number }[] = [];
  readonly deleteCalls: { savedTripId: string; userId: string }[] = [];
  readonly lookups: { savedTripId: string; userId: string }[] = [];
  readonly upserts: { savedTripId: string; edit: Omit<ItineraryEdit, 'updatedAt'> }[] = [];
  readonly editDeletes: { savedTripId: string; itemId: string }[] = [];

  async findTripRequest(_tripRequestId: string): Promise<TripRequestOwnership | null> {
    return this.tripRequest;
  }

  async findProposalId(_tripRequestId: string, _type: ProposalType): Promise<string | null> {
    return this.proposalId;
  }

  async findSavedTripId(_userId: string, _tripProposalId: string): Promise<string | null> {
    return this.existingSavedId;
  }

  async countByUser(_userId: string): Promise<number> {
    return this.count;
  }

  async save(record: NewSavedTrip): Promise<SavedTrip> {
    this.savedRecords.push(record);
    return buildSavedTrip({ title: record.title });
  }

  async listByUser(userId: string, limit: number): Promise<SavedTrip[]> {
    this.listedFor.push({ userId, limit });
    return this.trips;
  }

  async deleteById(savedTripId: string, userId: string): Promise<boolean> {
    this.deleteCalls.push({ savedTripId, userId });
    return this.deleted;
  }

  async findSavedTripForUser(savedTripId: string, userId: string): Promise<SavedTrip | null> {
    this.lookups.push({ savedTripId, userId });
    return this.savedTrip;
  }

  async upsertEdit(
    savedTripId: string,
    edit: Omit<ItineraryEdit, 'updatedAt'>,
  ): Promise<ItineraryEdit> {
    this.upserts.push({ savedTripId, edit });
    return { ...edit, updatedAt: '2026-08-08T12:00:00.000Z' };
  }

  async deleteEdit(savedTripId: string, itemId: string): Promise<boolean> {
    this.editDeletes.push({ savedTripId, itemId });
    return this.editDeleted;
  }
}
