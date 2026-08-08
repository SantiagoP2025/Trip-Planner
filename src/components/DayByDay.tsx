import { useId, useMemo, useState, type FormEvent } from 'react';
import { DayMap, hasCoordinates } from './DayMap.tsx';
import { formatCurrency, formatDate, formatDuration, formatTime } from '../services/format.ts';
import {
  MAX_EDIT_DESCRIPTION_LENGTH,
  MAX_EDIT_TITLE_LENGTH,
} from '../../server/config/trip-limits.ts';
import type { ItineraryDay, ItineraryEdit, ItineraryItem, ItineraryItemType } from '../types/api.ts';

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

// Fase 11: lo que hace falta para poder editar. Ausente en la pantalla de
// resultados, donde el viaje todavía no está guardado y por tanto no hay dónde
// guardar lo que el usuario escriba (regla 14: contra el servidor o nada).
export interface ItineraryEditing {
  edits: readonly ItineraryEdit[];
  save(itemId: string, fields: { title: string; description: string }): Promise<void>;
  revert(itemId: string): Promise<void>;
}

type EditStatus = 'idle' | 'saving' | 'saved' | 'error';

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 ' +
  'focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500';

function ItemEditor({
  item,
  edit,
  editing,
  onClose,
}: {
  item: ItineraryItem;
  edit: ItineraryEdit | undefined;
  editing: ItineraryEditing;
  onClose: () => void;
}) {
  const fieldId = useId();
  // Se parte de lo que el usuario está viendo, no del original: si ya había
  // editado el título, el formulario abre con su texto.
  const [title, setTitle] = useState(edit?.title ?? item.title);
  const [description, setDescription] = useState(edit?.description ?? item.description ?? '');
  const [status, setStatus] = useState<EditStatus>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('saving');
    setMessage('');

    try {
      await editing.save(item.id, { title, description });
      onClose();
    } catch (error) {
      // Regla 15: el error se ve. Perder en silencio lo que alguien acaba de
      // escribir es lo que hacía la versión anterior (fallo B.5), y el
      // formulario se queda abierto para no perder el texto.
      setMessage(
        error instanceof Error
          ? error.message
          : 'No hemos podido guardar el cambio. Inténtalo de nuevo.',
      );
      setStatus('error');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2">
      <div>
        <label htmlFor={`${fieldId}-title`} className="text-xs font-medium text-slate-700">
          Título
        </label>
        <input
          id={`${fieldId}-title`}
          className={inputClass}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={MAX_EDIT_TITLE_LENGTH}
        />
      </div>

      <div>
        <label htmlFor={`${fieldId}-description`} className="text-xs font-medium text-slate-700">
          Notas
        </label>
        <textarea
          id={`${fieldId}-description`}
          className={inputClass}
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={MAX_EDIT_DESCRIPTION_LENGTH}
        />
      </div>

      {message && (
        <p role="alert" className="text-xs text-red-700">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={status === 'saving'}
          className="rounded-md bg-sky-600 px-3 py-1 text-xs font-medium text-white
            hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-60"
        >
          {status === 'saving' ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700
            hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Item({
  item,
  currency,
  edit,
  editing,
}: {
  item: ItineraryItem;
  currency: string;
  edit?: ItineraryEdit;
  editing?: ItineraryEditing;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [revertStatus, setRevertStatus] = useState<EditStatus>('idle');
  const [revertMessage, setRevertMessage] = useState('');

  // Lo que se enseña es la edición cuando existe, y el original cuando no.
  // Elegir entre dos textos que manda el servidor no es generar datos: el
  // original sigue intacto en `item`, que es lo que permite volver a él.
  const title = edit?.title ?? item.title;
  const isEdited = edit !== undefined;

  async function handleRevert() {
    if (!editing) return;

    setRevertStatus('saving');
    setRevertMessage('');

    try {
      await editing.revert(item.id);
      setRevertStatus('idle');
    } catch (error) {
      setRevertMessage(
        error instanceof Error
          ? error.message
          : 'No hemos podido volver al original. Inténtalo de nuevo.',
      );
      setRevertStatus('error');
    }
  }

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
          <p className={`font-medium text-slate-900 ${isEdited ? 'italic' : ''}`}>{title}</p>
          {/* Se distingue visualmente lo editado de lo original. No basta con la
              cursiva: quien no distingue tipografías necesita el texto. */}
          {isEdited && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
              Editado por ti
            </span>
          )}
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

        {/* Solo la nota que ha escrito el usuario. La descripción original de una
            visita es su categoría ("Museo"), que ya dice la etiqueta de arriba:
            repetirla sería ruido, y no es algo que nadie haya escrito. */}
        {edit?.description !== undefined && (
          <p className="mt-0.5 text-sm text-slate-700">{edit.description}</p>
        )}

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

        {editing && !isEditing && (
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-xs font-medium text-sky-700 underline hover:text-sky-900"
            >
              Editar
            </button>

            {isEdited && (
              <button
                type="button"
                onClick={handleRevert}
                disabled={revertStatus === 'saving'}
                className="text-xs font-medium text-slate-600 underline hover:text-slate-900
                  disabled:opacity-60"
              >
                {revertStatus === 'saving' ? 'Deshaciendo…' : 'Volver al original'}
              </button>
            )}

            {revertMessage && (
              <p role="alert" className="text-xs text-red-700">
                {revertMessage}
              </p>
            )}
          </div>
        )}

        {editing && isEditing && (
          <ItemEditor
            item={item}
            edit={edit}
            editing={editing}
            onClose={() => setIsEditing(false)}
          />
        )}
      </div>
    </li>
  );
}

export function DayByDay({
  days,
  currency,
  editing,
}: {
  days: ItineraryDay[];
  currency: string;
  editing?: ItineraryEditing;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // El día elegido, o el primero mientras no se haya elegido ninguno. Se resuelve
  // así, y no copiando el primer día a un estado inicial, para que un itinerario
  // que cambia —otra búsqueda, otra propuesta— no deje seleccionada una fecha
  // que ya no existe.
  const selectedDay = days.find((day) => day.date === selectedDate) ?? days[0];

  // Regla 13: el array que alimenta el mapa se memoriza. Sin esto cambiaría de
  // identidad en cada render y arrastraría al efecto de encuadre con él.
  const stops = useMemo(
    () => (selectedDay?.items ?? []).filter(hasCoordinates),
    [selectedDay],
  );

  // Regla 6 de CLAUDE.md: las ediciones se indexan una vez, y no se recorre la
  // lista entera dentro del bucle que pinta cada bloque del día.
  const editsByItemId = useMemo(
    () => new Map((editing?.edits ?? []).map((edit) => [edit.itemId, edit])),
    [editing?.edits],
  );

  if (days.length === 0 || !selectedDay) return null;

  return (
    <section className="mt-4">
      <h3 className="text-sm font-semibold text-slate-900">Día a día</h3>

      {/* Un día cada vez: el itinerario de una semana en una sola lista no se
          lee, y el mapa es "el mapa del día seleccionado". */}
      <div className="mt-2 flex flex-wrap gap-1" role="tablist" aria-label="Días del viaje">
        {days.map((day, index) => {
          const isSelected = day.date === selectedDay.date;
          return (
            <button
              key={day.date}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSelectedDate(day.date)}
              className={`rounded-md px-3 py-1 text-xs font-medium focus:outline-none
                focus:ring-2 focus:ring-sky-500 ${
                  isSelected
                    ? 'bg-sky-600 text-white'
                    : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
            >
              Día {index + 1}
            </button>
          );
        })}
      </div>

      <article className="mt-3">
        <h4 className="text-sm font-medium text-slate-700">{formatDate(selectedDay.date)}</h4>

        {selectedDay.items.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">Día libre, sin nada programado.</p>
        ) : (
          <ul className="mt-1 divide-y divide-slate-100">
            {selectedDay.items.map((item) => (
              <Item
                key={item.id}
                item={item}
                currency={currency}
                edit={editsByItemId.get(item.id)}
                editing={editing}
              />
            ))}
          </ul>
        )}

        {/* Si el día no tiene paradas con coordenadas, `DayMap` no renderiza
            nada: un lienzo vacío no informa de nada. */}
        <DayMap items={stops} dayKey={selectedDay.date} />
      </article>
    </section>
  );
}
