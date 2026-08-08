import { PROPOSAL_TYPE_LABELS } from '../services/labels.ts';
import type { ProposalType } from '../types/api.ts';

// Fase 14: el color de cada nivel de propuesta, en un solo sitio.
//
// Existe para que ninguna pantalla invente su propio tono. Antes de esto la
// tarjeta elegía uno y las pestañas del itinerario otro, así que la misma
// propuesta salía verde arriba y azul abajo, y cada componente nuevo empezaba
// otra vez a decidir. Aquí se decide una vez.
//
// El nombre en español no se repite: sale de `labels.ts`, que sigue siendo el
// único sitio donde vive el texto de cara al usuario.

export interface ProposalTheme {
  label: string;
  /** Color del texto sobre el fondo claro de la página. */
  text: string;
  /** Fondo tenue, para secciones enteras. */
  softBg: string;
  /** Fondo sólido **con su color de texto**: los dos juntos porque separados
   *  es como sale un amber-500 con texto blanco, que no llega ni a 2,5 de
   *  contraste. Regla 18: aquí no se regresa en accesibilidad. */
  solidBg: string;
  border: string;
  badge: string;
  tabActive: string;
  accentText: string;
}

export const PROPOSAL_THEMES: Record<ProposalType, ProposalTheme> = {
  economical: {
    label: PROPOSAL_TYPE_LABELS.economical,
    text: 'text-emerald-700',
    softBg: 'bg-emerald-50',
    solidBg: 'bg-emerald-700 text-white',
    border: 'border-emerald-500',
    badge: 'bg-emerald-100 text-emerald-800',
    tabActive: 'bg-emerald-700 text-white',
    accentText: 'text-emerald-800',
  },
  recommended: {
    label: PROPOSAL_TYPE_LABELS.recommended,
    text: 'text-indigo-700',
    softBg: 'bg-indigo-50',
    solidBg: 'bg-indigo-600 text-white',
    border: 'border-indigo-500',
    badge: 'bg-indigo-100 text-indigo-800',
    tabActive: 'bg-indigo-600 text-white',
    accentText: 'text-indigo-800',
  },
  comfort: {
    label: PROPOSAL_TYPE_LABELS.comfort,
    // amber-800 y no amber-700: sobre el crema de `sunset-50` el 700 se queda
    // en 4,4 y el mínimo para texto normal es 4,5.
    text: 'text-amber-800',
    softBg: 'bg-amber-50',
    solidBg: 'bg-amber-500 text-ink-900',
    border: 'border-amber-500',
    badge: 'bg-amber-100 text-amber-800',
    tabActive: 'bg-amber-500 text-ink-900',
    accentText: 'text-amber-800',
  },
};
