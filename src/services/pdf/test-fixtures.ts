import type { ItineraryDay, TripProposal } from '../../types/api.ts';
import type { PdfTripSummary } from './trip-document.ts';

// Propuestas de ejemplo con la forma exacta que devuelve el backend, para los
// tests del PDF.
//
// Este fichero es `test-fixtures.ts` y no `.test.ts` a propósito: lo importan
// tres tests distintos y no tiene sentido copiarlo en los tres. Lo que sí es a
// propósito es que construir propuestas siga siendo cosa exclusiva del material
// de pruebas: el cierre de la fase 7 manda que en `src/` no haya nada de
// producción que lo haga, y `no-client-generator.test.ts` lo comprueba.

export const SUMMARY: PdfTripSummary = {
  origin: 'Valencia',
  destination: 'Lisboa',
  departureDate: '2026-09-10',
  returnDate: '2026-09-12',
  travelers: { adults: 2, children: 1 },
};

export const ITINERARY: ItineraryDay[] = [
  {
    date: '2026-09-10',
    items: [
      {
        id: 'dia1-llegada',
        startTime: '2026-09-10T17:20:00.000Z',
        endTime: '2026-09-10T18:20:00.000Z',
        type: 'arrival',
        title: 'Llegada y traslado al hotel',
        durationMinutes: 60,
        verificationStatus: 'partial',
        notes: ['Horario estimado sobre la llegada del vuelo.'],
      },
      {
        id: 'dia1-visita',
        startTime: '2026-09-10T19:00:00.000Z',
        endTime: '2026-09-10T20:30:00.000Z',
        type: 'visit',
        title: 'Mirador de Santa Luzia',
        latitude: 38.712,
        longitude: -9.128,
        durationMinutes: 90,
        travelMinutesFromPrevious: 15,
        costPerPerson: 0,
        verificationStatus: 'verified',
      },
      {
        id: 'dia1-cena',
        startTime: '2026-09-10T21:00:00.000Z',
        endTime: '2026-09-10T22:30:00.000Z',
        type: 'meal',
        title: 'Cena en el barrio de Alfama',
        durationMinutes: 90,
        costPerPerson: 22,
        verificationStatus: 'unverified',
      },
    ],
  },
  {
    date: '2026-09-11',
    items: [
      {
        id: 'dia2-museo',
        startTime: '2026-09-11T10:00:00.000Z',
        endTime: '2026-09-11T12:00:00.000Z',
        type: 'visit',
        title: 'Museo Nacional de Arte Antiga',
        latitude: 38.704,
        longitude: -9.161,
        durationMinutes: 120,
        costPerPerson: 8,
        bookingRequired: true,
        verificationStatus: 'verified',
      },
      {
        id: 'dia2-paseo',
        startTime: '2026-09-11T12:30:00.000Z',
        endTime: '2026-09-11T13:30:00.000Z',
        type: 'walk',
        title: 'Paseo por la ribera',
        latitude: 38.697,
        longitude: -9.177,
        durationMinutes: 60,
        travelMinutesFromPrevious: 20,
        verificationStatus: 'partial',
      },
    ],
  },
];

export function buildProposal(overrides: Partial<TripProposal> = {}): TripProposal {
  return {
    id: 'recommended-1',
    type: 'recommended',
    rank: 1,
    score: 82.4,
    estimatedTotal: 2386.06,
    currency: 'EUR',
    budget: {
      mainTransportCost: 555.46,
      accommodationCost: 890,
      foodBudget: 480,
      activityCost: 210,
      localTransportCost: 120,
      insuranceCost: 40,
      emergencyReserve: 90.6,
      totalTripCost: 2386.06,
      currency: 'EUR',
    },
    flight: {
      id: 'mock-flight-0',
      provider: 'mock-flights',
      totalPrice: 555.46,
      currency: 'EUR',
      outbound: [
        {
          origin: 'VLC',
          destination: 'LIS',
          departureTime: '2026-09-10T15:15:00.000Z',
          arrivalTime: '2026-09-10T17:20:00.000Z',
          carrier: 'Iberia',
          flightNumber: 'IB123',
          durationMinutes: 125,
        },
      ],
      inbound: [
        {
          origin: 'LIS',
          destination: 'VLC',
          departureTime: '2026-09-12T18:00:00.000Z',
          arrivalTime: '2026-09-12T20:05:00.000Z',
          carrier: 'Iberia',
          flightNumber: 'IB124',
          durationMinutes: 125,
        },
      ],
      totalDurationMinutes: 250,
      stops: 0,
      baggageIncluded: true,
      refundable: false,
      fetchedAt: '2026-08-08T10:00:00.000Z',
    },
    accommodation: {
      id: 'mock-hotel-0',
      provider: 'mock-accommodations',
      name: 'Hotel Alfama',
      totalPrice: 890,
      currency: 'EUR',
      rating: 8.6,
      reviewCount: 412,
      latitude: 38.711,
      longitude: -9.13,
      distanceToCenterKm: 1.2,
      breakfastIncluded: true,
      freeCancellation: true,
      capacity: 3,
      fetchedAt: '2026-08-08T10:00:00.000Z',
    },
    itinerary: ITINERARY,
    evaluatedCombinations: 625,
    discardedCombinations: 480,
    reasons: ['La mejor relación entre precio y puntuación.', 'Alojamiento céntrico.'],
    warnings: ['El vuelo de vuelta sale a última hora.'],
    ...overrides,
  };
}
