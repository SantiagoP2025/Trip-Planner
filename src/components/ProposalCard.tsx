import { DayByDay } from './DayByDay.tsx';
import {
  formatCurrency,
  formatDateTime,
  formatDuration,
  formatStops,
} from '../services/format.ts';
import type { FlightSegment, ProposalType, TripProposal } from '../types/api.ts';

// Sección 10.7 y criterio de la sección 17.3: "Cada propuesta incluye coste,
// puntuación, razones y advertencias".
//
// Este componente solo pinta lo que viene en la propuesta. No calcula totales,
// no completa huecos y no inventa nada que el backend no haya mandado.

const TYPE_LABELS: Record<ProposalType, string> = {
  economical: 'La más económica',
  recommended: 'La recomendada',
  comfort: 'La más cómoda',
};

const TYPE_STYLES: Record<ProposalType, string> = {
  economical: 'bg-emerald-100 text-emerald-800',
  recommended: 'bg-sky-100 text-sky-800',
  comfort: 'bg-violet-100 text-violet-800',
};

function FlightLeg({ label, segments }: { label: string; segments: FlightSegment[] }) {
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) return null;

  return (
    <div className="text-sm">
      <p className="font-medium text-slate-700">{label}</p>
      <p className="text-slate-600">
        {first.origin} {formatDateTime(first.departureTime)} → {last.destination}{' '}
        {formatDateTime(last.arrivalTime)}
      </p>
      <p className="text-slate-500">
        {first.carrier} · {formatStops(segments.length - 1)}
      </p>
    </div>
  );
}

export function ProposalCard({ proposal }: { proposal: TripProposal }) {
  const { flight, accommodation, budget } = proposal;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${TYPE_STYLES[proposal.type]}`}
        >
          {TYPE_LABELS[proposal.type]}
        </span>
        <p className="text-2xl font-semibold text-slate-900">
          {formatCurrency(proposal.estimatedTotal, proposal.currency)}
        </p>
      </header>

      <p className="mt-1 text-sm text-slate-500">
        Puntuación {Math.round(proposal.score)} sobre 100
      </p>

      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Vuelo</h3>
          <FlightLeg label="Ida" segments={flight.outbound} />
          {flight.inbound && <FlightLeg label="Vuelta" segments={flight.inbound} />}
          <p className="text-sm text-slate-600">
            {formatDuration(flight.totalDurationMinutes)} en total ·{' '}
            {flight.baggageIncluded ? 'Maleta incluida' : 'Sin maleta facturada'}
          </p>
          <p className="text-sm font-medium text-slate-700">
            {formatCurrency(flight.totalPrice, flight.currency)}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Alojamiento</h3>
          <p className="text-sm text-slate-700">{accommodation.name}</p>
          {accommodation.rating !== undefined && (
            <p className="text-sm text-slate-600">
              {accommodation.rating.toFixed(1)} sobre 10
              {accommodation.reviewCount !== undefined &&
                ` · ${accommodation.reviewCount} opiniones`}
            </p>
          )}
          {accommodation.distanceToCenterKm !== undefined && (
            <p className="text-sm text-slate-600">
              A {accommodation.distanceToCenterKm.toFixed(1)} km del centro
            </p>
          )}
          <p className="text-sm font-medium text-slate-700">
            {formatCurrency(accommodation.totalPrice, accommodation.currency)}
          </p>
        </div>
      </section>

      <section className="mt-4">
        <h3 className="text-sm font-semibold text-slate-900">Desglose del gasto</h3>
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {[
            ['Transporte principal', budget.mainTransportCost],
            ['Alojamiento', budget.accommodationCost],
            ['Comidas', budget.foodBudget],
            ['Actividades', budget.activityCost],
            ['Transporte local', budget.localTransportCost],
            ['Imprevistos', budget.emergencyReserve],
          ].map(([label, amount]) => (
            <div key={String(label)} className="flex justify-between gap-4">
              <dt className="text-slate-600">{label}</dt>
              <dd className="tabular-nums text-slate-800">
                {formatCurrency(Number(amount), budget.currency)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Sección 10.7: por qué se ha elegido esta propuesta. */}
      {proposal.reasons.length > 0 && (
        <section className="mt-4">
          <h3 className="text-sm font-semibold text-slate-900">Por qué esta propuesta</h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">
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
        <DayByDay days={proposal.itinerary} currency={proposal.currency} />
      ) : (
        <p className="mt-4 text-xs text-slate-500">
          No hemos podido preparar el itinerario día a día de esta propuesta.
        </p>
      )}
    </article>
  );
}
