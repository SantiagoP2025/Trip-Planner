import { requestJson, TripApiError } from './api-client.ts';
import type { GenerateTripResponseBody, TripRequest } from '../types/api.ts';

// Sección 19: `src/services/trip-api.client.ts`. La llamada al endpoint de
// generación, sobre el cliente común de `api-client.ts`.
//
// Regla 1 de CLAUDE.md: lo que devuelve esta función es lo que se pinta.

const GENERATE_ENDPOINT = '/api/trips/generate';

export { TripApiError };

export interface GenerateTripOptions {
  signal?: AbortSignal;
  // Fase 8: opcional a propósito. Generar un viaje no exige cuenta; el token
  // solo sirve para que la solicitud quede a nombre de su dueño y pueda
  // guardarse después.
  accessToken?: string | null;
}

export async function generateTrip(
  request: TripRequest,
  options: GenerateTripOptions = {},
): Promise<GenerateTripResponseBody> {
  return requestJson<GenerateTripResponseBody>(GENERATE_ENDPOINT, {
    method: 'POST',
    body: request,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.accessToken ? { accessToken: options.accessToken } : {}),
  });
}
