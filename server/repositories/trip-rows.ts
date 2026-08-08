import type { PreferenceProfile } from '../types/common.ts';
import type { TripConstraints, TripProposal } from '../types/trip.ts';
import type { NewTripRequest, TripGenerationOutcome, TripRequestStatus } from './trip.repository.ts';

// Traducción entre los tipos del dominio y las filas de la sección 13.1.
//
// Vive aparte del repositorio y sin dependencias del cliente de Supabase, para
// poder comprobar el mapeo —que es donde se cuelan los errores silenciosos— sin
// levantar una base de datos.

export interface TripRequestRow {
  user_id: string | null;
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string;
  adults: number;
  children: number;
  budget: number;
  currency: string;
  travel_style: string;
  preferences: PreferenceProfile;
  constraints: TripConstraints | null;
  status: TripRequestStatus;
}

export interface TripProposalRow {
  trip_request_id: string;
  proposal_type: string;
  total_cost: number;
  score: number;
  data: TripProposal;
}

export interface ProviderSearchRow {
  trip_request_id: string;
  provider: string;
  status: 'ok' | 'failed';
  offers_found: number | null;
  error_message: string | null;
}

// El mensaje de error se guarda acotado: sirve para saber qué falló, y un texto
// sin tope es una vía para engordar la tabla con lo que devuelva un tercero.
const MAX_ERROR_MESSAGE_LENGTH = 500;

export function truncateErrorMessage(message: string): string {
  return message.length <= MAX_ERROR_MESSAGE_LENGTH
    ? message
    : `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`;
}

export function toTripRequestRow(record: NewTripRequest): TripRequestRow {
  const { request } = record;

  return {
    user_id: record.userId,
    origin: request.origin,
    destination: request.destination,
    departure_date: request.departureDate,
    return_date: request.returnDate,
    adults: request.travelers.adults,
    children: request.travelers.children,
    budget: request.budget,
    currency: request.currency,
    travel_style: request.travelStyle,
    preferences: request.preferences,
    // Sección 13.2: preferencias y restricciones van en JSONB.
    constraints: request.constraints ?? null,
    status: 'pending',
  };
}

export function toTripProposalRows(
  tripRequestId: string,
  proposals: readonly TripProposal[],
): TripProposalRow[] {
  return proposals.map((proposal) => ({
    trip_request_id: tripRequestId,
    proposal_type: proposal.type,
    total_cost: proposal.estimatedTotal,
    score: proposal.score,
    // Sección 13.2: la propuesta entera en JSONB. Vuelos, alojamientos e
    // itinerarios se separarán en tablas propias "cuando el modelo se estabilice".
    data: proposal,
  }));
}

// Sección 13.1 y 16.3: una fila de auditoría por proveedor consultado. Un
// proveedor que no aparece en las duraciones no llegó a responder.
type OfferCountKey = 'flightsFound' | 'accommodationsFound' | 'activitiesFound';

const OFFER_COUNT_BY_PROVIDER: Record<string, OfferCountKey> = {
  flights: 'flightsFound',
  accommodations: 'accommodationsFound',
  places: 'activitiesFound',
};

export function toProviderSearchRows(
  tripRequestId: string,
  outcome: TripGenerationOutcome,
): ProviderSearchRow[] {
  const rows: ProviderSearchRow[] = [];

  if (outcome.diagnostics) {
    for (const [provider, countKey] of Object.entries(OFFER_COUNT_BY_PROVIDER)) {
      const responded = provider in outcome.diagnostics.providerDurationsMs;
      rows.push({
        trip_request_id: tripRequestId,
        provider,
        status: responded ? 'ok' : 'failed',
        offers_found: responded ? outcome.diagnostics[countKey] : null,
        // Sección 13.2: ni `request_data` ni `response_data` se escriben. Las
        // columnas existen porque las pide la sección 13.1, pero el volcado de
        // la respuesta de un proveedor es exactamente el dato innecesario que
        // esa sección dice que no hay que conservar.
        error_message: responded ? null : 'El proveedor no devolvió respuesta.',
      });
    }
  }

  // Cuando la generación se cae no hay diagnóstico, pero sí se sabe qué pasó.
  if (outcome.failure) {
    rows.push({
      trip_request_id: tripRequestId,
      provider: outcome.failure.provider ?? 'desconocido',
      status: 'failed',
      offers_found: null,
      error_message: truncateErrorMessage(outcome.failure.message),
    });
  }

  return rows;
}
