import type {
  NewTripRequest,
  TripGenerationOutcome,
  TripRepository,
} from '../repositories/trip.repository.js';
import { withinTimeout } from './with-timeout.js';

// Criterio de la fase 6: la persistencia es best-effort. Si la base de datos
// falla, el viaje se genera igual.
//
// Ese "igual" se cumple aquí y en un solo sitio: ningún repositorio decide qué
// hacer con sus propios errores, y el handler no lleva try/catch alrededor de
// cada escritura. Esta capa traga el fallo, lo registra y devuelve el control.

// `requestId` viaja en cada llamada porque la sección 16.3 pide que todo lo que
// se registre se pueda atar a la petición que lo provocó. Un fallo de escritura
// que el usuario no ve es justo el que hay que poder encontrar después.
export interface TripPersistence {
  // Crea la fila de la solicitud. Devuelve `null` si no se ha guardado, sea
  // porque no hay base de datos o porque la escritura falló.
  begin(requestId: string, record: NewTripRequest): Promise<string | null>;
  complete(
    requestId: string,
    tripRequestId: string | null,
    outcome: TripGenerationOutcome,
  ): Promise<void>;
}

export interface BestEffortTripPersistenceOptions {
  timeoutMs?: number;
  onError?: (requestId: string, event: string, error: unknown) => void;
}

// Una base de datos que no responde es tan dañina como una que falla: sin tope,
// el usuario se queda esperando por una escritura que ni siquiera necesita para
// ver su viaje.
export const DEFAULT_PERSISTENCE_TIMEOUT_MS = 3_000;

function withinDatabaseTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return withinTimeout(work, timeoutMs, `La base de datos no respondió en ${timeoutMs} ms.`);
}

export class BestEffortTripPersistence implements TripPersistence {
  private readonly repository: TripRepository;
  private readonly timeoutMs: number;
  private readonly onError: (requestId: string, event: string, error: unknown) => void;

  constructor(repository: TripRepository, options: BestEffortTripPersistenceOptions = {}) {
    this.repository = repository;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_PERSISTENCE_TIMEOUT_MS;
    this.onError = options.onError ?? (() => {});
  }

  async begin(requestId: string, record: NewTripRequest): Promise<string | null> {
    try {
      return await withinDatabaseTimeout(this.repository.createTripRequest(record), this.timeoutMs);
    } catch (error) {
      this.onError(requestId, 'trip.persistence_begin_failed', error);
      return null;
    }
  }

  async complete(
    requestId: string,
    tripRequestId: string | null,
    outcome: TripGenerationOutcome,
  ): Promise<void> {
    // Sin fila creada no hay nada que cerrar: la generación siguió adelante sin
    // base de datos, que es justamente lo que tenía que pasar.
    if (tripRequestId === null) return;

    try {
      await withinDatabaseTimeout(
        this.repository.saveGenerationOutcome(tripRequestId, outcome),
        this.timeoutMs,
      );
    } catch (error) {
      this.onError(requestId, 'trip.persistence_complete_failed', error);
    }
  }
}
