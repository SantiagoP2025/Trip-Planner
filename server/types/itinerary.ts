import type { VerificationStatus } from './common.ts';

// Sección 12.2: elemento de itinerario. El horario final lo calcula el backend
// mediante reglas y datos de rutas, nunca la IA directamente (sección 12).
export type ItineraryItemType =
  | 'arrival'
  | 'transfer'
  | 'hotel'
  | 'meal'
  | 'visit'
  | 'walk'
  | 'free_time';

export interface ItineraryItem {
  id: string;
  startTime: string;
  endTime: string;
  type: ItineraryItemType;
  title: string;
  description?: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
  durationMinutes: number;
  travelMinutesFromPrevious?: number;
  transportMode?: string;
  costPerPerson?: number;
  bookingRequired?: boolean;
  bookingUrl?: string;
  verificationStatus: VerificationStatus;
  notes?: string[];
}

// Sección 12: agrupación diaria de elementos ya distribuidos y validados.
export interface ItineraryDay {
  date: string;
  items: ItineraryItem[];
}
