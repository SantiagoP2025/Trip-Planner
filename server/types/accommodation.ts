// Sección 11.3: modelo interno de alojamiento.
export interface AccommodationOffer {
  id: string;
  provider: string;
  name: string;
  totalPrice: number;
  currency: string;
  rating?: number;
  reviewCount?: number;
  latitude: number;
  longitude: number;
  distanceToCenterKm?: number;
  breakfastIncluded?: boolean;
  freeCancellation?: boolean;
  capacity: number;
  bookingUrl?: string;
  fetchedAt: string;
}
