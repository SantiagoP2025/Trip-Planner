import {
  allocateBudget,
  allocateInitialBudget,
  calculateMinimumEmergencyReserve,
  calculateMinimumFoodBudget,
  DEFAULT_BUDGET_POLICY,
  type BudgetPolicy,
} from '../algorithms/allocate-budget.ts';
import { combineOffers } from '../algorithms/combine-offers.ts';
import { filterDominated } from '../algorithms/pareto-filter.ts';
import {
  buildAccommodationScoringContext,
  calculateAccommodationQualityScore,
  scoreAccommodation,
} from '../algorithms/score-accommodation.ts';
import {
  buildFlightScoringContext,
  calculateTransportComfortScore,
  calculateUsableHours,
  scoreFlight,
  scoreUsableTime,
} from '../algorithms/score-flight.ts';
import { buildTripScoringContext, calculateTripScore } from '../algorithms/score-trip.ts';
import { selectActivities } from '../algorithms/select-activities.ts';
import { selectDiverseProposals, type ProposalCandidate } from '../algorithms/select-proposals.ts';
import { checkHardConstraints, meetsMinimumScores } from '../algorithms/validate-trip.ts';
import type { AccommodationProvider } from '../providers/accommodation.provider.ts';
import type { FlightProvider } from '../providers/flight.provider.ts';
import type { PlacesProvider } from '../providers/places.provider.ts';
import type { AccommodationOffer } from '../types/accommodation.ts';
import type { ActivityCandidate } from '../types/activity.ts';
import type { FlightOffer } from '../types/flight.ts';
import type {
  BudgetBreakdown,
  TripGenerationDiagnostics,
  TripGenerationResult,
  TripProposal,
  TripRequest,
  TripScoreBreakdown,
} from '../types/trip.ts';
import { buildProposalReasons, buildProposalWarnings } from './explain-proposal.ts';

// Regla 1 de CLAUDE.md: este es el único sitio donde se generan propuestas. El
// frontend pide, recibe y pinta; no construye nada.
//
// El recorrido es el de la sección 10: se piden ofertas, se recortan candidatos
// (regla 8), se combinan, se descartan las que incumplen restricciones duras
// (10.1) o umbrales mínimos (10.4), se eliminan las dominadas (10.5) y se eligen
// tres propuestas diversas (10.6) con su explicación (10.7).

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface TripPlannerProviders {
  flights: FlightProvider;
  accommodations: AccommodationProvider;
  places: PlacesProvider;
}

export interface TripPlannerOptions {
  maxFlights?: number;
  maxAccommodations?: number;
  budgetPolicy?: BudgetPolicy;
}

// Sección 16.1: el endpoint traduce este error a un 502 "Error de proveedor
// externo". Solo lleva el nombre del proveedor; el detalle va en `cause`, al log,
// nunca al usuario (sección 16.3: registrar errores sin datos personales).
export class TripProviderError extends Error {
  readonly provider: string;

  constructor(provider: string, cause: unknown) {
    super(`El proveedor "${provider}" no ha devuelto resultados.`, { cause });
    this.name = 'TripProviderError';
    this.provider = provider;
  }
}

// Oferta con sus puntuaciones parciales ya calculadas. Se enriquece una vez por
// oferta, antes de combinar: si se hiciera dentro del producto cartesiano, cada
// vuelo se puntuaría tantas veces como alojamientos haya (regla 6 de CLAUDE.md).
interface ScoredFlight {
  id: string;
  offer: FlightOffer;
  score: number;
  transportComfort: number;
  usableTime: number;
  usableHours: number;
}

interface ScoredAccommodation {
  id: string;
  offer: AccommodationOffer;
  score: number;
  quality: number;
  location: number;
}

interface EvaluatedCombination {
  id: string;
  flight: ScoredFlight;
  accommodation: ScoredAccommodation;
  budget: BudgetBreakdown;
}

interface ScoredCombination extends EvaluatedCombination {
  scores: TripScoreBreakdown;
}

interface ProviderSearchResult {
  flights: FlightOffer[];
  accommodations: AccommodationOffer[];
  activities: ActivityCandidate[];
  durationsMs: Record<string, number>;
}

function countNights(departureDate: string, returnDate: string): number {
  const nights = Math.round(
    (new Date(returnDate).getTime() - new Date(departureDate).getTime()) / MS_PER_DAY,
  );
  return Math.max(1, nights);
}

// Sección 16.3: "Registrar duración de cada proveedor".
async function timed<T>(run: () => Promise<T>): Promise<{ data: T; durationMs: number }> {
  const startedAt = Date.now();
  const data = await run();
  return { data, durationMs: Date.now() - startedAt };
}

// Sección 16.3: "Registrar descartes y causas".
function recordDiscard(
  diagnostics: TripGenerationDiagnostics,
  reasons: readonly string[],
  count = 1,
): void {
  diagnostics.discardedCombinations += count;
  for (const reason of reasons) {
    diagnostics.discardReasons[reason] = (diagnostics.discardReasons[reason] ?? 0) + count;
  }
}

async function searchProviders(
  request: TripRequest,
  providers: TripPlannerProviders,
): Promise<ProviderSearchResult> {
  // Las tres búsquedas son independientes, así que van en paralelo.
  const [flights, accommodations, activities] = await Promise.allSettled([
    timed(() =>
      providers.flights.searchFlights({
        origin: request.origin,
        destination: request.destination,
        departureDate: request.departureDate,
        returnDate: request.returnDate,
        adults: request.travelers.adults,
        children: request.travelers.children,
        currency: request.currency,
      }),
    ),
    timed(() =>
      providers.accommodations.searchAccommodations({
        destination: request.destination,
        checkIn: request.departureDate,
        checkOut: request.returnDate,
        adults: request.travelers.adults,
        children: request.travelers.children,
        currency: request.currency,
      }),
    ),
    timed(() => providers.places.searchActivities({ destination: request.destination })),
  ]);

  // Sin vuelo o sin alojamiento no hay viaje que proponer: el fallo sube.
  if (flights.status === 'rejected') throw new TripProviderError('flights', flights.reason);
  if (accommodations.status === 'rejected') {
    throw new TripProviderError('accommodations', accommodations.reason);
  }

  const durationsMs: Record<string, number> = {
    flights: flights.value.durationMs,
    accommodations: accommodations.value.durationMs,
  };
  if (activities.status === 'fulfilled') {
    durationsMs.places = activities.value.durationMs;
  }

  return {
    flights: flights.value.data,
    accommodations: accommodations.value.data,
    // Sección 17.2, "fallo de proveedor → respuesta controlada": sin actividades
    // todavía se puede proponer vuelo y alojamiento, así que la caída del
    // proveedor de lugares degrada el resultado en vez de tumbar la petición.
    activities: activities.status === 'fulfilled' ? activities.value.data : [],
    durationsMs,
  };
}

export async function generateTripProposals(
  request: TripRequest,
  providers: TripPlannerProviders,
  options: TripPlannerOptions = {},
): Promise<TripGenerationResult> {
  const travelers = request.travelers.adults + request.travelers.children;
  const nights = countNights(request.departureDate, request.returnDate);
  const days = nights + 1;
  const policy = options.budgetPolicy ?? DEFAULT_BUDGET_POLICY;

  const search = await searchProviders(request, providers);

  const diagnostics: TripGenerationDiagnostics = {
    flightsFound: search.flights.length,
    accommodationsFound: search.accommodations.length,
    activitiesFound: search.activities.length,
    evaluatedCombinations: 0,
    discardedCombinations: 0,
    discardReasons: {},
    providerDurationsMs: search.durationsMs,
  };

  if (search.flights.length === 0 || search.accommodations.length === 0) {
    return { proposals: [], diagnostics };
  }

  // Sección 6: las actividades dependen del destino y de las preferencias, no de
  // qué vuelo u hotel se elija, así que el plan se calcula una sola vez para todo
  // el conjunto de combinaciones. Sección 9: el reparto orientativo acota el
  // gasto antes de conocer los precios reales.
  const activityPlan = selectActivities({
    candidates: search.activities,
    preferences: request.preferences,
    days,
    travelers,
    maxTotalCost: allocateInitialBudget(request.budget).activities,
  });

  // Regla 6 de CLAUDE.md: los rangos del conjunto se calculan aquí, una vez, y se
  // pasan como contexto. Ninguna puntuación individual vuelve a recorrer la lista.
  const flightContext = buildFlightScoringContext(search.flights);
  const accommodationContext = buildAccommodationScoringContext(search.accommodations);

  const scoredFlights = search.flights.map((offer) => {
    const breakdown = scoreFlight(offer, flightContext);
    return {
      offer: {
        id: offer.id,
        offer,
        score: breakdown.total,
        transportComfort: calculateTransportComfortScore(breakdown),
        usableTime: scoreUsableTime(offer, flightContext),
        usableHours: calculateUsableHours(offer),
      } satisfies ScoredFlight,
      score: breakdown.total,
    };
  });

  const scoredAccommodations = search.accommodations.map((offer) => {
    const breakdown = scoreAccommodation(offer, accommodationContext, travelers);
    return {
      offer: {
        id: offer.id,
        offer,
        score: breakdown.total,
        quality: calculateAccommodationQualityScore(breakdown),
        location: breakdown.location,
      } satisfies ScoredAccommodation,
      score: breakdown.total,
    };
  });

  // Regla 8: recortar antes de combinar. Sin esto, 200 vuelos por 300
  // alojamientos serían 60.000 combinaciones para acabar enseñando tres.
  const pairs = combineOffers(scoredFlights, scoredAccommodations, {
    maxFlights: options.maxFlights,
    maxAccommodations: options.maxAccommodations,
  });
  diagnostics.evaluatedCombinations = pairs.length;

  const minimumFoodBudget = calculateMinimumFoodBudget(travelers, nights, policy);
  const minimumEmergencyReserve = calculateMinimumEmergencyReserve(request.budget, policy);

  // Sección 10.1: primero se eliminan las combinaciones inválidas.
  const evaluated: EvaluatedCombination[] = [];
  for (const pair of pairs) {
    const budget = allocateBudget({
      budget: request.budget,
      currency: request.currency,
      travelers,
      nights,
      mainTransportCost: pair.flight.offer.totalPrice,
      accommodationCost: pair.accommodation.offer.totalPrice,
      activityCost: activityPlan.totalCost,
      policy,
    });

    // El itinerario todavía no existe (llega en su propia fase), así que las dos
    // últimas restricciones de la sección 10.1 —solapamientos y horarios— no se
    // comprueban aquí: checkHardConstraints() las omite si no recibe itinerario.
    const hardConstraints = checkHardConstraints({
      budgetLimit: request.budget,
      travelers,
      departureDate: request.departureDate,
      returnDate: request.returnDate,
      flight: pair.flight.offer,
      accommodation: pair.accommodation.offer,
      budget,
      minimumFoodBudget,
      minimumEmergencyReserve,
      checkedBaggageRequired: request.constraints?.checkedBaggageRequired,
    });

    if (!hardConstraints.passed) {
      recordDiscard(diagnostics, hardConstraints.failures);
      continue;
    }

    evaluated.push({
      id: `${pair.flight.id}__${pair.accommodation.id}`,
      flight: pair.flight,
      accommodation: pair.accommodation,
      budget,
    });
  }

  // Regla 6: el rango de costes de las combinaciones viables se calcula una vez,
  // fuera del bucle que después puntúa cada una de ellas.
  const tripContext = buildTripScoringContext(evaluated.map((item) => item.budget.totalTripCost));

  const candidates: ProposalCandidate[] = [];
  const combinationsById = new Map<string, ScoredCombination>();

  for (const item of evaluated) {
    // Sección 10.2: los criterios ya vienen normalizados a 0-100; el precio se
    // normaliza aquí contra el conjunto porque solo tiene sentido comparado.
    const scores = calculateTripScore(
      {
        totalCost: item.budget.totalTripCost,
        accommodationQuality: item.accommodation.quality,
        location: item.accommodation.location,
        transportComfort: item.flight.transportComfort,
        usableTime: item.flight.usableTime,
        preferenceMatch: activityPlan.preferenceScore,
      },
      tripContext,
    );

    // Sección 10.4: una media alta no debe ocultar una deficiencia grave.
    const thresholds = meetsMinimumScores(scores);
    if (!thresholds.passed) {
      recordDiscard(diagnostics, thresholds.failures);
      continue;
    }

    combinationsById.set(item.id, { ...item, scores });
    candidates.push({
      id: item.id,
      flightId: item.flight.id,
      accommodationId: item.accommodation.id,
      scores,
      estimatedTotal: item.budget.totalTripCost,
    });
  }

  // Sección 10.5: las dominadas se eliminan antes de presentar resultados.
  const survivors = filterDominated(candidates, (candidate) => [
    candidate.scores.price,
    candidate.scores.accommodationQuality,
    candidate.scores.location,
    candidate.scores.transportComfort,
    candidate.scores.usableTime,
    candidate.scores.preferenceMatch,
  ]);

  const dominatedCount = candidates.length - survivors.length;
  if (dominatedCount > 0) {
    recordDiscard(
      diagnostics,
      ['Existe otra combinación igual o mejor en todos los criterios.'],
      dominatedCount,
    );
  }

  // Sección 10.6: tres propuestas, una por perfil, distintas entre sí.
  const selected = selectDiverseProposals(survivors);

  const proposals: TripProposal[] = [];
  for (const entry of selected) {
    const combination = combinationsById.get(entry.candidate.id);
    if (!combination) continue;

    const explanation = {
      type: entry.type,
      budgetLimit: request.budget,
      budget: combination.budget,
      flight: combination.flight.offer,
      accommodation: combination.accommodation.offer,
      activities: activityPlan.activities,
      scores: combination.scores,
      usableHours: combination.flight.usableHours,
      worstUsableHours: flightContext.usableHours.min,
      preferences: request.preferences,
    };

    proposals.push({
      id: `${entry.type}-${combination.id}`,
      type: entry.type,
      rank: entry.rank,
      score: entry.score,
      estimatedTotal: combination.budget.totalTripCost,
      currency: request.currency,
      budget: combination.budget,
      flight: combination.flight.offer,
      accommodation: combination.accommodation.offer,
      // El itinerario día a día necesita matriz de desplazamientos y coordenadas
      // verificadas del proveedor de lugares, que llegan en su propia fase
      // (sección 12). Hasta entonces va vacío, nunca inventado.
      itinerary: [],
      evaluatedCombinations: diagnostics.evaluatedCombinations,
      discardedCombinations: diagnostics.discardedCombinations,
      reasons: buildProposalReasons(explanation),
      warnings: buildProposalWarnings(explanation),
    });
  }

  return { proposals, diagnostics };
}
