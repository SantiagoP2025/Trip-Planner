import type { ActivityCandidate } from '../types/activity.js';
import type { ActivitySearchRequest } from '../types/provider.js';

// Sección 14.1: contrato común para el proveedor simulado y el real (Google
// Places). Sustituir la implementación no debe tocar el motor de puntuación.
export interface PlacesProvider {
  searchActivities(request: ActivitySearchRequest): Promise<ActivityCandidate[]>;
}
