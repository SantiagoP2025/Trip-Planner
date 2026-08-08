import type { AccommodationOffer } from '../types/accommodation.js';
import type { ActivityCandidate } from '../types/activity.js';
import type { PreferenceProfile, TravelPreference } from '../types/common.js';
import type { FlightOffer } from '../types/flight.js';
import type { BudgetBreakdown, ProposalType, TripScoreBreakdown } from '../types/trip.js';

// Sección 10.7: cada propuesta debe poder explicar por qué se eligió. Estos
// textos llegan tal cual al usuario, así que van en español y sin jerga técnica
// (convención de CLAUDE.md).

const PREFERENCE_LABELS: Record<TravelPreference, string> = {
  beach: 'la playa',
  culture: 'la cultura',
  gastronomy: 'la gastronomía',
  nightlife: 'la vida nocturna',
  nature: 'la naturaleza',
  shopping: 'las compras',
  family: 'los planes en familia',
  relax: 'el descanso',
};

// Sección 10.6: la primera razón dice qué prioriza el perfil, que es lo que
// distingue una propuesta de las otras dos.
const PROFILE_REASONS: Record<ProposalType, string> = {
  economical: 'Prioriza el precio manteniendo los mínimos de calidad.',
  recommended: 'Es la que mejor equilibra precio, alojamiento, horarios y preferencias.',
  comfort: 'Prioriza la calidad del alojamiento, su ubicación y la comodidad del transporte.',
};

const PREFERENCE_ORDER = Object.keys(PREFERENCE_LABELS) as TravelPreference[];

// A partir de esta puntuación de afinidad (0-100) se considera "alta".
const HIGH_AFFINITY_SCORE = 70;
// Un margen por debajo del 1 % no merece contarse como razón.
const MIN_BUDGET_MARGIN_PERCENT = 1;
const MIN_EXTRA_USABLE_HOURS = 1;
const MAX_LISTED_PREFERENCES = 2;
const RELEVANT_PREFERENCE_LEVEL = 2;
const FAR_FROM_CENTER_KM = 5;
const METERS_PER_KM = 1000;
// Por debajo de 100 m la distancia al centro ya no distingue nada.
const MIN_MEASURABLE_DISTANCE_KM = 0.1;
const MAX_RATING = 5;

export interface ProposalExplanationInput {
  type: ProposalType;
  budgetLimit: number;
  budget: BudgetBreakdown;
  flight: FlightOffer;
  accommodation: AccommodationOffer;
  activities: readonly ActivityCandidate[];
  scores: TripScoreBreakdown;
  usableHours: number;
  // Horas en destino del peor vuelo del conjunto. Viene del contexto de
  // puntuación, que se calcula una sola vez fuera del bucle (regla 6 de
  // CLAUDE.md); es la referencia contra la que se mide el "más".
  worstUsableHours: number;
  preferences: PreferenceProfile;
}

// El separador decimal en español es la coma. Se formatea a mano en vez de con
// toLocaleString() para que el texto no dependa de los datos de idioma que traiga
// el entorno de ejecución.
function formatNumber(value: number, decimals = 0): string {
  return value.toFixed(decimals).replace('.', ',');
}

// Los proveedores redondean la distancia, así que un alojamiento céntrico llega
// como 0 km. "A 0 m del centro" suena a dato roto; "en pleno centro" dice lo mismo.
function describeDistanceToCenter(distanceKm: number): string {
  if (distanceKm < MIN_MEASURABLE_DISTANCE_KM) return 'El alojamiento está en pleno centro.';
  if (distanceKm < 1) {
    return `El alojamiento se encuentra a ${Math.round(distanceKm * METERS_PER_KM)} m del centro.`;
  }
  return `El alojamiento se encuentra a ${formatNumber(distanceKm, 1)} km del centro.`;
}

function joinInSpanish(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? '';
  return `${values.slice(0, -1).join(', ')} y ${values[values.length - 1]}`;
}

// Sección 6: las preferencias que el usuario marcó como relevantes, de mayor a
// menor. El orden del catálogo desempata, así que el texto es siempre el mismo
// para la misma búsqueda.
function listTopPreferences(preferences: PreferenceProfile): string[] {
  return PREFERENCE_ORDER.filter((key) => preferences[key] >= RELEVANT_PREFERENCE_LEVEL)
    .sort((a, b) => preferences[b] - preferences[a])
    .slice(0, MAX_LISTED_PREFERENCES)
    .map((key) => PREFERENCE_LABELS[key]);
}

// Sección 10.7: razones por las que esta combinación acabó siendo una de las tres.
export function buildProposalReasons(input: ProposalExplanationInput): string[] {
  const reasons: string[] = [PROFILE_REASONS[input.type]];

  if (input.budgetLimit > 0) {
    const marginPercent = Math.round(
      ((input.budgetLimit - input.budget.totalTripCost) / input.budgetLimit) * 100,
    );
    if (marginPercent >= MIN_BUDGET_MARGIN_PERCENT) {
      reasons.push(`Está un ${marginPercent} % por debajo del presupuesto.`);
    }
  }

  if (input.accommodation.distanceToCenterKm !== undefined) {
    reasons.push(describeDistanceToCenter(input.accommodation.distanceToCenterKm));
  }

  const extraHours = Math.floor(input.usableHours - input.worstUsableHours);
  if (extraHours >= MIN_EXTRA_USABLE_HOURS) {
    const unit = extraHours === 1 ? 'hora' : 'horas';
    reasons.push(`Permite aprovechar ${extraHours} ${unit} más en destino.`);
  }

  if (input.flight.stops === 0) {
    reasons.push('El vuelo de ida es directo.');
  }

  if (input.accommodation.rating !== undefined) {
    const rating = `${formatNumber(input.accommodation.rating, 1)} sobre ${MAX_RATING}`;
    reasons.push(
      input.accommodation.reviewCount !== undefined
        ? `El alojamiento tiene una valoración de ${rating} con ${input.accommodation.reviewCount} opiniones.`
        : `El alojamiento tiene una valoración de ${rating}.`,
    );
  }

  const topPreferences = listTopPreferences(input.preferences);
  if (input.scores.preferenceMatch >= HIGH_AFFINITY_SCORE && topPreferences.length > 0) {
    reasons.push(`La afinidad con ${joinInSpanish(topPreferences)} es alta.`);
  }

  return reasons;
}

// Sección 10.7: lo que el usuario debe saber antes de decidir. Sección 9.1:
// "rechazar propuestas que oculten costes esenciales" y "mostrar claramente
// conceptos estimados y conceptos verificados".
export function buildProposalWarnings(input: ProposalExplanationInput): string[] {
  const warnings: string[] = [];

  // Criterio de aceptación de la sección 17.3: el presupuesto total nunca supera
  // el límite sin una advertencia explícita. checkHardConstraints() (sección
  // 10.1) ya descarta estas combinaciones antes de llegar aquí; la advertencia
  // queda como última red por si alguna vez se relaja esa restricción.
  if (input.budget.totalTripCost > input.budgetLimit) {
    warnings.push('El coste total estimado supera el presupuesto que has indicado.');
  }

  if (!input.flight.baggageIncluded) {
    warnings.push('El equipaje facturado no está incluido.');
  }

  if (!input.flight.refundable) {
    warnings.push('El vuelo no admite cambios ni devolución.');
  }

  if (input.flight.stops > 0) {
    warnings.push(
      input.flight.stops === 1
        ? 'El vuelo de ida tiene una escala.'
        : `El vuelo de ida tiene ${input.flight.stops} escalas.`,
    );
  }

  if (!input.accommodation.freeCancellation) {
    warnings.push('El alojamiento no ofrece cancelación gratuita.');
  }

  if (input.accommodation.rating === undefined) {
    warnings.push('El alojamiento todavía no tiene valoraciones.');
  }

  if ((input.accommodation.distanceToCenterKm ?? 0) > FAR_FROM_CENTER_KM) {
    warnings.push(`El alojamiento está a más de ${FAR_FROM_CENTER_KM} km del centro.`);
  }

  // Sección 11.5: los candidatos de actividades solo son 'verified' cuando una
  // fuente externa real los ha confirmado, cosa que los datos simulados no hacen.
  if (input.activities.some((activity) => activity.verificationStatus !== 'verified')) {
    warnings.push(
      'Los horarios y precios de las actividades son estimados y están pendientes de confirmar.',
    );
  }

  return warnings;
}
