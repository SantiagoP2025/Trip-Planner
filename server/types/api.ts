import type { ItineraryEdit, SavedTrip } from './saved-trip.js';
import type { TripProposal, ValidationError } from './trip.js';

// Sección 16.1: códigos que devuelve la API. Cada uno se traduce a un estado
// HTTP de la tabla y a un mensaje en español sin detalles técnicos.
export type ApiErrorCode =
  | 'INVALID_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'SAVED_TRIPS_LIMIT'
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

// Fase 8. Respuestas de /api/trips/saved. Las tres llevan `requestId` por la
// misma razón que la de generación (sección 16.3): es el hilo que une lo que ve
// el usuario con lo que quedó registrado.
export interface SavedTripsResponseBody {
  requestId: string;
  savedTrips: SavedTrip[];
}

export interface SaveTripResponseBody {
  requestId: string;
  savedTrip: SavedTrip;
}

export interface DeleteSavedTripResponseBody {
  requestId: string;
  deletedId: string;
}

// Fase 11. `edit` viene a `null` cuando lo que se mandó no cambiaba nada
// respecto al original: la operación fue una vuelta al original, y el frontend
// tiene que quitar la marca de "editado" en vez de suponer que se guardó.
export interface ItineraryEditResponseBody {
  requestId: string;
  edit: ItineraryEdit | null;
}

export interface DeleteItineraryEditResponseBody {
  requestId: string;
  itemId: string;
}

// Fase 8. Configuración de ejecución que el navegador necesita para hablar con
// Supabase: la URL del proyecto y la clave anónima, que es pública y está
// protegida por las políticas Row Level Security de las migraciones.
//
// Aquí no aparece ni puede aparecer ninguna clave de servidor. Lo que decide qué
// sale por este endpoint es esta forma, y no un objeto de configuración
// completo del que alguien recorte campos más adelante.
export interface RuntimeConfigResponseBody {
  // `null` cuando no hay Supabase configurado: la aplicación genera viajes igual
  // y el frontend dice que las cuentas no están disponibles, en vez de enseñar
  // un formulario de acceso que no puede funcionar.
  supabase: { url: string; anonKey: string } | null;
}
