import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
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
import { Icon, type IconName } from '../components/Icon.tsx';
import { LuggageTag, type TagAccent } from '../components/LuggageTag.tsx';
import { NavBar } from '../components/NavBar.tsx';
import { PhotoCredits } from '../components/PhotoCredits.tsx';
import { WorldCollage } from '../components/WorldCollage.tsx';
import { toSearchParams } from '../services/trip-search-params.ts';
import { useDocumentTitle } from '../services/use-document-title.ts';
import { prefersReducedMotion } from '../services/motion.ts';
import { validateTripForm, type FieldErrors } from '../services/trip-validation.ts';
import type { TravelPreference } from '../types/api.ts';

// Sección 5: formulario de solicitud. Criterio de aceptación de la sección 17.3:
// "El formulario envía TripRequest válido".
//
// Al enviar no se llama al endpoint desde aquí: se navega a `/results` con la
// búsqueda en la URL, y es esa pantalla la que pide las propuestas. Así hay un
// único sitio que habla con el backend y refrescar los resultados funciona.
//
// Fase 14: la pantalla va sobre el mosaico de fotos, así que todo el formulario
// es texto blanco sobre fondo oscuro y los campos son líneas en vez de cajas.
// El `data-on-dark` del contenedor es lo que hace que `index.css` cambie el
// contorno del foco a blanco y desactive el fondo del autocompletado.

// Las etiquetas son preguntas, no sustantivos: "¿A dónde te apetece ir?" en vez
// de "Destino". Es lo que separa un formulario de un cuestionario.
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

const PREFERENCE_ICONS: Record<TravelPreference, IconName> = {
  beach: 'sun',
  culture: 'mapPin',
  gastronomy: 'utensils',
  nightlife: 'moon',
  nature: 'footprint',
  shopping: 'suitcase',
  family: 'compass',
  relax: 'moon',
};

const PREFERENCE_KEYS = Object.keys(PREFERENCE_LABELS) as TravelPreference[];

const TRAVEL_STYLES: { value: string; label: string; icon: IconName; accent: TagAccent }[] = [
  { value: 'economical', label: 'Económico', icon: 'footprint', accent: 'emerald' },
  { value: 'balanced', label: 'Equilibrado', icon: 'compass', accent: 'indigo' },
  { value: 'comfort', label: 'Cómodo', icon: 'sun', accent: 'amber' },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Los milisegundos de espera antes de navegar, para que dé tiempo a ver
// despegar el avión del botón.
const TAKEOFF_MS = 450;

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

// El formulario trabaja con texto porque eso es lo que devuelven los inputs, y
// porque enlazar un input numérico directamente al número deja pegado un cero
// delante mientras se escribe: `Number("")` es 0, y el campo vacío se repinta
// como "0". La conversión ocurre una sola vez, aquí, justo antes de validar.
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
    ...(values.checkedBaggageRequired ? { constraints: { checkedBaggageRequired: true } } : {}),
  };
}

// Los campos no son cajas, son líneas: sin fondo ni bordes laterales, y al
// enfocarse se enciende el subrayado en coral.
const LINE_INPUT =
  'w-full border-0 border-b-2 border-white/70 bg-transparent px-0 py-2 text-lg text-white ' +
  'placeholder:text-white/85 focus:border-sunset-400';

const LABEL_CLASS = 'font-heading text-sm font-medium text-sunset-100';

// Los retardos del escalonado, en el orden en que aparecen los bloques.
const DELAYS = [0, 60, 120, 180, 240, 300, 330, 360, 420, 480];

function Field({
  id,
  label,
  error,
  hint,
  delay,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="animate-fade-in-up flex flex-col gap-1"
      style={{ animationDelay: `${delay}ms` }}
    >
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-white/80">
          {hint}
        </p>
      )}
      {/* El mensaje de error se ata al input con `aria-describedby` desde quien
          lo pinta, y lleva `role="alert"` para que un lector de pantalla lo
          anuncie al aparecer. Un error que solo se ve en rojo no existe para
          media clase de gente. Sobre el fondo oscuro el rojo de siempre no se
          lee, así que el aviso va en coral claro. */}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-sunset-200">
          {error}
        </p>
      )}
    </div>
  );
}

function Home() {
  useDocumentTitle();
  const navigate = useNavigate();
  const formId = useId();
  const [values, setValues] = useState<FormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [takingOff, setTakingOff] = useState(false);
  const takeoffTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Si el componente se desmonta durante la espera del despegue, la navegación
  // pendiente se cancela: sin esto, React avisa de una actualización sobre algo
  // que ya no está en pantalla.
  useEffect(() => () => clearTimeout(takeoffTimer.current), []);

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

  // Cada clic avanza el nivel: 0 → 1 → 2 → 3 → 0.
  //
  // La referencia usa un interruptor de encendido y apagado, pero aquí las
  // preferencias son un perfil de niveles (sección 6.2) y es lo que consume el
  // algoritmo de afinidad. Convertirlas en interruptor tiraría la mitad de la
  // información con la que el motor puntúa, así que se queda la escala y lo que
  // se copia es el aspecto.
  const cyclePreference = (key: TravelPreference) => {
    update('preferences', {
      ...values.preferences,
      [key]: (values.preferences[key] + 1) % (MAX_PREFERENCE_LEVEL + 1),
    });
  };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validateTripForm(toCandidate(values));
    if (!validation.valid) {
      setFieldErrors(validation.fieldErrors);
      return;
    }

    setFieldErrors({});
    const target = `/results?${toSearchParams(validation.request).toString()}`;

    // Regla 19: quien ha pedido menos movimiento no espera a ver una animación
    // que no se le va a enseñar.
    if (prefersReducedMotion()) {
      navigate(target);
      return;
    }

    setTakingOff(true);
    takeoffTimer.current = setTimeout(() => navigate(target), TAKEOFF_MS);
  }

  const errorCount = Object.keys(fieldErrors).length;

  return (
    <div data-on-dark className="relative min-h-screen">
      <WorldCollage />
      <NavBar variant="floating" />

      <main className="relative z-10 mx-auto max-w-3xl px-4 pt-28 pb-12 sm:px-6">
        <header className="mb-10">
          <p
            className="animate-fade-in-up flex items-center gap-2 text-xs font-semibold
              tracking-[0.18em] text-sunset-200 uppercase"
          >
            <Icon name="sun" size={16} />
            Bienvenido a TripPlanner
          </p>
          <h1
            className="animate-fade-in-up mt-3 text-4xl font-semibold text-white sm:text-6xl"
            style={{ animationDelay: '80ms' }}
          >
            ¿A dónde vamos?
          </h1>
          <p
            className="animate-fade-in-up mt-3 text-lg text-sunset-100"
            style={{ animationDelay: '160ms' }}
          >
            El mundo entero está esperando.
          </p>
        </header>

        {errorCount > 0 && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-sunset-400/60 bg-ink-900/70 px-4 py-3 text-sm
              text-sunset-100"
          >
            Revisa los campos marcados: hay {errorCount === 1 ? 'un dato' : `${errorCount} datos`}{' '}
            sin completar o fuera de rango.
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
          <fieldset className="grid gap-6 sm:grid-cols-2">
            <legend className="sr-only">Trayecto</legend>

            <Field
              id={fieldId('origin')}
              label="¿Desde dónde sales?"
              error={fieldErrors.origin}
              delay={DELAYS[0]}
            >
              <input
                id={fieldId('origin')}
                name="origin"
                className={LINE_INPUT}
                value={values.origin}
                onChange={(event) => update('origin', event.target.value)}
                minLength={MIN_TEXT_LENGTH}
                maxLength={MAX_TEXT_LENGTH}
                placeholder="Valencia"
                autoComplete="off"
                aria-invalid={Boolean(fieldErrors.origin)}
                aria-describedby={describedBy('origin')}
              />
            </Field>

            <Field
              id={fieldId('destination')}
              label="¿A dónde te apetece ir?"
              error={fieldErrors.destination}
              delay={DELAYS[1]}
            >
              <input
                id={fieldId('destination')}
                name="destination"
                className={LINE_INPUT}
                value={values.destination}
                onChange={(event) => update('destination', event.target.value)}
                minLength={MIN_TEXT_LENGTH}
                maxLength={MAX_TEXT_LENGTH}
                placeholder="Lisboa"
                autoComplete="off"
                aria-invalid={Boolean(fieldErrors.destination)}
                aria-describedby={describedBy('destination')}
              />
            </Field>

            <Field
              id={fieldId('departureDate')}
              label="¿Cuándo os vais?"
              error={fieldErrors.departureDate}
              delay={DELAYS[2]}
            >
              {/* `color-scheme: dark` para que el selector nativo del navegador
                  salga oscuro: en claro, sobre este fondo, es un rectángulo
                  blanco en mitad de la pantalla. */}
              <input
                id={fieldId('departureDate')}
                name="departureDate"
                type="date"
                className={`${LINE_INPUT} [color-scheme:dark]`}
                value={values.departureDate}
                onChange={(event) => update('departureDate', event.target.value)}
                aria-invalid={Boolean(fieldErrors.departureDate)}
                aria-describedby={describedBy('departureDate')}
              />
            </Field>

            <Field
              id={fieldId('returnDate')}
              label="¿Cuándo volvéis?"
              error={fieldErrors.returnDate}
              hint={`Máximo ${MAX_NIGHTS} noches.`}
              delay={DELAYS[3]}
            >
              <input
                id={fieldId('returnDate')}
                name="returnDate"
                type="date"
                className={`${LINE_INPUT} [color-scheme:dark]`}
                value={values.returnDate}
                onChange={(event) => update('returnDate', event.target.value)}
                aria-invalid={Boolean(fieldErrors.returnDate)}
                aria-describedby={describedBy('returnDate', 'returnDate', true)}
              />
            </Field>
          </fieldset>

          <fieldset className="grid gap-6 sm:grid-cols-2">
            <legend className="sr-only">Viajeros y presupuesto</legend>

            <Field
              id={fieldId('adults')}
              label="¿Cuántos adultos viajáis?"
              error={fieldErrors['travelers.adults']}
              delay={DELAYS[4]}
            >
              <input
                id={fieldId('adults')}
                name="adults"
                type="number"
                inputMode="numeric"
                className={LINE_INPUT}
                value={values.adults}
                onChange={(event) => update('adults', event.target.value)}
                min={MIN_ADULTS}
                max={MAX_ADULTS}
                aria-invalid={Boolean(fieldErrors['travelers.adults'])}
                aria-describedby={describedBy('adults', 'travelers.adults')}
              />
            </Field>

            <Field
              id={fieldId('children')}
              label="¿Cuántos menores? (opcional)"
              error={fieldErrors['travelers.children']}
              delay={DELAYS[5]}
            >
              <input
                id={fieldId('children')}
                name="children"
                type="number"
                inputMode="numeric"
                className={LINE_INPUT}
                value={values.children}
                onChange={(event) => update('children', event.target.value)}
                min={MIN_CHILDREN}
                max={MAX_CHILDREN}
                aria-invalid={Boolean(fieldErrors['travelers.children'])}
                aria-describedby={describedBy('children', 'travelers.children')}
              />
            </Field>

            <Field
              id={fieldId('budget')}
              label="¿Cuál es tu presupuesto total?"
              error={fieldErrors.budget}
              hint="Para todo el viaje y todos los viajeros."
              delay={DELAYS[6]}
            >
              <input
                id={fieldId('budget')}
                name="budget"
                type="number"
                inputMode="numeric"
                className={LINE_INPUT}
                value={values.budget}
                onChange={(event) => update('budget', event.target.value)}
                min={1}
                max={MAX_BUDGET}
                aria-invalid={Boolean(fieldErrors.budget)}
                aria-describedby={describedBy('budget', 'budget', true)}
              />
            </Field>

            <Field
              id={fieldId('currency')}
              label="¿En qué moneda?"
              error={fieldErrors.currency}
              delay={DELAYS[7]}
            >
              {/* La moneda y la maleta son nuestras, la referencia no las tiene.
                  No se quitan: se estilan con el mismo lenguaje que el resto. */}
              <select
                id={fieldId('currency')}
                name="currency"
                className={`${LINE_INPUT} [color-scheme:dark]`}
                value={values.currency}
                onChange={(event) => update('currency', event.target.value)}
                aria-invalid={Boolean(fieldErrors.currency)}
                aria-describedby={describedBy('currency')}
              >
                <option value="EUR">Euro (€)</option>
                <option value="USD">Dólar ($)</option>
                <option value="GBP">Libra (£)</option>
              </select>
            </Field>

            <div
              className="animate-fade-in-up flex items-center gap-3 self-end pb-2"
              style={{ animationDelay: `${DELAYS[8]}ms` }}
            >
              <input
                id={fieldId('checkedBaggage')}
                name="checkedBaggage"
                type="checkbox"
                className="h-4 w-4 rounded border-white/40 bg-transparent accent-lagoon-500"
                checked={values.checkedBaggageRequired}
                onChange={(event) => update('checkedBaggageRequired', event.target.checked)}
              />
              <label htmlFor={fieldId('checkedBaggage')} className="text-sm text-white">
                Necesito maleta facturada
              </label>
            </div>
          </fieldset>

          <fieldset
            className="animate-fade-in-up"
            style={{ animationDelay: `${DELAYS[8]}ms` }}
          >
            <legend className={`${LABEL_CLASS} mb-3`}>¿Qué tipo de viaje buscas?</legend>

            <div className="grid gap-3 sm:grid-cols-3">
              {TRAVEL_STYLES.map((style, index) => (
                <LuggageTag
                  key={style.value}
                  label={style.label}
                  icon={style.icon}
                  index={index}
                  level={values.travelStyle === style.value ? 1 : 0}
                  maxLevel={1}
                  accent={style.accent}
                  onClick={() => update('travelStyle', style.value)}
                />
              ))}
            </div>
          </fieldset>

          <fieldset
            className="animate-fade-in-up"
            style={{ animationDelay: `${DELAYS[9]}ms` }}
          >
            <legend className={`${LABEL_CLASS} mb-1`}>¿Qué te apetece hacer?</legend>
            <p className="mb-3 text-xs text-white/80">
              Pulsa para subir el nivel, de 0 (no me interesa) a {MAX_PREFERENCE_LEVEL} (es lo que
              más me importa).
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {PREFERENCE_KEYS.map((key, index) => (
                <LuggageTag
                  key={key}
                  label={PREFERENCE_LABELS[key]}
                  icon={PREFERENCE_ICONS[key]}
                  index={index}
                  level={values.preferences[key]}
                  maxLevel={MAX_PREFERENCE_LEVEL}
                  accent="lagoon"
                  onClick={() => cyclePreference(key)}
                  // El nivel va en el nombre accesible porque el relleno y las
                  // marcas son las dos señales visuales, y ninguna la oye nadie.
                  ariaLabel={`${PREFERENCE_LABELS[key]}, nivel ${values.preferences[key]} de ${MAX_PREFERENCE_LEVEL}`}
                />
              ))}
            </div>
          </fieldset>

          {/* El degradado va de `lagoon-700` a `indigo-600` y no de `lagoon-500`:
              el 500 es un turquesa claro y el texto blanco encima se queda en 2,3
              de contraste, muy por debajo del 4,5 que pide un texto normal. El
              700 mantiene el mismo salto de color y llega a 5,2. Regla 18. */}
          <button
            type="submit"
            disabled={takingOff}
            className="group relative flex w-full items-center justify-center gap-3 overflow-hidden
              rounded-full bg-gradient-to-r from-lagoon-700 to-indigo-600 px-6 py-4
              font-heading text-lg font-semibold text-white shadow-lg shadow-indigo-900/30
              transition-transform hover:-translate-y-[2px] disabled:cursor-wait"
          >
            <span className={takingOff ? 'animate-fade-out' : undefined}>
              Buscar mi viaje ideal
            </span>

            <span className="relative flex items-center" aria-hidden="true">
              {/* La estela: tres puntos que aparecen detrás del avión al pasar
                  por encima. */}
              <span className="mr-1 flex items-center gap-1 opacity-0 transition-opacity
                group-hover:opacity-100">
                <span className="h-1 w-1 rounded-full bg-white/50" />
                <span className="h-1 w-1 rounded-full bg-white/70" />
                <span className="h-1 w-1 rounded-full bg-white/90" />
              </span>

              <Icon
                name="plane"
                size={22}
                className={`-rotate-12 transition-transform duration-200 group-hover:translate-x-1
                  ${takingOff ? 'animate-plane-takeoff' : ''}`}
              />
            </span>
          </button>
        </form>
      </main>

      <PhotoCredits />
    </div>
  );
}

export default Home;
