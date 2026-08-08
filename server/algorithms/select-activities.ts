import type { ActivityCandidate } from '../types/activity.js';
import type { PreferenceProfile } from '../types/common.js';
import { roundCurrency } from './allocate-budget.js';
import { calculateActivitiesPreferenceScore, calculatePreferenceScore } from './score-preferences.js';

// Sección 12.1: "Máximo tres visitas principales al día".
export const MAX_VISITS_PER_DAY = 3;

// Sección 12.1: "Reducir intensidad si la preferencia Relax o Familia es alta".
export const REDUCED_VISITS_PER_DAY = 2;

// Sección 6: nivel 3 es "Imprescindible", el máximo del catálogo de preferencias.
const HIGH_PREFERENCE_LEVEL = 3;

export interface ActivitySelectionInput {
  candidates: readonly ActivityCandidate[];
  preferences: PreferenceProfile;
  // Días sobre el terreno: noches + 1, la misma convención que allocateBudget().
  days: number;
  travelers: number;
  // Sección 9: el reparto orientativo (10 % en actividades) no fija el gasto
  // final, pero sí acota la selección antes de conocer los precios reales del
  // vuelo y del alojamiento.
  maxTotalCost: number;
}

export interface ActivitySelection {
  activities: ActivityCandidate[];
  // Sección 9.1: coste para todos los viajeros, no por persona.
  totalCost: number;
  // Sección 10.2, criterio "Afinidad con preferencias".
  preferenceScore: number;
}

// Sección 12.1: la intensidad del día baja cuando el viaje es de descanso o en
// familia. El reparto real entre días lo hace la fase del itinerario; aquí solo
// se necesita cuántas visitas caben en total para acotar el coste.
export function calculateVisitsPerDay(preferences: PreferenceProfile): number {
  const lowIntensity =
    preferences.relax >= HIGH_PREFERENCE_LEVEL || preferences.family >= HIGH_PREFERENCE_LEVEL;
  return lowIntensity ? REDUCED_VISITS_PER_DAY : MAX_VISITS_PER_DAY;
}

// Sección 6: las preferencias intervienen en la selección de actividades. Se
// eligen las de mayor afinidad que quepan en el tope de gasto y en el número de
// visitas del viaje.
export function selectActivities(input: ActivitySelectionInput): ActivitySelection {
  const travelers = Math.max(1, input.travelers);
  const maxActivities = calculateVisitsPerDay(input.preferences) * Math.max(1, input.days);

  // Regla 6 de CLAUDE.md: la afinidad de cada candidato se calcula una sola vez,
  // antes de ordenar, y no dentro del comparador, que se ejecuta O(n log n) veces.
  const ranked = input.candidates
    .map((activity) => ({
      activity,
      affinity: calculatePreferenceScore(input.preferences, activity.profile),
    }))
    .sort((a, b) => b.affinity - a.affinity || a.activity.id.localeCompare(b.activity.id));

  const activities: ActivityCandidate[] = [];
  let totalCost = 0;

  for (const entry of ranked) {
    if (activities.length >= maxActivities) break;

    const cost = roundCurrency((entry.activity.pricePerPerson ?? 0) * travelers);
    // Se descarta la actividad, no el resto del recorrido: una cara que no cabe
    // no debe impedir que entren las gratuitas o baratas que vienen detrás.
    if (totalCost + cost > input.maxTotalCost) continue;

    activities.push(entry.activity);
    totalCost = roundCurrency(totalCost + cost);
  }

  return {
    activities,
    totalCost,
    preferenceScore: calculateActivitiesPreferenceScore(input.preferences, activities),
  };
}
