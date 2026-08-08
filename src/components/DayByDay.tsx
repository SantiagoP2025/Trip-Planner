import { formatCurrency, formatDate, formatDuration, formatTime } from '../services/format.ts';
import type { ItineraryDay, ItineraryItem, ItineraryItemType } from '../types/api.ts';

// Sección 12: el itinerario día a día, tal como lo devuelve el servidor.
//
// Regla 1 de CLAUDE.md: este componente **pinta**. No calcula horas, no completa
// huecos, no ordena nada y no inventa una parada que el backend no haya
// mandado. Si un día viene vacío, se dice que está libre.
//
// El mapa llega en la fase 10 y depende de esto: las coordenadas que trae cada
// parada vienen del proveedor de lugares, así que ya se pueden dibujar sin
// enseñarle a nadie un sitio que no ha buscado (regla 12 del plan).

const TYPE_LABELS: Record<ItineraryItemType, string> = {
  arrival: 'Llegada',
  transfer: 'Traslado',
  hotel: 'Alojamiento',
  meal: 'Comida',
  visit: 'Visita',
  walk: 'Paseo',
  free_time: 'Tiempo libre',
};

const TYPE_STYLES: Record<ItineraryItemType, string> = {
  arrival: 'bg-sky-100 text-sky-800',
  transfer: 'bg-slate-100 text-slate-700',
  hotel: 'bg-violet-100 text-violet-800',
  meal: 'bg-amber-100 text-amber-900',
  visit: 'bg-emerald-100 text-emerald-800',
  walk: 'bg-slate-100 text-slate-700',
  free_time: 'bg-slate-100 text-slate-600',
};

function Item({ item, currency }: { item: ItineraryItem; currency: string }) {
  return (
    <li className="flex gap-3 py-2">
      <p className="w-24 shrink-0 tabular-nums text-sm text-slate-500">
        {formatTime(item.startTime)}–{formatTime(item.endTime)}
      </p>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[item.type]}`}
          >
            {TYPE_LABELS[item.type]}
          </span>
          <p className="font-medium text-slate-900">{item.title}</p>
        </div>

        <p className="mt-0.5 text-sm text-slate-600">
          {formatDuration(item.durationMinutes)}
          {item.travelMinutesFromPrevious !== undefined &&
            item.travelMinutesFromPrevious > 0 &&
            ` · ${formatDuration(item.travelMinutesFromPrevious)} para llegar`}
          {item.costPerPerson !== undefined &&
            item.costPerPerson > 0 &&
            ` · ${formatCurrency(item.costPerPerson, currency)} por persona`}
        </p>

        {item.bookingRequired && (
          <p className="mt-0.5 text-sm text-amber-800">Requiere reserva previa.</p>
        )}

        {/* Sección 12.1: "Marcar datos no verificados". Lo estimado se dice, no
            se disimula: es la diferencia entre una propuesta y una promesa. */}
        {item.verificationStatus !== 'verified' && (
          <p className="mt-0.5 text-xs text-slate-500">
            {item.notes?.join(' ') ?? 'Horario estimado, pendiente de confirmar.'}
          </p>
        )}
      </div>
    </li>
  );
}

export function DayByDay({ days, currency }: { days: ItineraryDay[]; currency: string }) {
  if (days.length === 0) return null;

  return (
    <section className="mt-4">
      <h3 className="text-sm font-semibold text-slate-900">Día a día</h3>

      <div className="mt-2 flex flex-col gap-4">
        {days.map((day) => (
          <article key={day.date}>
            <h4 className="text-sm font-medium text-slate-700">{formatDate(day.date)}</h4>

            {day.items.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">Día libre, sin nada programado.</p>
            ) : (
              <ul className="mt-1 divide-y divide-slate-100">
                {day.items.map((item) => (
                  <Item key={item.id} item={item} currency={currency} />
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
