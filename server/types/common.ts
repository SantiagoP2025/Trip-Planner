// Sección 5 y 6: catálogo de preferencias compartido por solicitud, puntuación e itinerario.
export type TravelPreference =
  | 'beach'
  | 'culture'
  | 'gastronomy'
  | 'nightlife'
  | 'nature'
  | 'shopping'
  | 'family'
  | 'relax';

export type PreferenceLevel = 0 | 1 | 2 | 3;

export type PreferenceProfile = Record<TravelPreference, PreferenceLevel>;

export type Currency = 'EUR' | 'USD' | 'GBP';

export type VerificationStatus = 'verified' | 'partial' | 'unverified';

// Sección 12.3: checkOpeningHours() necesita franjas horarias por día.
export interface OpeningPeriod {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
}
