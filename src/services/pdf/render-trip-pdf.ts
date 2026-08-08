import { MAP_CANVAS } from '../map-projection.ts';
import { wrapPdfText, type MeasureText } from './pdf-text.ts';
import type { PdfBlock, TripPdfDocument } from './trip-document.ts';

// Fase 12: dibujar el documento.
//
// **La librería entra por `await import('pdf-lib')`, y solo aquí.** Es lo
// primero que pide la fase, y no es una preferencia de estilo: `pdf-lib` pesa
// más que todo el resto del frontend junto. Con la importación dinámica, Vite la
// deja en un fragmento aparte que el navegador solo descarga cuando alguien
// pulsa el botón de descargar; con una importación normal la descargaría todo el
// mundo al abrir la portada, para nada.
//
// `dynamic-import.test.ts` comprueba que sigue siendo así.
//
// Por qué no hay imágenes: no hay ninguna que incrustar. La fase pide
// recomprimir las fotos antes de meterlas y salir sin foto si la recompresión
// falla, pero eso venía de una versión que traía fotos de portada de un
// proveedor externo con la clave metida en el bundle (fallo A.8 de la
// auditoría). Aquí no hay proveedor de imágenes: lo único que se dibuja es el
// esquema del mapa, y es vectorial. Cuando haya fotos, el sitio donde meter la
// recompresión es este fichero.

const PAGE_WIDTH = 595.28; // A4 en puntos
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
// Debajo de esta altura empieza una página nueva. El hueco es para el pie.
const CONTENT_BOTTOM = MARGIN + 20;

// La columna de la hora en los bloques del día, igual que en la pantalla.
const TIME_COLUMN = 58;

const MAP_SIZE = 155;
// Lo que ocupa el pie del mapa. Se reserva junto con el recuadro para que no se
// queden en páginas distintas: un esquema sin su pie parece una ilustración de
// un sitio real, que es justo lo que el pie está ahí para desmentir.
const MAP_CAPTION_HEIGHT = 40;
const MAP_STOP_RADIUS = (30 / MAP_CANVAS) * MAP_SIZE;
const MAP_LABEL_SIZE = (34 / MAP_CANVAS) * MAP_SIZE;

// Tope duro de páginas. Los topes del documento hacen que no se alcance con
// datos normales; este está para que un fallo futuro se note como un PDF corto y
// no como una pestaña colgada.
const MAX_PAGES = 60;

const INK = { r: 0.11, g: 0.16, b: 0.23 }; // slate-900
const MUTED = { r: 0.39, g: 0.45, b: 0.55 }; // slate-500
// sky-700, y no sky-600, porque encima va el número de la parada en blanco: con
// sky-600 el contraste se queda en 4,1 y el mínimo para texto es 4,5.
const ACCENT = { r: 0.012, g: 0.412, b: 0.631 };
const LINE = { r: 0.89, g: 0.91, b: 0.94 }; // slate-200

interface BlockStyle {
  size: number;
  bold: boolean;
  color: { r: number; g: number; b: number };
  // Espacio antes del bloque y después de él, en puntos.
  before: number;
  after: number;
}

const STYLES: Record<Exclude<PdfBlock['kind'], 'pageBreak' | 'map'>, BlockStyle> = {
  title: { size: 20, bold: true, color: INK, before: 0, after: 4 },
  subtitle: { size: 12, bold: false, color: MUTED, before: 0, after: 8 },
  heading: { size: 13, bold: true, color: INK, before: 14, after: 4 },
  paragraph: { size: 10, bold: false, color: INK, before: 0, after: 3 },
  note: { size: 9, bold: false, color: MUTED, before: 0, after: 3 },
  bullet: { size: 10, bold: false, color: INK, before: 0, after: 3 },
  row: { size: 10, bold: false, color: INK, before: 0, after: 4 },
  item: { size: 10, bold: false, color: INK, before: 6, after: 2 },
};

const LINE_HEIGHT = 1.35;

export async function renderTripPdf(document: TripPdfDocument): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  pdf.setTitle(document.title);
  pdf.setCreator('Trip Planner');
  // Sin autor ni asunto: no hay por qué meter datos del usuario en los metadatos
  // de un fichero que va a circular (sección 8.2, "registrar errores sin
  // almacenar datos personales innecesarios", con el mismo criterio).

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursor = PAGE_HEIGHT - MARGIN;

  function newPage(): boolean {
    if (pdf.getPageCount() >= MAX_PAGES) return false;
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursor = PAGE_HEIGHT - MARGIN;
    return true;
  }

  // Reserva vertical: devuelve `false` cuando ya no caben más páginas, y
  // entonces quien llama deja de dibujar en vez de escribir fuera del papel.
  function reserve(height: number): boolean {
    if (cursor - height >= CONTENT_BOTTOM) return true;
    return newPage();
  }

  function measureWith(font: typeof regular, size: number): MeasureText {
    return (value) => font.widthOfTextAtSize(value, size);
  }

  function drawWrapped(
    value: string,
    style: BlockStyle,
    options: { indent?: number; width?: number; keepWithNext?: number } = {},
  ): boolean {
    const font = style.bold ? bold : regular;
    const indent = options.indent ?? 0;
    const width = options.width ?? CONTENT_WIDTH - indent;
    const lines = wrapPdfText(value, width, measureWith(font, style.size));
    const lineHeight = style.size * LINE_HEIGHT;

    cursor -= style.before;

    // Un título solo al final de una página no titula nada. Si no queda sitio
    // para él y para algo de lo que viene detrás, empieza la página nueva ya.
    if (options.keepWithNext !== undefined) {
      reserve(lineHeight * lines.length + options.keepWithNext);
    }

    for (const line of lines) {
      if (!reserve(lineHeight)) return false;
      cursor -= lineHeight;
      page.drawText(line, {
        x: MARGIN + indent,
        y: cursor,
        size: style.size,
        font,
        color: rgb(style.color.r, style.color.g, style.color.b),
      });
    }

    cursor -= style.after;
    return true;
  }

  function drawRow(block: Extract<PdfBlock, { kind: 'row' }>): boolean {
    const style = STYLES.row;
    const font = block.strong ? bold : regular;
    const lineHeight = style.size * LINE_HEIGHT;

    if (!reserve(lineHeight)) return false;
    cursor -= lineHeight;

    page.drawText(block.label, {
      x: MARGIN,
      y: cursor,
      size: style.size,
      font,
      color: rgb(MUTED.r, MUTED.g, MUTED.b),
    });

    // El importe pegado al margen derecho: es lo que hace que una columna de
    // cifras se pueda leer de un vistazo.
    const valueWidth = font.widthOfTextAtSize(block.value, style.size);
    page.drawText(block.value, {
      x: MARGIN + CONTENT_WIDTH - valueWidth,
      y: cursor,
      size: style.size,
      font,
      color: rgb(INK.r, INK.g, INK.b),
    });

    cursor -= style.after;
    return true;
  }

  function drawItem(block: Extract<PdfBlock, { kind: 'item' }>): boolean {
    const style = STYLES.item;
    const lineHeight = style.size * LINE_HEIGHT;
    const width = CONTENT_WIDTH - TIME_COLUMN;
    const lines = wrapPdfText(block.text, width, measureWith(bold, style.size));

    cursor -= style.before;
    // La hora y la primera línea del título tienen que ir juntas: si se parten
    // entre dos páginas, el bloque queda huérfano y no se sabe de qué hora es.
    if (!reserve(lineHeight * Math.min(lines.length, 2))) return false;

    let first = true;
    for (const line of lines) {
      if (!first && !reserve(lineHeight)) return false;
      cursor -= lineHeight;

      if (first) {
        page.drawText(block.time, {
          x: MARGIN,
          y: cursor,
          size: style.size,
          font: regular,
          color: rgb(MUTED.r, MUTED.g, MUTED.b),
        });
      }

      page.drawText(line, {
        x: MARGIN + TIME_COLUMN,
        y: cursor,
        size: style.size,
        font: bold,
        color: rgb(INK.r, INK.g, INK.b),
      });

      first = false;
    }

    if (block.badge) {
      const badgeSize = 8;
      if (!reserve(badgeSize * LINE_HEIGHT)) return false;
      cursor -= badgeSize * LINE_HEIGHT;
      page.drawText(block.badge, {
        x: MARGIN + TIME_COLUMN,
        y: cursor,
        size: badgeSize,
        font: bold,
        color: rgb(ACCENT.r, ACCENT.g, ACCENT.b),
      });
    }

    cursor -= style.after;
    return true;
  }

  // El mismo esquema que dibuja `DayMap` en pantalla, con las mismas
  // coordenadas proyectadas: paradas numeradas, unidas por una línea, sobre un
  // fondo que no pretende ser ningún sitio (regla 12 de PLAN-2.md).
  function drawMap(block: Extract<PdfBlock, { kind: 'map' }>): boolean {
    const captionStyle = STYLES.note;

    cursor -= 8;
    if (!reserve(MAP_SIZE + 6 + MAP_CAPTION_HEIGHT)) return false;

    const top = cursor;
    const bottom = top - MAP_SIZE;
    cursor = bottom - 6;

    page.drawRectangle({
      x: MARGIN,
      y: bottom,
      width: MAP_SIZE,
      height: MAP_SIZE,
      color: rgb(0.97, 0.98, 0.99),
      borderColor: rgb(LINE.r, LINE.g, LINE.b),
      borderWidth: 0.75,
    });

    // Del lienzo de la proyección al recuadro del PDF. La Y se invierte: en el
    // lienzo crece hacia abajo y en un PDF hacia arriba.
    const place = (stop: { x: number; y: number }) => ({
      x: MARGIN + (stop.x / MAP_CANVAS) * MAP_SIZE,
      y: bottom + MAP_SIZE - (stop.y / MAP_CANVAS) * MAP_SIZE,
    });

    for (let index = 1; index < block.stops.length; index += 1) {
      const from = block.stops[index - 1];
      const to = block.stops[index];
      if (!from || !to) continue;

      page.drawLine({
        start: place(from),
        end: place(to),
        thickness: 1.2,
        color: rgb(ACCENT.r, ACCENT.g, ACCENT.b),
        dashArray: [3, 2.5],
      });
    }

    for (const stop of block.stops) {
      const point = place(stop);
      page.drawCircle({
        x: point.x,
        y: point.y,
        size: MAP_STOP_RADIUS,
        color: rgb(ACCENT.r, ACCENT.g, ACCENT.b),
      });

      const label = String(stop.order);
      const labelWidth = bold.widthOfTextAtSize(label, MAP_LABEL_SIZE);
      page.drawText(label, {
        x: point.x - labelWidth / 2,
        // A ojo: baja el texto hasta que el número queda centrado en el círculo.
        y: point.y - MAP_LABEL_SIZE * 0.36,
        size: MAP_LABEL_SIZE,
        font: bold,
        color: rgb(1, 1, 1),
      });
    }

    // Decirlo también en el papel, no solo en la pantalla: quien lea el PDF sin
    // haber visto la aplicación tiene que saber que el fondo no es un mapa.
    return drawWrapped(block.caption, captionStyle, { width: MAP_SIZE + 60 });
  }

  for (const block of document.blocks) {
    if (block.kind === 'pageBreak') {
      if (!newPage()) break;
      continue;
    }

    const drawn =
      block.kind === 'row'
        ? drawRow(block)
        : block.kind === 'item'
          ? drawItem(block)
          : block.kind === 'map'
            ? drawMap(block)
            : drawWrapped(
                block.kind === 'bullet' ? `- ${block.text}` : block.text,
                STYLES[block.kind],
                block.kind === 'bullet' || block.kind === 'note'
                  ? { indent: 10 }
                  : // Un encabezado arrastra consigo tres líneas de lo que venga
                    // detrás; un título de sección, algo más.
                    block.kind === 'heading'
                    ? { keepWithNext: 36 }
                    : block.kind === 'title'
                      ? { keepWithNext: 60 }
                      : {},
              );

    // Se acabó el papel. Se cierra el documento con lo que hay, que es mejor que
    // devolver un error después de haber dibujado cincuenta páginas buenas.
    if (!drawn) break;
  }

  // El pie va al final, cuando ya se sabe cuántas páginas hay.
  const pages = pdf.getPages();
  pages.forEach((current, index) => {
    const label = `Trip Planner · Página ${index + 1} de ${pages.length}`;
    const width = regular.widthOfTextAtSize(label, 8);
    current.drawText(label, {
      x: (PAGE_WIDTH - width) / 2,
      y: MARGIN - 18,
      size: 8,
      font: regular,
      color: rgb(MUTED.r, MUTED.g, MUTED.b),
    });
  });

  const bytes = await pdf.save();
  // La librería declara la salida sobre `ArrayBufferLike`, que incluye
  // `SharedArrayBuffer`, y `Blob` no lo acepta. Nunca devuelve uno compartido:
  // la alternativa a la conversión sería copiar el PDF entero para nada.
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
