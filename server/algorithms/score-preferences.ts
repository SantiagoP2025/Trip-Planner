import type { PreferenceProfile } from '../types/common.js';
import type { ActivityCandidate } from '../types/activity.js';
import { roundScore } from './normalize-score.js';

// Sección 6: el nivel máximo de una preferencia es 3 ("Imprescindible").
export const MAX_PREFERENCE_LEVEL = 3;

// Puntuación neutra cuando no hay información: el usuario no marcó ninguna
// preferencia, o no hay actividades sobre las que medir la afinidad (sección 6.2).
export const NEUTRAL_PREFERENCE_SCORE = 50;

// Sección 6.2: función de afinidad. La especificación la escribe sobre los
// niveles crudos (0-3); aquí el perfil de la opción se lleva a 0-100 porque la
// sección 10.3 exige esa escala común antes de aplicar pesos, y porque el valor
// de reserva que fija la propia sección 6.2 (50) ya está en esa escala.
export function calculatePreferenceScore(
  userPreferences: PreferenceProfile,
  optionProfile: PreferenceProfile,
): number {
  let weightedScore = 0;
  let totalWeight = 0;

  for (const key of Object.keys(userPreferences) as Array<keyof PreferenceProfile>) {
    const weight = userPreferences[key];

    if (weight === 0) continue;

    weightedScore += ((optionProfile[key] / MAX_PREFERENCE_LEVEL) * 100) * weight;
    totalWeight += weight;
  }

  return totalWeight === 0 ? NEUTRAL_PREFERENCE_SCORE : roundScore(weightedScore / totalWeight);
}

// Sección 6: las preferencias intervienen en la selección de actividades, así
// que la afinidad de una propuesta es la media de la afinidad de las actividades
// que la componen.
export function calculateActivitiesPreferenceScore(
  userPreferences: PreferenceProfile,
  activities: readonly ActivityCandidate[],
): number {
  if (activities.length === 0) return NEUTRAL_PREFERENCE_SCORE;

  let total = 0;
  for (const activity of activities) {
    total += calculatePreferenceScore(userPreferences, activity.profile);
  }

  return roundScore(total / activities.length);
}
