import { describe, expect, it } from 'vitest';
import { renderTripPdf } from './render-trip-pdf.ts';
import { buildProposal, SUMMARY } from './test-fixtures.ts';
import { buildTripPdfDocument } from './trip-document.ts';

// El renderizado se prueba abriendo el PDF que sale y comprobando que un lector
// —la propia librería— puede leerlo. Un fichero que no se abre es exactamente lo
// que el usuario se encontraría, y no lo detectaría ningún test de bloques.

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('renderTripPdf', () => {
  it('devuelve un PDF que se puede volver a abrir', async () => {
    const documento = buildTripPdfDocument({ summary: SUMMARY, proposal: buildProposal() });
    const blob = await renderTripPdf(documento);

    expect(blob.type).toBe('application/pdf');

    const bytes = await bytesOf(blob);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');

    const { PDFDocument } = await import('pdf-lib');
    const leido = await PDFDocument.load(bytes);

    // El resumen y el día a día, que empieza en página nueva.
    expect(leido.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(leido.getTitle()).toBe('Valencia – Lisboa');
  });

  // El motivo de que exista `sanitizePdfText`: la fuente estándar de un PDF
  // codifica en WinAnsi y `drawText` lanza con cualquier cosa que no quepa. Sin
  // el saneado, un emoji en una nota tiraría la descarga entera.
  it('no se rompe con lo que el usuario haya escrito', async () => {
    const documento = buildTripPdfDocument({
      summary: { ...SUMMARY, origin: 'A Coruña', destination: '東京' },
      proposal: buildProposal({
        reasons: ['Precio y comodidad 👌', 'Cerca de todo — de verdad'],
      }),
      edits: [
        {
          itemId: 'dia2-museo',
          title: 'Museo 🎨',
          description: 'Nota larga.\nCon dos párrafos y una dirección https://ejemplo.example/una/ruta/muy/larga/que/no/cabe/en/una/linea',
          updatedAt: '2026-08-08T08:00:00.000Z',
        },
      ],
    });

    const blob = await renderTripPdf(documento);

    expect((await bytesOf(blob)).length).toBeGreaterThan(0);
  });

  it('un viaje largo cabe en varias páginas y no se desborda', async () => {
    const dias = Array.from({ length: 25 }, (_, index) => ({
      date: `2026-09-${String(index + 1).padStart(2, '0')}`,
      items: [
        {
          id: `dia${index}-visita`,
          startTime: `2026-09-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
          endTime: `2026-09-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
          type: 'visit' as const,
          title: 'Una visita con un nombre razonablemente largo para llenar la línea',
          latitude: 38.7 + index * 0.001,
          longitude: -9.13 - index * 0.001,
          durationMinutes: 120,
          verificationStatus: 'partial' as const,
        },
      ],
    }));

    const documento = buildTripPdfDocument({
      summary: SUMMARY,
      proposal: buildProposal({ itinerary: dias }),
    });
    const blob = await renderTripPdf(documento);

    const { PDFDocument } = await import('pdf-lib');
    const leido = await PDFDocument.load(await bytesOf(blob));

    expect(leido.getPageCount()).toBeGreaterThan(2);
    // Tope duro: si algún día un fallo hace crecer el documento sin control, se
    // nota como un PDF corto y no como una pestaña colgada.
    expect(leido.getPageCount()).toBeLessThanOrEqual(60);
  });

  it('una propuesta sin itinerario sigue dando un PDF de una página', async () => {
    const documento = buildTripPdfDocument({
      summary: SUMMARY,
      proposal: buildProposal({ itinerary: [], reasons: [], warnings: [] }),
    });

    const { PDFDocument } = await import('pdf-lib');
    const leido = await PDFDocument.load(await bytesOf(await renderTripPdf(documento)));

    expect(leido.getPageCount()).toBe(1);
  });
});
