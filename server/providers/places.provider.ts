import type { ActivityCandidate } from '../types/activity.ts';
import type { ActivitySearchRequest } from '../types/provider.ts';

// Sección 14.1: contrato común para el proveedor simulado y el real (Google
// Places). Sustituir la implementación no debe tocar el motor de puntuación.
export interface PlacesProvider {
  searchActivities(request: ActivitySearchRequest): Promise<ActivityCandidate[]>;
}
