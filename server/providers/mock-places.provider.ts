import type { ActivityCandidate } from '../types/activity.js';
import type { ActivitySearchRequest } from '../types/provider.js';
import { generateActivityCandidates } from '../mocks/activities.mock.js';
import { createSeededRandom } from '../mocks/prng.js';
import type { PlacesProvider } from './places.provider.js';

function buildSeed(request: ActivitySearchRequest): string {
  return [request.destination, request.limit ?? ''].join('|');
}

// Sección 14.1: implementación simulada de PlacesProvider. La semilla depende
// solo de la búsqueda, así que la misma búsqueda siempre da la misma lista.
export class MockPlacesProvider implements PlacesProvider {
  async searchActivities(request: ActivitySearchRequest): Promise<ActivityCandidate[]> {
    const random = createSeededRandom(buildSeed(request));
    return generateActivityCandidates(request, random);
  }
}
