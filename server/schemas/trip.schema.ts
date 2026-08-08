import { z } from 'zod';
import type { PreferenceLevel } from '../types/common.ts';
import type { ValidationError } from '../types/trip.ts';

const MIN_TEXT_LENGTH = 2;
const MAX_TEXT_LENGTH = 100;
const MAX_NIGHTS = 30;
const MAX_ADULTS = 9;
const MAX_CHILDREN = 9;
const MAX_BUDGET = 100_000;
const MAX_DIETARY_RESTRICTIONS = 20;
const MAX_WALKING_MINUTES_CAP = 240;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function freeTextSchema(fieldLabel: string) {
  return z
    .string()
    .trim()
    .min(MIN_TEXT_LENGTH, `${fieldLabel} debe tener al menos ${MIN_TEXT_LENGTH} caracteres.`)
    .max(MAX_TEXT_LENGTH, `${fieldLabel} no puede superar los ${MAX_TEXT_LENGTH} caracteres.`);
}

// El `transform` no valida nada nuevo: el rango ya está comprobado arriba. Solo
// estrecha el tipo de salida a PreferenceLevel para que lo que sale del esquema
// encaje con PreferenceProfile sin necesidad de conversiones en la frontera HTTP.
const preferenceLevelSchema = z
  .number()
  .int()
  .min(0, 'La preferencia debe estar entre 0 y 3.')
  .max(3, 'La preferencia debe estar entre 0 y 3.')
  .transform((value) => value as PreferenceLevel);

const preferencesSchema = z.object({
  beach: preferenceLevelSchema,
  culture: preferenceLevelSchema,
  gastronomy: preferenceLevelSchema,
  nightlife: preferenceLevelSchema,
  nature: preferenceLevelSchema,
  shopping: preferenceLevelSchema,
  family: preferenceLevelSchema,
  relax: preferenceLevelSchema,
});

const constraintsSchema = z
  .object({
    reducedMobility: z.boolean(),
    dietaryRestrictions: z
      .array(freeTextSchema('Cada restricción alimentaria'))
      .max(MAX_DIETARY_RESTRICTIONS, `No se admiten más de ${MAX_DIETARY_RESTRICTIONS} restricciones alimentarias.`),
    earliestStartTime: z.string().regex(TIME_OF_DAY_PATTERN, 'La hora de inicio debe tener formato HH:MM.'),
    latestEndTime: z.string().regex(TIME_OF_DAY_PATTERN, 'La hora de fin debe tener formato HH:MM.'),
    maxWalkingMinutes: z
      .number()
      .int()
      .positive('Los minutos de caminata deben ser mayores que 0.')
      .max(MAX_WALKING_MINUTES_CAP, `Los minutos de caminata no pueden superar ${MAX_WALKING_MINUTES_CAP}.`),
    checkedBaggageRequired: z.boolean(),
  })
  .partial();

export const tripRequestSchema = z
  .object({
    origin: freeTextSchema('El origen'),
    destination: freeTextSchema('El destino'),
    departureDate: z.coerce.date({ message: 'La fecha de salida no es una fecha válida.' }),
    returnDate: z.coerce.date({ message: 'La fecha de regreso no es una fecha válida.' }),
    travelers: z.object({
      adults: z
        .number()
        .int()
        .min(1, 'Debe haber al menos un adulto.')
        .max(MAX_ADULTS, `No se admiten más de ${MAX_ADULTS} adultos.`),
      children: z
        .number()
        .int()
        .min(0, 'El número de menores no puede ser negativo.')
        .max(MAX_CHILDREN, `No se admiten más de ${MAX_CHILDREN} menores.`),
    }),
    budget: z
      .number()
      .positive('El presupuesto debe ser mayor que 0.')
      .max(MAX_BUDGET, `El presupuesto no puede superar ${MAX_BUDGET}.`),
    currency: z.enum(['EUR', 'USD', 'GBP'], { message: 'La moneda debe ser EUR, USD o GBP.' }),
    travelStyle: z.enum(['economical', 'balanced', 'comfort'], {
      message: 'El estilo de viaje debe ser economical, balanced o comfort.',
    }),
    preferences: preferencesSchema,
    constraints: constraintsSchema.optional(),
  })
  // Sección 5 de la especificación no fija este tope; lo añade la regla 5 de CLAUDE.md.
  .refine((data) => data.departureDate.getTime() >= startOfToday().getTime(), {
    path: ['departureDate'],
    message: 'La fecha de salida no puede ser anterior a hoy.',
  })
  .refine((data) => data.returnDate.getTime() > data.departureDate.getTime(), {
    path: ['returnDate'],
    message: 'La fecha de regreso debe ser posterior a la fecha de salida.',
  })
  .refine(
    (data) => {
      const nights = Math.round((data.returnDate.getTime() - data.departureDate.getTime()) / MS_PER_DAY);
      return nights <= MAX_NIGHTS;
    },
    {
      path: ['returnDate'],
      message: `La duración del viaje no puede superar las ${MAX_NIGHTS} noches.`,
    },
  );

export type TripRequestInput = z.infer<typeof tripRequestSchema>;

export type TripRequestValidationResult =
  | { success: true; data: TripRequestInput }
  | { success: false; errors: ValidationError[] };

export function validateTripRequest(input: unknown): TripRequestValidationResult {
  const result = tripRequestSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors: ValidationError[] = result.error.issues.map((issue) => ({
    field: issue.path.join('.') || '(raíz)',
    message: issue.message,
  }));
  return { success: false, errors };
}
