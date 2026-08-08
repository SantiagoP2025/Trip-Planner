import type { ItineraryItemType, ProposalType } from '../types/api.ts';

// Los nombres en español de lo que devuelve el servidor, en un solo sitio.
//
// Están aquí, y no dentro del componente que los enseña, porque desde la fase 12
// hay dos superficies que pintan lo mismo: la pantalla y el PDF. Duplicarlos
// significaría que dentro de tres meses el PDF llame "Comida" a lo que la
// pantalla llama otra cosa, y nadie se dé cuenta.
//
// Regla 1 de CLAUDE.md: traducir un valor del servidor a su nombre en español no
// es generar datos. La lista de tipos la fija el servidor (sección 12.2) y estos
// `Record` completos hacen que añadir uno allí rompa la compilación aquí.

// Sección 10.3: las tres propuestas que devuelve el motor.
export const PROPOSAL_TYPE_LABELS: Record<ProposalType, string> = {
  economical: 'La más económica',
  recommended: 'La recomendada',
  comfort: 'La más cómoda',
};

// Sección 12.2: tipos de bloque del itinerario.
export const ITINERARY_TYPE_LABELS: Record<ItineraryItemType, string> = {
  arrival: 'Llegada',
  transfer: 'Traslado',
  hotel: 'Alojamiento',
  meal: 'Comida',
  visit: 'Visita',
  walk: 'Paseo',
  free_time: 'Tiempo libre',
};

// Sección 9: las partidas del desglose, en el orden en que se enseñan. La lista
// está aquí por el mismo motivo que las etiquetas: la pantalla y el PDF tienen
// que enseñar las mismas partidas, y las siete que hay son las que suman el
// total. Dejarse una fuera es lo que hace que un desglose impreso no cuadre.
export const BUDGET_LINE_LABELS = [
  ['mainTransportCost', 'Transporte principal'],
  ['accommodationCost', 'Alojamiento'],
  ['foodBudget', 'Comidas'],
  ['activityCost', 'Actividades'],
  ['localTransportCost', 'Transporte local'],
  ['insuranceCost', 'Seguro de viaje'],
  ['emergencyReserve', 'Imprevistos'],
] as const;
