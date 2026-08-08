import type { PreferenceProfile, TravelPreference, TripRequest } from '../types/api.ts';

// La búsqueda entera viaja en la URL de `/results`.
//
// Es la decisión que sostiene la regla 1 de CLAUDE.md. La alternativa —pasar la
// respuesta del endpoint entre pantallas por `sessionStorage` o por el estado
// del router— es exactamente lo que hizo el proyecto de partida, y de ahí a que
// la pantalla de resultados se construya sus propios datos hay un paso.
//
// Con la búsqueda en la URL, `/results` solo sabe hacer una cosa: leer sus
// parámetros y pedirle las propuestas al endpoint. Refrescar funciona, compartir
// el enlace funciona, y no hay ningún sitio donde esconder datos paralelos.

const PREFERENCE_KEYS: readonly TravelPreference[] = [
  'beach',
  'culture',
  'gastronomy',
  'nightlife',
  'nature',
  'shopping',
  'family',
  'relax',
];

const PREFERENCE_PREFIX = 'pref.';

export function toSearchParams(request: TripRequest): URLSearchParams {
  const params = new URLSearchParams({
    origin: request.origin,
    destination: request.destination,
    departureDate: request.departureDate,
    returnDate: request.returnDate,
    adults: String(request.travelers.adults),
    children: String(request.travelers.children),
    budget: String(request.budget),
    currency: request.currency,
    travelStyle: request.travelStyle,
  });

  for (const key of PREFERENCE_KEYS) {
    params.set(`${PREFERENCE_PREFIX}${key}`, String(request.preferences[key]));
  }

  if (request.constraints?.checkedBaggageRequired) {
    params.set('checkedBaggage', '1');
  }

  return params;
}

// Un parámetro que falta o que no es un número se convierte en NaN a propósito,
// para que lo rechace la validación en vez de colarse como un 0 silencioso.
function readNumber(params: URLSearchParams, key: string): number {
  const raw = params.get(key);
  return raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
}

function readPreferences(params: URLSearchParams): PreferenceProfile {
  const preferences = {} as PreferenceProfile;

  for (const key of PREFERENCE_KEYS) {
    preferences[key] = readNumber(params, `${PREFERENCE_PREFIX}${key}`) as never;
  }

  return preferences;
}

// Devuelve un candidato sin tipar, no un TripRequest: lo que sale de una URL es
// texto que ha escrito cualquiera. Quien decide si es un viaje válido es la
// validación, la misma que usa el servidor.
export function fromSearchParams(params: URLSearchParams): unknown {
  return {
    origin: params.get('origin') ?? '',
    destination: params.get('destination') ?? '',
    departureDate: params.get('departureDate') ?? '',
    returnDate: params.get('returnDate') ?? '',
    travelers: {
      adults: readNumber(params, 'adults'),
      children: readNumber(params, 'children'),
    },
    budget: readNumber(params, 'budget'),
    currency: params.get('currency') ?? '',
    travelStyle: params.get('travelStyle') ?? '',
    preferences: readPreferences(params),
    ...(params.get('checkedBaggage') === '1'
      ? { constraints: { checkedBaggageRequired: true } }
      : {}),
  };
}
