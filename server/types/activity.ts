import type { OpeningPeriod, PreferenceProfile, VerificationStatus } from './common.ts';

// Sección 11.5: candidato de actividad. La IA puede proponerlos, pero solo
// entra en el itinerario final tras verificar horario, coordenadas y precio (sección 12).
export interface ActivityCandidate {
  id: string;
  name: string;
  category: string;
  profile: PreferenceProfile;
  latitude: number;
  longitude: number;
  rating?: number;
  pricePerPerson?: number;
  estimatedDurationMinutes: number;
  openingHours?: OpeningPeriod[];
  bookingRequired?: boolean;
  bookingUrl?: string;
  verificationStatus: VerificationStatus;
}
