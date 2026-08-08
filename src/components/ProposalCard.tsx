import { DayByDay, type ItineraryEditing } from './DayByDay.tsx';
import { DownloadPdfButton } from './DownloadPdfButton.tsx';
import {
  formatCurrency,
  formatDateTime,
  formatDuration,
  formatStops,
} from '../services/format.ts';
import { BUDGET_LINE_LABELS } from '../services/labels.ts';
import { PROPOSAL_THEMES } from '../constants/proposalTheme.ts';
import type { PdfTripSummary } from '../services/pdf/trip-document.ts';
import type { FlightSegment, TripProposal } from '../types/api.ts';

// Sección 10.7 y criterio de la sección 17.3: "Cada propuesta incluye coste,
// puntuación, razones y advertencias".
//
// Este componente solo pinta lo que viene en la propuesta. No calcula totales,
// no completa huecos y no inventa nada que el backend no haya mandado.

function FlightLeg({ label, segments }: { label: string; segments: FlightSegment[] }) {
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) return null;

  return (
    <div className="text-sm">
      <p className="font-medium text-ink-700">{label}</p>
      <p className="text-ink-700">
        {first.origin} {formatDateTime(first.departureTime)} → {last.destination}{' '}
        {formatDateTime(last.arrivalTime)}
      </p>
      <p className="text-ink-700">
        {first.carrier} · {formatStops(segments.length - 1)}
      </p>
    </div>
  );
}

// `editing` solo llega desde la pantalla de viajes guardados: sin viaje guardado
// no hay dónde guardar lo que el usuario escriba, y la fase 11 depende de la 8
// justamente por eso.
//
// `trip` es de qué viaje es la propuesta, que la propuesta no dice: sin él no se
// puede titular ni nombrar el PDF, así que sin él no se ofrece descargarlo.
export function ProposalCard({
  proposal,
  trip,
  editing,
}: {
  proposal: TripProposal;
  trip?: PdfTripSummary;
  editing?: ItineraryEditing;
}) {
  const { flight, accommodation, budget } = proposal;
  // Fase 14: el color del nivel sale de un solo sitio, para que la tarjeta y las
  // pestañas del itinerario de dentro no acaben de dos colores distintos.
  const theme = PROPOSAL_THEMES[proposal.type];

  return (
    <article
      className={`rounded-2xl border-t-4 border-ink-200 bg-white p-5 shadow-sm ${theme.border}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.badge}`}>
          {theme.label}
        </span>
        <p className="text-2xl font-semibold text-ink-900">
          {formatCurrency(proposal.estimatedTotal, proposal.currency)}
        </p>
      </header>

      <p className="mt-1 text-sm text-ink-700">
        Puntuación {Math.round(proposal.score)} sobre 100
      </p>

      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink-900">Vuelo</h3>
          <FlightLeg label="Ida" segments={flight.outbound} />
          {flight.inbound && <FlightLeg label="Vuelta" segments={flight.inbound} />}
          <p className="text-sm text-ink-700">
            {formatDuration(flight.totalDurationMinutes)} en total ·{' '}
            {flight.baggageIncluded ? 'Maleta incluida' : 'Sin maleta facturada'}
          </p>
          <p className="text-sm font-medium text-ink-700">
            {formatCurrency(flight.totalPrice, flight.currency)}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink-900">Alojamiento</h3>
          <p className="text-sm text-ink-700">{accommodation.name}</p>
          {accommodation.rating !== undefined && (
            <p className="text-sm text-ink-700">
              {accommodation.rating.toFixed(1)} sobre 10
              {accommodation.reviewCount !== undefined &&
                ` · ${accommodation.reviewCount} opiniones`}
            </p>
          )}
          {accommodation.distanceToCenterKm !== undefined && (
            <p className="text-sm text-ink-700">
              A {accommodation.distanceToCenterKm.toFixed(1)} km del centro
            </p>
          )}
          <p className="text-sm font-medium text-ink-700">
            {formatCurrency(accommodation.totalPrice, accommodation.currency)}
          </p>
        </div>
      </section>

      <section className="mt-4">
        <h3 className="text-sm font-semibold text-ink-900">Desglose del gasto</h3>
        {/* Sección 9. Las siete partidas, que son las que suman el total: un
            desglose al que le falta una línea no cuadra, y desde la fase 12 el
            usuario se lo puede llevar impreso y sumarlo. */}
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {BUDGET_LINE_LABELS.map(([key, label]) => (
            <div key={key} className="flex justify-between gap-4">
              <dt className="text-ink-700">{label}</dt>
              <dd className="tabular-nums text-ink-900">
                {formatCurrency(budget[key], budget.currency)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Sección 10.7: por qué se ha elegido esta propuesta. */}
      {proposal.reasons.length > 0 && (
        <section className="mt-4">
          <h3 className="text-sm font-semibold text-ink-900">Por qué esta propuesta</h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-ink-700">
            {proposal.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
      )}

      {proposal.warnings.length > 0 && (
        <section className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
          <h3 className="text-sm font-semibold text-amber-900">A tener en cuenta</h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-amber-800">
            {proposal.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Sección 12. Cuando viene vacío es que no se ha podido calcular —sin
          proveedor de rutas no hay tiempos de desplazamiento reales— y se dice,
          en vez de rellenarlo con humo. */}
      {proposal.itinerary.length > 0 ? (
        <DayByDay
          days={proposal.itinerary}
          currency={proposal.currency}
          editing={editing}
          theme={theme}
        />
      ) : (
        <p className="mt-4 text-xs text-ink-700">
          No hemos podido preparar el itinerario día a día de esta propuesta.
        </p>
      )}

      {/* Fase 12. Va el último a propósito: lo primero es leer la propuesta, y
          lo que se descarga es lo que hay encima, ediciones incluidas. */}
      {trip && (
        <footer className="mt-5 border-t border-ink-200 pt-4">
          <DownloadPdfButton summary={trip} proposal={proposal} edits={editing?.edits} />
        </footer>
      )}
    </article>
  );
}
