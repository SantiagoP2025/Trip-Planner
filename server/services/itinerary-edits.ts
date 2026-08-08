import type { ItineraryDay, ItineraryItem } from '../types/itinerary.js';
import type { ItineraryEdit } from '../types/saved-trip.js';

// Fase 11: qué cuenta como edición y qué no.
//
// Funciones puras, sin dependencias de la base de datos ni del transporte. Es
// donde vive la única regla no evidente de esta fase —"una edición vacía o
// idéntica al original no cuenta como edición"— y por eso se puede comprobar
// sin levantar nada.
//
// El original nunca se toca. Lo que el motor calculó sigue en el JSONB de
// `trip_proposals`; una edición es una capa encima, y eso es lo que permite
// distinguir lo editado de lo original y volver atrás sin haber perdido nada.

export interface EditableFields {
  title?: string;
  description?: string;
}

// El texto vacío y el texto que solo son espacios significan lo mismo: "aquí no
// he escrito nada". Se normalizan a `undefined` para que el resto del código no
// tenga que distinguir entre tres formas de decir lo mismo.
function normalizeText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeEdit(fields: EditableFields): EditableFields {
  const title = normalizeText(fields.title);
  const description = normalizeText(fields.description);

  return {
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
  };
}

// Una edición cuenta cuando cambia algo de verdad.
//
// Sin esta comprobación, abrir el formulario y darle a guardar sin tocar nada
// dejaría el bloque marcado como "editado por ti" para siempre, y el botón de
// volver al original haría lo mismo que no hacer nada. El usuario no sabría
// qué ha cambiado él y qué venía de fábrica, que es justo lo que la fase pide
// que se distinga.
export function isMeaningfulEdit(original: ItineraryItem, fields: EditableFields): boolean {
  const edit = normalizeEdit(fields);

  // Nada escrito: no hay edición, hay una vuelta al original.
  if (edit.title === undefined && edit.description === undefined) return false;

  const titleChanged = edit.title !== undefined && edit.title !== original.title;
  const descriptionChanged =
    edit.description !== undefined && edit.description !== original.description;

  return titleChanged || descriptionChanged;
}

// Deja fuera lo que coincide con el original aunque el resto sí cambie: si el
// usuario reescribe la descripción y deja el título igual, se guarda solo la
// descripción. Guardar el título idéntico lo marcaría como editado sin serlo.
export function toStoredEdit(
  original: ItineraryItem,
  fields: EditableFields,
): EditableFields | null {
  const edit = normalizeEdit(fields);

  const title = edit.title !== undefined && edit.title !== original.title ? edit.title : undefined;
  const description =
    edit.description !== undefined && edit.description !== original.description
      ? edit.description
      : undefined;

  if (title === undefined && description === undefined) return null;

  return {
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
  };
}

// Busca el elemento original dentro del itinerario. Que el identificador exista
// es lo que acota cuántas ediciones puede haber: no se admite editar un bloque
// que el motor no ha generado.
export function findItineraryItem(
  days: readonly ItineraryDay[],
  itemId: string,
): ItineraryItem | null {
  for (const day of days) {
    for (const item of day.items) {
      if (item.id === itemId) return item;
    }
  }

  return null;
}

// Indexa las ediciones por elemento. Regla 6 de CLAUDE.md: se hace una vez, y no
// dentro del bucle que pinta cada bloque del día.
export function indexEditsByItemId(
  edits: readonly ItineraryEdit[],
): Map<string, ItineraryEdit> {
  return new Map(edits.map((edit) => [edit.itemId, edit]));
}
