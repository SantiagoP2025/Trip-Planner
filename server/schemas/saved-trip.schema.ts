import { z } from 'zod';
import {
  MAX_SAVED_TRIP_TITLE_LENGTH,
  MIN_SAVED_TRIP_TITLE_LENGTH,
} from '../config/trip-limits.js';
import type { ValidationError } from '../types/trip.js';

// Regla 5 de CLAUDE.md: toda entrada del usuario pasa por Zod en el servidor,
// con límites explícitos por campo. También cuando el cuerpo son tres campos.
//
// Sección 8.2, "No confiar en cálculos enviados por el frontend": aquí no entra
// ni un precio, ni una puntuación, ni una propuesta. El navegador dice de qué
// solicitud y cuál de las tres propuestas, y el servidor va a buscarlas a la
// base de datos tal como las calculó él mismo.

// Los identificadores los genera Postgres con `gen_random_uuid()`. Comprobar el
// formato aquí evita mandar a la base de datos cualquier texto que llegue.
const uuidSchema = z.uuid('El identificador no tiene el formato esperado.');

export const saveTripSchema = z.object({
  tripId: uuidSchema,
  proposalType: z.enum(['economical', 'recommended', 'comfort'], {
    message: 'El tipo de propuesta debe ser economical, recommended o comfort.',
  }),
  // Opcional: si el usuario no escribe título, lo compone el servidor con el
  // origen y el destino.
  title: z
    .string()
    .trim()
    .min(MIN_SAVED_TRIP_TITLE_LENGTH, 'El título no puede estar vacío.')
    .max(
      MAX_SAVED_TRIP_TITLE_LENGTH,
      `El título no puede superar los ${MAX_SAVED_TRIP_TITLE_LENGTH} caracteres.`,
    )
    .optional(),
});

export type SaveTripInput = z.infer<typeof saveTripSchema>;

export const deleteSavedTripSchema = z.object({
  id: uuidSchema,
});

export type SchemaValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ValidationError[] };

// Mismo formato de error que `validateTripRequest`: un `ValidationError` por
// incidencia, con la ruta del campo en español (sección 16.1). Compartido con
// los demás esquemas para que todos los endpoints contesten igual.
export function toValidationResult<T>(
  result: { success: true; data: T } | { success: false; error: z.ZodError },
): SchemaValidationResult<T> {
  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '(raíz)',
      message: issue.message,
    })),
  };
}

export function validateSaveTrip(input: unknown): SchemaValidationResult<SaveTripInput> {
  return toValidationResult(saveTripSchema.safeParse(input));
}

export function validateDeleteSavedTrip(
  input: unknown,
): SchemaValidationResult<{ id: string }> {
  return toValidationResult(deleteSavedTripSchema.safeParse(input));
}
