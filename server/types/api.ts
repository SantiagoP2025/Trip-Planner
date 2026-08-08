import type { TripProposal, ValidationError } from './trip.ts';

// Sección 16.1: códigos que devuelve la API. Cada uno se traduce a un estado
// HTTP de la tabla y a un mensaje en español sin detalles técnicos.
export type ApiErrorCode =
  | 'INVALID_REQUEST'
  | 'VALIDATION_ERROR'
  | 'METHOD_NOT_ALLOWED'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'INTERNAL_ERROR';

// Sección 16.3: "Devolver mensajes seguros al usuario y detalles técnicos solo
// en logs". `requestId` es el hilo que une lo que ve el usuario con lo que se
// registró; `details` solo lleva errores de validación de campos, que son datos
// que el propio usuario acaba de escribir.
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    details?: ValidationError[];
  };
}

// Respuesta de POST /api/trips/generate. No incluye el diagnóstico completo del
// motor: la sección 16.3 lo trata como material de log, no de respuesta.
export interface GenerateTripResponseBody {
  requestId: string;
  generatedAt: string;
  proposals: TripProposal[];
  // Identificador de la fila de `trip_requests` (sección 13.1). Solo viene
  // cuando el viaje se ha llegado a guardar: la persistencia es best-effort, así
  // que su ausencia significa que no hay nada que recuperar después, no un error.
  tripId?: string;
  // Presente solo cuando no hay ninguna propuesta viable, que es un resultado
  // legítimo y no un error.
  message?: string;
}

// Sección 7.1: forma exacta de la respuesta del endpoint de salud.
export interface HealthResponseBody {
  status: 'ok';
  service: string;
  timestamp: string;
}
