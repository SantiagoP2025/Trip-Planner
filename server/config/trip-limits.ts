// Regla 5 de CLAUDE.md: los topes duros del esquema de entrada, en un solo
// sitio. Los usa el esquema de Zod en el servidor y también el formulario, que
// los necesita para sus `min`, `max` y sus textos de ayuda.
//
// Están aquí y no dentro del esquema para que no puedan separarse: un
// formulario que dice "máximo 30 noches" mientras el servidor acepta otra cosa
// es una discrepancia que nadie ve hasta que un usuario se topa con ella.
//
// Que el formulario valide lo mismo es un extra para la experiencia de usuario,
// nunca un sustituto: la validación que manda es la del servidor.

export const MIN_TEXT_LENGTH = 2;
export const MAX_TEXT_LENGTH = 100;
export const MAX_NIGHTS = 30;
export const MIN_ADULTS = 1;
export const MAX_ADULTS = 9;
export const MIN_CHILDREN = 0;
export const MAX_CHILDREN = 9;
export const MAX_BUDGET = 100_000;
export const MAX_DIETARY_RESTRICTIONS = 20;
export const MAX_WALKING_MINUTES_CAP = 240;
export const MAX_PREFERENCE_LEVEL = 3;

// Fase 8: el título de un viaje guardado es texto libre del usuario, así que
// lleva tope como cualquier otra entrada. El mismo número está repetido en la
// restricción `saved_trips_title_length` de la migración 0002.
export const MIN_SAVED_TRIP_TITLE_LENGTH = 1;
export const MAX_SAVED_TRIP_TITLE_LENGTH = 120;

// Tope de viajes guardados por usuario. No lo pide la especificación: lo pide la
// regla 5, que no admite entradas sin límite. Sin tope, una cuenta puede crecer
// sin fin y la consulta de la lista deja de estar acotada.
export const MAX_SAVED_TRIPS_PER_USER = 100;

// Fase 11: los textos con los que el usuario reescribe un bloque del itinerario.
// Los mismos números están repetidos en las restricciones de la migración 0003.
//
// Cuántas ediciones puede haber no necesita tope propio: solo se admite editar
// un elemento que exista en el itinerario, y el itinerario está acotado por la
// sección 12.1 (tres visitas al día) y por las 30 noches de la regla 5.
export const MAX_EDIT_TITLE_LENGTH = 120;
export const MAX_EDIT_DESCRIPTION_LENGTH = 500;
