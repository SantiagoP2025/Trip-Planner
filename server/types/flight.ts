// Sección 11.1: modelo interno de vuelo. Los proveedores simulados y reales
// deben producir esta misma forma para que el motor de puntuación no distinga entre ellos.
export interface FlightSegment {
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  carrier: string;
  flightNumber: string;
  durationMinutes: number;
}

export interface FlightOffer {
  id: string;
  provider: string;
  totalPrice: number;
  currency: string;
  outbound: FlightSegment[];
  inbound?: FlightSegment[];
  totalDurationMinutes: number;
  stops: number;
  baggageIncluded: boolean;
  refundable: boolean;
  bookingUrl?: string;
  fetchedAt: string;
}
