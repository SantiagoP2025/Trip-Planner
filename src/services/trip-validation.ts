import { validateTripRequest } from '../../server/schemas/trip.schema.ts';
import type { TripRequest, ValidationError } from '../types/api.ts';

// "Formulario con las mismas validaciones que el servidor" (fase 7 del plan).
//
// Las mismas de verdad: el formulario ejecuta el mismo esquema de Zod que
// ejecuta el endpoint, no una copia que se parece. Una copia se separa del
// original en cuanto alguien cambia un tope en un lado y olvida el otro, y el
// usuario se encuentra con un formulario que da por bueno lo que el servidor
// rechaza.
//
// Regla 5 de CLAUDE.md: esto es un extra para la experiencia de usuario, nunca
// un sustituto. El servidor vuelve a validar todo lo que le llega, siempre.

export type FieldErrors = Record<string, string>;

export type TripFormValidation =
  | { valid: true; request: TripRequest }
  | { valid: false; fieldErrors: FieldErrors };

// Zod devuelve un error por incidencia; el formulario necesita como mucho uno
// por campo, que es lo que cabe debajo de un input. Gana el primero, que es el
// más cercano a la causa.
export function toFieldErrors(errors: readonly ValidationError[]): FieldErrors {
  const fieldErrors: FieldErrors = {};

  for (const error of errors) {
    if (!(error.field in fieldErrors)) {
      fieldErrors[error.field] = error.message;
    }
  }

  return fieldErrors;
}

export function validateTripForm(candidate: unknown): TripFormValidation {
  const result = validateTripRequest(candidate);

  if (!result.success) {
    return { valid: false, fieldErrors: toFieldErrors(result.errors) };
  }

  // El esquema convierte las fechas a `Date` para poder compararlas. El contrato
  // que viaja por HTTP las lleva como texto, igual que hace el endpoint en el
  // servidor.
  return {
    valid: true,
    request: {
      ...result.data,
      departureDate: result.data.departureDate.toISOString().slice(0, 10),
      returnDate: result.data.returnDate.toISOString().slice(0, 10),
    },
  };
}
