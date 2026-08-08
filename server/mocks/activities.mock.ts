import type { ActivityCandidate } from '../types/activity.js';
import type { OpeningPeriod, PreferenceLevel, PreferenceProfile, TravelPreference } from '../types/common.js';
import type { ActivitySearchRequest } from '../types/provider.js';
import { randomBoolean, randomFloat, randomInt, randomItem } from './prng.js';
import { deriveBaseCoordinate, jitterCoordinate } from './geo.js';

const CATEGORIES_BY_PREFERENCE: Record<TravelPreference, string[]> = {
  beach: ['Playa', 'Deporte acuático', 'Paseo marítimo'],
  culture: ['Museo', 'Monumento', 'Visita guiada'],
  gastronomy: ['Ruta gastronómica', 'Mercado local', 'Clase de cocina'],
  nightlife: ['Bar con música en vivo', 'Discoteca', 'Espectáculo nocturno'],
  nature: ['Parque natural', 'Excursión', 'Mirador'],
  shopping: ['Zona comercial', 'Mercadillo', 'Boutique local'],
  family: ['Parque temático', 'Zoo', 'Actividad infantil'],
  relax: ['Spa', 'Jardín botánico', 'Terraza tranquila'],
};

const PREFERENCE_KEYS = Object.keys(CATEGORIES_BY_PREFERENCE) as TravelPreference[];
const QUALIFIERS = ['histórico', 'tradicional', 'popular', 'imprescindible', 'singular', 'emblemático', 'pintoresco', 'local'];

const MIN_OFFERS = 20;
const MAX_OFFERS = 30;
const AREA_RADIUS_KM = 10;
const DEFAULT_LIMIT = MAX_OFFERS;

function buildProfile(random: () => number, dominant: TravelPreference): PreferenceProfile {
  const profile = {} as PreferenceProfile;
  for (const key of PREFERENCE_KEYS) {
    profile[key] = (key === dominant ? randomInt(random, 2, 3) : randomInt(random, 0, 2)) as PreferenceLevel;
  }
  return profile;
}

function buildOpeningHours(random: () => number): OpeningPeriod[] {
  const openHour = randomInt(random, 8, 11);
  const closeHour = randomInt(random, 17, 22);
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    opensAt: `${String(openHour).padStart(2, '0')}:00`,
    closesAt: `${String(closeHour).padStart(2, '0')}:00`,
  }));
}

// Sección 11.5 y 14.1: candidatos crudos del proveedor de lugares (p.ej. Google
// Places). Nunca 'verified': eso exige una fuente externa real (sección 15.2),
// que estos datos simulados no tienen.
export function generateActivityCandidates(
  request: ActivitySearchRequest,
  random: () => number,
): ActivityCandidate[] {
  const offerCount = Math.min(randomInt(random, MIN_OFFERS, MAX_OFFERS), request.limit ?? DEFAULT_LIMIT);
  const baseCoordinate = deriveBaseCoordinate(request.destination);
  const candidates: ActivityCandidate[] = [];

  for (let i = 0; i < offerCount; i += 1) {
    const dominant = randomItem(random, PREFERENCE_KEYS);
    const category = randomItem(random, CATEGORIES_BY_PREFERENCE[dominant]);
    const coordinate = jitterCoordinate(baseCoordinate, random, AREA_RADIUS_KM);
    const isFree = randomBoolean(random, 0.2);
    const hasKnownHours = randomBoolean(random, 0.8);

    candidates.push({
      id: `mock-activity-${i}`,
      name: `${category} ${randomItem(random, QUALIFIERS)} de ${request.destination}`,
      category,
      profile: buildProfile(random, dominant),
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      rating: randomBoolean(random, 0.85) ? randomFloat(random, 3, 5, 1) : undefined,
      pricePerPerson: isFree ? 0 : randomFloat(random, 3, 60, 2),
      estimatedDurationMinutes: randomInt(random, 30, 240),
      openingHours: hasKnownHours ? buildOpeningHours(random) : undefined,
      bookingRequired: randomBoolean(random, 0.3),
      bookingUrl: randomBoolean(random, 0.5) ? `https://mock-places.example.com/activities/mock-activity-${i}` : undefined,
      verificationStatus: 'unverified',
    });
  }

  return candidates;
}
