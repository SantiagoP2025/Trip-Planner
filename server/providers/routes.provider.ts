import type { RouteMatrixEntry, RouteMatrixRequest } from '../types/provider.js';

// Sección 14.1: contrato común para el proveedor simulado y el real (Google
// Routes). Sustituir la implementación no debe tocar el motor de puntuación.
export interface RoutesProvider {
  calculateMatrix(request: RouteMatrixRequest): Promise<RouteMatrixEntry[]>;
}
