import type { RouteMatrixEntry, RouteMatrixRequest, RouteTransportMode } from '../types/provider.js';
import { haversineDistanceKm } from '../mocks/geo.js';
import type { RoutesProvider } from './routes.provider.js';

// Velocidades medias orientativas por modo, solo para el proveedor simulado.
const AVERAGE_SPEED_KMH: Record<RouteTransportMode, number> = {
  walking: 4.5,
  driving: 30,
  transit: 20,
};

const MIN_DURATION_MINUTES = 1;

// Sección 14.1: implementación simulada de RoutesProvider. La distancia sale de
// una fórmula geométrica pura (Haversine), no de PRNG: no hay nada que simular
// además de la geocodificación ya hecha por el proveedor de lugares.
export class MockRoutesProvider implements RoutesProvider {
  async calculateMatrix(request: RouteMatrixRequest): Promise<RouteMatrixEntry[]> {
    const mode = request.mode ?? 'walking';
    const speedKmh = AVERAGE_SPEED_KMH[mode];
    const entries: RouteMatrixEntry[] = [];

    for (const origin of request.origins) {
      for (const destination of request.destinations) {
        const distanceKm = haversineDistanceKm(origin, destination);
        const durationMinutes = Math.max(MIN_DURATION_MINUTES, Math.round((distanceKm / speedKmh) * 60));
        entries.push({
          originId: origin.id,
          destinationId: destination.id,
          distanceKm,
          durationMinutes,
          mode,
        });
      }
    }

    return entries;
  }
}
