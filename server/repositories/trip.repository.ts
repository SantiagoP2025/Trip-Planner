import type { TripGenerationDiagnostics, TripProposal, TripRequest } from '../types/trip.js';

// Sección 13.1: la columna `status` de trip_requests. La fila se crea en
// `pending` antes de generar y se cierra después, así que una solicitud que se
// quede en `pending` es una generación que murió por el camino.
export type TripRequestStatus = 'pending' | 'completed' | 'empty' | 'failed';

export interface NewTripRequest {
  request: TripRequest;
  // Nulo mientras la generación sea anónima. Las cuentas llegan en la fase 8.
  userId: string | null;
}

export interface TripGenerationFailure {
  // El proveedor que falló, cuando se sabe cuál fue.
  provider: string | null;
  message: string;
}

export interface TripGenerationOutcome {
  status: Exclude<TripRequestStatus, 'pending'>;
  proposals: TripProposal[];
  diagnostics: TripGenerationDiagnostics | null;
  failure: TripGenerationFailure | null;
}

// Sección 14.1, mismo patrón que con los proveedores: el endpoint habla con esta
// interfaz. Cambiar Supabase por otra cosa, o apagar la persistencia, es
// sustituir la implementación sin tocar el motor ni el handler.
//
// Las implementaciones pueden lanzar: quien decide que un fallo de base de datos
// no rompe la generación es `BestEffortTripPersistence`, no cada repositorio.
export interface TripRepository {
  // `null` significa "no se ha guardado nada y no es un error": es lo que
  // devuelve la implementación inerte cuando no hay base de datos configurada.
  // Un fallo real de escritura se lanza como excepción, no se devuelve como null.
  createTripRequest(record: NewTripRequest): Promise<string | null>;
  saveGenerationOutcome(tripRequestId: string, outcome: TripGenerationOutcome): Promise<void>;
}
