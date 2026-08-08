import { useState } from 'react';
import { downloadBlob } from '../services/pdf/download-blob.ts';
import { renderTripPdf } from '../services/pdf/render-trip-pdf.ts';
import { buildTripPdfDocument, type PdfTripSummary } from '../services/pdf/trip-document.ts';
import type { ItineraryEdit, TripProposal } from '../types/api.ts';

// Fase 12: descargar la propuesta en PDF.
//
// Regla 15 de PLAN-2.md: los tres estados, y el del medio es el que faltaba en
// la versión anterior. Allí el bloque era `try { … } finally { setCargando(false) }`,
// sin `catch`: si la generación fallaba, el indicador desaparecía y no pasaba
// nada más. El usuario pulsaba, esperaba y concluía que el botón no servía
// (fallo B.9 de la auditoría). Aquí el error se ve y se puede reintentar.
//
// La librería de PDF no se importa arriba: entra por `import()` dinámico dentro
// de `renderTripPdf`, la primera vez que alguien pulsa.

type Status = 'idle' | 'generating' | 'done' | 'error';

export function DownloadPdfButton({
  summary,
  proposal,
  edits,
}: {
  summary: PdfTripSummary;
  proposal: TripProposal;
  edits?: readonly ItineraryEdit[];
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function handleClick() {
    setStatus('generating');
    setMessage('');

    try {
      const pdf = buildTripPdfDocument({ summary, proposal, edits });
      const blob = await renderTripPdf(pdf);
      downloadBlob(blob, pdf.fileName);
      setStatus('done');
    } catch (error) {
      // Al usuario, un mensaje en español sin detalles técnicos; el detalle, al
      // log del navegador, que es donde lo va a buscar quien lo tenga que
      // arreglar.
      console.error('No se ha podido generar el PDF de la propuesta', error);
      setMessage(
        'No hemos podido preparar el PDF. Inténtalo de nuevo en unos segundos.',
      );
      setStatus('error');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'generating'}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700
          hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-60"
      >
        {status === 'generating' ? 'Preparando el PDF…' : 'Descargar en PDF'}
      </button>

      {status === 'generating' && (
        <p role="status" aria-live="polite" className="text-xs text-slate-600">
          Preparando el documento…
        </p>
      )}

      {status === 'done' && (
        <p role="status" aria-live="polite" className="text-xs text-slate-600">
          Descarga iniciada.
        </p>
      )}

      {status === 'error' && (
        <p role="alert" className="text-xs text-red-700">
          {message}
        </p>
      )}
    </div>
  );
}
