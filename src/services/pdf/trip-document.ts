import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDuration,
  formatStops,
  formatTime,
} from '../format.ts';
import { BUDGET_LINE_LABELS, ITINERARY_TYPE_LABELS, PROPOSAL_TYPE_LABELS } from '../labels.ts';
import { projectStops, type MapStop } from '../map-projection.ts';
import { sanitizePdfText, truncatePdfText } from './pdf-text.ts';
import type { FlightSegment, ItineraryEdit, TripProposal } from '../../types/api.ts';

// Fase 12: qué lleva dentro el PDF de una propuesta.
//
// Este módulo no sabe nada de PDF. Convierte la propuesta que devolvió el
// servidor en una lista de bloques —títulos, párrafos, filas, mapas— y ahí
// termina. Dibujarlos es cosa de `render-trip-pdf.ts`, que es el único fichero
// que toca la librería.
//
// Están separados por dos motivos. El primero es que así el contenido del
// documento se prueba entero sin abrir un PDF ni medir una fuente. El segundo es
// que la librería se carga con `import()` dinámico y solo al pulsar el botón: si
// esto la conociera, entraría en el bundle principal por la puerta de atrás.
//
// Regla 1 de CLAUDE.md: aquí no se genera nada. Se elige qué campos de la
// propuesta se imprimen y en qué orden, exactamente igual que hace la pantalla.
// Ni un precio, ni una hora, ni una parada salen de aquí.

export type PdfBlock =
  | { kind: 'title'; text: string }
  | { kind: 'subtitle'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'bullet'; text: string }
  // Dos columnas, el importe alineado a la derecha.
  | { kind: 'row'; label: string; value: string; strong?: boolean }
  // Un bloque del día: la hora a la izquierda, como en la pantalla.
  | { kind: 'item'; time: string; text: string; badge?: string }
  | { kind: 'map'; stops: MapStop[]; caption: string }
  | { kind: 'pageBreak' };

export interface TripPdfDocument {
  fileName: string;
  title: string;
  blocks: PdfBlock[];
}

// De qué viaje es la propuesta. La pantalla de resultados lo saca de la
// solicitud y la de viajes guardados del viaje guardado, que no almacena
// viajeros: por eso son opcionales.
export interface PdfTripSummary {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  travelers?: { adults: number; children: number };
  // El que puso el usuario al guardar el viaje, si lo hay.
  title?: string;
}

// Topes de este lado (sección 8.2: "validar tamaño y contenido"). Los textos que
// escribe el usuario ya vienen acotados por el servidor y la duración del viaje
// por la regla 5, pero el PDF se dibuja línea a línea: si algún día llega una
// propuesta más grande de lo previsto, aquí se corta en vez de colgar la pestaña
// del navegador. Son topes de seguridad, no de presentación: con datos normales
// no se alcanza ninguno.
const MAX_TEXT_LENGTH = 500;
const MAX_BULLETS = 15;
const MAX_DAYS = 40;
const MAX_ITEMS_PER_DAY = 40;

// Todo texto que entra en un bloque pasa por aquí: saneado para la fuente del
// PDF y acotado. Así el que dibuja no tiene que volver a comprobar nada.
function text(value: string, maxLength = MAX_TEXT_LENGTH): string {
  return truncatePdfText(sanitizePdfText(value).trim(), maxLength);
}

// Nombre de fichero: solo minúsculas, dígitos y guiones. El origen y el destino
// los escribe el usuario (hasta 100 caracteres de texto libre), y eso acaba en
// el atributo `download` de un enlace: barras, puntos y espacios fuera.
function slug(value: string): string {
  return value
    .normalize('NFD')
    // Los acentos que `NFD` acaba de separar de su letra.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function buildFileName(summary: PdfTripSummary): string {
  const parts = [
    'viaje',
    slug(summary.origin),
    slug(summary.destination),
    slug(summary.departureDate.slice(0, 10)),
  ].filter((part) => part.length > 0);

  return `${parts.join('-')}.pdf`;
}

function describeTravelers(travelers: { adults: number; children: number }): string {
  const adults = `${travelers.adults} ${travelers.adults === 1 ? 'adulto' : 'adultos'}`;
  if (travelers.children === 0) return adults;

  const children = `${travelers.children} ${travelers.children === 1 ? 'menor' : 'menores'}`;
  return `${adults} y ${children}`;
}

function describeLeg(segments: FlightSegment[]): string | null {
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) return null;

  return (
    `${first.origin} ${formatDateTime(first.departureTime)} → ` +
    `${last.destination} ${formatDateTime(last.arrivalTime)} · ` +
    `${first.carrier} · ${formatStops(segments.length - 1)}`
  );
}

export function buildTripPdfDocument({
  summary,
  proposal,
  edits = [],
  // Se pasa desde fuera para que el documento sea el mismo en cada ejecución del
  // test. En producción lo pone el botón, con la hora del navegador.
  generatedAt = new Date(),
}: {
  summary: PdfTripSummary;
  proposal: TripProposal;
  edits?: readonly ItineraryEdit[];
  generatedAt?: Date;
}): TripPdfDocument {
  const blocks: PdfBlock[] = [];
  const { flight, accommodation, budget } = proposal;

  // La raya, y no la flecha que usa la pantalla: la fuente estándar de un PDF no
  // tiene flecha, y "Valencia -> Lisboa" en cuerpo veinte queda a medio camino
  // entre un titular y una línea de consola.
  const title = text(summary.title ?? `${summary.origin} – ${summary.destination}`, 120);

  blocks.push({ kind: 'title', text: title });
  blocks.push({
    kind: 'subtitle',
    text: text(`${formatDate(summary.departureDate)} — ${formatDate(summary.returnDate)}`),
  });

  if (summary.travelers) {
    blocks.push({ kind: 'paragraph', text: text(describeTravelers(summary.travelers)) });
  }

  blocks.push({ kind: 'heading', text: text(PROPOSAL_TYPE_LABELS[proposal.type]) });
  blocks.push({
    kind: 'row',
    label: 'Precio total estimado',
    value: text(formatCurrency(proposal.estimatedTotal, proposal.currency)),
    strong: true,
  });
  blocks.push({
    kind: 'note',
    text: text(`Puntuación ${Math.round(proposal.score)} sobre 100`),
  });

  blocks.push({ kind: 'heading', text: 'Vuelo' });
  const outbound = describeLeg(flight.outbound);
  if (outbound) blocks.push({ kind: 'paragraph', text: text(`Ida: ${outbound}`) });
  const inbound = flight.inbound ? describeLeg(flight.inbound) : null;
  if (inbound) blocks.push({ kind: 'paragraph', text: text(`Vuelta: ${inbound}`) });
  blocks.push({
    kind: 'paragraph',
    text: text(
      `${formatDuration(flight.totalDurationMinutes)} en total · ` +
        `${flight.baggageIncluded ? 'Maleta incluida' : 'Sin maleta facturada'}`,
    ),
  });
  blocks.push({
    kind: 'row',
    label: 'Vuelo',
    value: text(formatCurrency(flight.totalPrice, flight.currency)),
  });

  blocks.push({ kind: 'heading', text: 'Alojamiento' });
  blocks.push({ kind: 'paragraph', text: text(accommodation.name, 120) });
  if (accommodation.rating !== undefined) {
    blocks.push({
      kind: 'paragraph',
      text: text(
        `${accommodation.rating.toFixed(1)} sobre 10` +
          (accommodation.reviewCount !== undefined
            ? ` · ${accommodation.reviewCount} opiniones`
            : ''),
      ),
    });
  }
  if (accommodation.distanceToCenterKm !== undefined) {
    blocks.push({
      kind: 'paragraph',
      text: text(`A ${accommodation.distanceToCenterKm.toFixed(1)} km del centro`),
    });
  }
  blocks.push({
    kind: 'row',
    label: 'Alojamiento',
    value: text(formatCurrency(accommodation.totalPrice, accommodation.currency)),
  });

  // Sección 9: el desglose. Las siete partidas, que son las que suman el total:
  // un desglose impreso que no cuadra es peor que no imprimirlo.
  blocks.push({ kind: 'heading', text: 'Desglose del gasto' });
  for (const [key, label] of BUDGET_LINE_LABELS) {
    blocks.push({
      kind: 'row',
      label,
      value: text(formatCurrency(budget[key], budget.currency)),
    });
  }
  blocks.push({
    kind: 'row',
    label: 'Total',
    value: text(formatCurrency(budget.totalTripCost, budget.currency)),
    strong: true,
  });

  // Sección 10.7: por qué se ha elegido esta propuesta.
  if (proposal.reasons.length > 0) {
    blocks.push({ kind: 'heading', text: 'Por qué esta propuesta' });
    for (const reason of proposal.reasons.slice(0, MAX_BULLETS)) {
      blocks.push({ kind: 'bullet', text: text(reason) });
    }
  }

  if (proposal.warnings.length > 0) {
    blocks.push({ kind: 'heading', text: 'A tener en cuenta' });
    for (const warning of proposal.warnings.slice(0, MAX_BULLETS)) {
      blocks.push({ kind: 'bullet', text: text(warning) });
    }
  }

  // Sección 12: el día a día. Empieza en página nueva porque es la parte que se
  // lleva encima quien viaja, y porque el resumen de arriba cabe justo en una.
  if (proposal.itinerary.length > 0) {
    blocks.push({ kind: 'pageBreak' });
    blocks.push({ kind: 'title', text: 'Día a día' });

    // Regla 6 de CLAUDE.md: las ediciones se indexan una vez, fuera del bucle
    // que recorre los bloques del itinerario.
    const editsByItemId = new Map(edits.map((edit) => [edit.itemId, edit]));

    proposal.itinerary.slice(0, MAX_DAYS).forEach((day, index) => {
      blocks.push({ kind: 'heading', text: text(`Día ${index + 1} — ${formatDate(day.date)}`) });

      // El mismo esquema que la pantalla, con las mismas coordenadas del
      // proveedor de lugares. Va justo debajo del título del día, y no al final
      // como en pantalla, porque en papel no hay desplazamiento que valga: si
      // fuera detrás de la lista acabaría solo al principio de la página
      // siguiente, sin nada que dijera de qué día es.
      //
      // Un día sin paradas con coordenadas no lleva mapa: un recuadro vacío no
      // informa de nada (regla 12, y el fallo B.3 de la auditoría).
      const stops = projectStops(day.items);
      if (stops.length > 0) {
        blocks.push({
          kind: 'map',
          stops,
          caption:
            'Esquema de las paradas del día: enseña el orden y la posición de unas ' +
            'respecto a otras, no su ubicación sobre un mapa real.',
        });
      }

      if (day.items.length === 0) {
        blocks.push({ kind: 'paragraph', text: 'Día libre, sin nada programado.' });
        return;
      }

      for (const item of day.items.slice(0, MAX_ITEMS_PER_DAY)) {
        const edit = editsByItemId.get(item.id);
        // Lo que se imprime es lo que el usuario está viendo: su texto cuando lo
        // ha reescrito, el original cuando no. Elegir entre dos textos que manda
        // el servidor no es generar datos.
        const itemTitle = edit?.title ?? item.title;

        blocks.push({
          kind: 'item',
          time: text(`${formatTime(item.startTime)}–${formatTime(item.endTime)}`, 20),
          text: text(`${ITINERARY_TYPE_LABELS[item.type]}: ${itemTitle}`, 160),
          // Se distingue lo editado de lo original también en papel, donde no
          // hay color ni cursiva que valga.
          badge: edit ? 'Editado por ti' : undefined,
        });

        const details = [
          formatDuration(item.durationMinutes),
          item.travelMinutesFromPrevious !== undefined && item.travelMinutesFromPrevious > 0
            ? `${formatDuration(item.travelMinutesFromPrevious)} para llegar`
            : null,
          item.costPerPerson !== undefined && item.costPerPerson > 0
            ? `${formatCurrency(item.costPerPerson, proposal.currency)} por persona`
            : null,
          item.bookingRequired ? 'Requiere reserva previa' : null,
        ].filter((detail): detail is string => detail !== null);

        blocks.push({ kind: 'note', text: text(details.join(' · ')) });

        if (edit?.description !== undefined) {
          blocks.push({ kind: 'note', text: text(edit.description) });
        }

        // Sección 12.1: "Marcar datos no verificados". Lo estimado se dice,
        // también aquí: en papel es donde más se parece a una promesa.
        if (item.verificationStatus !== 'verified') {
          blocks.push({
            kind: 'note',
            text: text(item.notes?.join(' ') ?? 'Horario estimado, pendiente de confirmar.'),
          });
        }
      }

    });
  }

  blocks.push({
    kind: 'note',
    text: text(
      `Documento generado el ${formatDate(generatedAt.toISOString())}. ` +
        'Los precios y los horarios son estimaciones: confírmalos con cada proveedor ' +
        'antes de reservar.',
    ),
  });

  return { fileName: buildFileName(summary), title, blocks };
}
