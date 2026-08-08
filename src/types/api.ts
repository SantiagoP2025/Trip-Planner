// Único punto por el que el frontend toca los tipos del servidor.
//
// Son reexportaciones `export type`, así que desaparecen al compilar y no
// arrastran ni una línea de código del servidor al bundle del navegador. Que
// estén centralizadas aquí es lo que hace fácil comprobar que sigue siendo así:
// ningún otro fichero de `src/` importa nada de `server/types/`.
//
// Regla 1 de CLAUDE.md: el frontend usa estos tipos para *pintar* lo que le
// devuelve el endpoint. Nada de `src/` construye una propuesta, un vuelo, un
// alojamiento ni un precio.

export type {
  Currency,
  PreferenceLevel,
  PreferenceProfile,
  TravelPreference,
} from '../../server/types/common.ts';

export type {
  BudgetBreakdown,
  ProposalType,
  TravelStyle,
  TripConstraints,
  TripProposal,
  TripRequest,
  TripScoreBreakdown,
  ValidationError,
} from '../../server/types/trip.ts';

export type { FlightOffer, FlightSegment } from '../../server/types/flight.ts';

export type { AccommodationOffer } from '../../server/types/accommodation.ts';

export type { ItineraryDay } from '../../server/types/itinerary.ts';

export type { SavedTrip } from '../../server/types/saved-trip.ts';

export type {
  ApiErrorBody,
  ApiErrorCode,
  DeleteSavedTripResponseBody,
  GenerateTripResponseBody,
  RuntimeConfigResponseBody,
  SavedTripsResponseBody,
  SaveTripResponseBody,
} from '../../server/types/api.ts';
