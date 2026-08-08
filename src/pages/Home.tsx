import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MAX_ADULTS,
  MAX_BUDGET,
  MAX_CHILDREN,
  MAX_NIGHTS,
  MAX_PREFERENCE_LEVEL,
  MAX_TEXT_LENGTH,
  MIN_ADULTS,
  MIN_CHILDREN,
  MIN_TEXT_LENGTH,
} from '../../server/config/trip-limits.ts';
import { FormField } from '../components/FormField.tsx';
import { SessionBar } from '../components/SessionBar.tsx';
import { toSearchParams } from '../services/trip-search-params.ts';
import { useDocumentTitle } from '../services/use-document-title.ts';
import { validateTripForm, type FieldErrors } from '../services/trip-validation.ts';
import type { TravelPreference } from '../types/api.ts';

// Sección 5: formulario de solicitud. Criterio de aceptación de la sección 17.3:
// "El formulario envía TripRequest válido".
//
// Al enviar no se llama al endpoint desde aquí: se navega a `/results` con la
// búsqueda en la URL, y es esa pantalla la que pide las propuestas. Así hay un
// único sitio que habla con el backend y refrescar los resultados funciona.

const PREFERENCE_LABELS: Record<TravelPreference, string> = {
  beach: 'Playa',
  culture: 'Cultura',
  gastronomy: 'Gastronomía',
  nightlife: 'Vida nocturna',
  nature: 'Naturaleza',
  shopping: 'Compras',
  family: 'Familia',
  relax: 'Relax',
};

const PREFERENCE_KEYS = Object.keys(PREFERENCE_LABELS) as TravelPreference[];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// El input de tipo fecha trabaja en la zona horaria del navegador, así que la
// fecha por defecto se compone con los campos locales y no con `toISOString()`,
// que daría un día de menos a quien esté al este de Greenwich.
function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function daysFromToday(days: number): string {
  return toDateInputValue(new Date(Date.now() + days * MS_PER_DAY));
}

interface FormValues {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  adults: string;
  children: string;
  budget: string;
  currency: string;
  travelStyle: string;
  preferences: Record<TravelPreference, number>;
  checkedBaggageRequired: boolean;
}

function initialValues(): FormValues {
  return {
    origin: '',
    destination: '',
    departureDate: daysFromToday(30),
    returnDate: daysFromToday(37),
    adults: '2',
    children: '0',
    budget: '2000',
    currency: 'EUR',
    travelStyle: 'balanced',
    preferences: {
      beach: 1,
      culture: 2,
      gastronomy: 2,
      nightlife: 1,
      nature: 1,
      shopping: 0,
      family: 0,
      relax: 1,
    },
    checkedBaggageRequired: false,
  };
}

// El formulario trabaja con texto porque eso es lo que devuelven los inputs. La
// conversión a números ocurre una sola vez, aquí, justo antes de validar.
function toCandidate(values: FormValues) {
  return {
    origin: values.origin,
    destination: values.destination,
    departureDate: values.departureDate,
    returnDate: values.returnDate,
    travelers: {
      adults: Number(values.adults),
      children: Number(values.children),
    },
    budget: Number(values.budget),
    currency: values.currency,
    travelStyle: values.travelStyle,
    preferences: values.preferences,
    ...(values.checkedBaggageRequired
      ? { constraints: { checkedBaggageRequired: true } }
      : {}),
  };
}

const inputClass =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm ' +
  'focus:border-sky-500';

function Home() {
  useDocumentTitle();
  const navigate = useNavigate();
  const formId = useId();
  const [values, setValues] = useState<FormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const fieldId = (name: string) => `${formId}-${name}`;

  // `aria-describedby` apunta al error si lo hay y, si no, a la ayuda. Nunca a
  // un identificador que no está en el documento.
  //
  // El identificador del input y la clave del error no siempre coinciden: Zod
  // devuelve `travelers.adults` donde el input se llama `adults`. Apuntar al
  // identificador equivocado deja un `aria-describedby` colgando de la nada.
  const describedBy = (inputName: string, errorKey = inputName, hasHint = false) => {
    if (fieldErrors[errorKey]) return fieldId(`${inputName}-error`);
    return hasHint ? fieldId(`${inputName}-hint`) : undefined;
  };

  const update = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validateTripForm(toCandidate(values));
    if (!validation.valid) {
      setFieldErrors(validation.fieldErrors);
      return;
    }

    setFieldErrors({});
    navigate(`/results?${toSearchParams(validation.request).toString()}`);
  }

  const errorCount = Object.keys(fieldErrors).length;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <SessionBar />
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900">Planificador de viajes</h1>
        <p className="mt-2 text-slate-600">
          Dinos a dónde quieres ir y con cuánto cuentas. Te damos tres propuestas completas
          con vuelo, alojamiento y desglose del gasto.
        </p>
      </header>

      {errorCount > 0 && (
        <div
          role="alert"
          className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          Revisa los campos marcados: hay {errorCount === 1 ? 'un dato' : `${errorCount} datos`} sin
          completar o fuera de rango.
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-lg font-medium text-slate-900">Trayecto</legend>

          <FormField id={fieldId('origin')} label="Origen" error={fieldErrors.origin}>
            <input
              id={fieldId('origin')}
              name="origin"
              className={inputClass}
              value={values.origin}
              onChange={(event) => update('origin', event.target.value)}
              minLength={MIN_TEXT_LENGTH}
              maxLength={MAX_TEXT_LENGTH}
              placeholder="Valencia"
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors.origin)}
              aria-describedby={describedBy('origin')}
            />
          </FormField>

          <FormField id={fieldId('destination')} label="Destino" error={fieldErrors.destination}>
            <input
              id={fieldId('destination')}
              name="destination"
              className={inputClass}
              value={values.destination}
              onChange={(event) => update('destination', event.target.value)}
              minLength={MIN_TEXT_LENGTH}
              maxLength={MAX_TEXT_LENGTH}
              placeholder="Lisboa"
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors.destination)}
              aria-describedby={describedBy('destination')}
            />
          </FormField>

          <FormField
            id={fieldId('departureDate')}
            label="Fecha de salida"
            error={fieldErrors.departureDate}
          >
            <input
              id={fieldId('departureDate')}
              name="departureDate"
              type="date"
              className={inputClass}
              value={values.departureDate}
              onChange={(event) => update('departureDate', event.target.value)}
              aria-invalid={Boolean(fieldErrors.departureDate)}
              aria-describedby={describedBy('departureDate')}
            />
          </FormField>

          <FormField
            id={fieldId('returnDate')}
            label="Fecha de regreso"
            error={fieldErrors.returnDate}
            hint={`Máximo ${MAX_NIGHTS} noches.`}
          >
            <input
              id={fieldId('returnDate')}
              name="returnDate"
              type="date"
              className={inputClass}
              value={values.returnDate}
              onChange={(event) => update('returnDate', event.target.value)}
              aria-invalid={Boolean(fieldErrors.returnDate)}
              aria-describedby={describedBy('returnDate', 'returnDate', true)}
            />
          </FormField>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-lg font-medium text-slate-900">Viajeros y presupuesto</legend>

          <FormField
            id={fieldId('adults')}
            label="Adultos"
            error={fieldErrors['travelers.adults']}
          >
            <input
              id={fieldId('adults')}
              name="adults"
              type="number"
              className={inputClass}
              value={values.adults}
              onChange={(event) => update('adults', event.target.value)}
              min={MIN_ADULTS}
              max={MAX_ADULTS}
              aria-invalid={Boolean(fieldErrors['travelers.adults'])}
              aria-describedby={describedBy('adults', 'travelers.adults')}
            />
          </FormField>

          <FormField
            id={fieldId('children')}
            label="Menores"
            error={fieldErrors['travelers.children']}
          >
            <input
              id={fieldId('children')}
              name="children"
              type="number"
              className={inputClass}
              value={values.children}
              onChange={(event) => update('children', event.target.value)}
              min={MIN_CHILDREN}
              max={MAX_CHILDREN}
              aria-invalid={Boolean(fieldErrors['travelers.children'])}
              aria-describedby={describedBy('children', 'travelers.children')}
            />
          </FormField>

          <FormField
            id={fieldId('budget')}
            label="Presupuesto total"
            error={fieldErrors.budget}
            hint="Para todo el viaje y todos los viajeros."
          >
            <input
              id={fieldId('budget')}
              name="budget"
              type="number"
              className={inputClass}
              value={values.budget}
              onChange={(event) => update('budget', event.target.value)}
              min={1}
              max={MAX_BUDGET}
              aria-invalid={Boolean(fieldErrors.budget)}
              aria-describedby={describedBy('budget', 'budget', true)}
            />
          </FormField>

          <FormField id={fieldId('currency')} label="Moneda" error={fieldErrors.currency}>
            <select
              id={fieldId('currency')}
              name="currency"
              className={inputClass}
              value={values.currency}
              onChange={(event) => update('currency', event.target.value)}
              aria-invalid={Boolean(fieldErrors.currency)}
              aria-describedby={describedBy('currency')}
            >
              <option value="EUR">Euro (€)</option>
              <option value="USD">Dólar ($)</option>
              <option value="GBP">Libra (£)</option>
            </select>
          </FormField>

          <FormField
            id={fieldId('travelStyle')}
            label="Estilo de viaje"
            error={fieldErrors.travelStyle}
          >
            <select
              id={fieldId('travelStyle')}
              name="travelStyle"
              className={inputClass}
              value={values.travelStyle}
              onChange={(event) => update('travelStyle', event.target.value)}
              aria-invalid={Boolean(fieldErrors.travelStyle)}
              aria-describedby={describedBy('travelStyle')}
            >
              <option value="economical">Económico</option>
              <option value="balanced">Equilibrado</option>
              <option value="comfort">Cómodo</option>
            </select>
          </FormField>

          <div className="flex items-center gap-2 self-end pb-2">
            <input
              id={fieldId('checkedBaggage')}
              name="checkedBaggage"
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-sky-600"
              checked={values.checkedBaggageRequired}
              onChange={(event) => update('checkedBaggageRequired', event.target.checked)}
            />
            <label htmlFor={fieldId('checkedBaggage')} className="text-sm text-slate-700">
              Necesito maleta facturada
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-lg font-medium text-slate-900">Preferencias</legend>
          <p className="mb-4 text-sm text-slate-600">
            De 0 (no me interesa) a {MAX_PREFERENCE_LEVEL} (es lo que más me importa).
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {PREFERENCE_KEYS.map((key) => (
              <div key={key} className="flex items-center gap-3">
                <label htmlFor={fieldId(key)} className="w-32 text-sm text-slate-700">
                  {PREFERENCE_LABELS[key]}
                </label>
                <input
                  id={fieldId(key)}
                  name={key}
                  type="range"
                  min={0}
                  max={MAX_PREFERENCE_LEVEL}
                  step={1}
                  className="flex-1 accent-sky-600"
                  value={values.preferences[key]}
                  onChange={(event) =>
                    update('preferences', {
                      ...values.preferences,
                      [key]: Number(event.target.value),
                    })
                  }
                />
                <output htmlFor={fieldId(key)} className="w-4 text-sm tabular-nums text-slate-600">
                  {values.preferences[key]}
                </output>
              </div>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          className="rounded-md bg-sky-700 px-5 py-3 font-medium text-white shadow-sm
            hover:bg-sky-800"
        >
          Buscar viajes
        </button>
      </form>
    </main>
  );
}

export default Home;
