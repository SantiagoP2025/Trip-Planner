import { z } from 'zod';
import {
  MAX_EDIT_DESCRIPTION_LENGTH,
  MAX_EDIT_TITLE_LENGTH,
} from '../config/trip-limits.js';
import type { SchemaValidationResult } from './saved-trip.schema.js';
import { toValidationResult } from './saved-trip.schema.js';

// Regla 5 de CLAUDE.md: toda entrada del usuario pasa por Zod en el servidor,
// con límites explícitos por campo. Estos textos son de los pocos sitios de la
// aplicación donde el usuario escribe libremente, así que con más motivo.
//
// El identificador del elemento no se valida contra un formato: lo compone el
// planificador (`2026-09-11-visit-mock-activity-3`) y su forma puede cambiar.
// Lo que sí se comprueba, y es lo que de verdad importa, es que ese elemento
// exista en el itinerario del viaje; eso lo hace el handler contra la propuesta
// guardada, no un patrón aquí.

const uuidSchema = z.uuid('El identificador no tiene el formato esperado.');

const itemIdSchema = z
  .string()
  .trim()
  .min(1, 'Falta el bloque del itinerario que quieres editar.')
  .max(200, 'El identificador del bloque no tiene el formato esperado.');

export const itineraryEditSchema = z.object({
  savedTripId: uuidSchema,
  itemId: itemIdSchema,
  // Opcionales por separado: el usuario puede reescribir solo la descripción y
  // dejar el título como estaba. Un campo ausente es "esto no lo he tocado".
  title: z
    .string()
    .max(
      MAX_EDIT_TITLE_LENGTH,
      `El título no puede superar los ${MAX_EDIT_TITLE_LENGTH} caracteres.`,
    )
    .optional(),
  description: z
    .string()
    .max(
      MAX_EDIT_DESCRIPTION_LENGTH,
      `La descripción no puede superar los ${MAX_EDIT_DESCRIPTION_LENGTH} caracteres.`,
    )
    .optional(),
});

export type ItineraryEditInput = z.infer<typeof itineraryEditSchema>;

export const deleteItineraryEditSchema = z.object({
  savedTripId: uuidSchema,
  itemId: itemIdSchema,
});

export type DeleteItineraryEditInput = z.infer<typeof deleteItineraryEditSchema>;

export function validateItineraryEdit(
  input: unknown,
): SchemaValidationResult<ItineraryEditInput> {
  return toValidationResult(itineraryEditSchema.safeParse(input));
}

export function validateDeleteItineraryEdit(
  input: unknown,
): SchemaValidationResult<DeleteItineraryEditInput> {
  return toValidationResult(deleteItineraryEditSchema.safeParse(input));
}
