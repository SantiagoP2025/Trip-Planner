import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ProposalCard } from '../components/ProposalCard.tsx';
import { generateTrip, TripApiError } from '../services/trip-api.client.ts';
import { fromSearchParams } from '../services/trip-search-params.ts';
import { validateTripForm } from '../services/trip-validation.ts';
import type { GenerateTripResponseBody } from '../types/api.ts';

// Criterio de aceptación de la sección 17.3: "La página /results muestra la
// respuesta sin depender de datos codificados".
//
// Regla 1 de CLAUDE.md: esta pantalla tiene una sola fuente, `generateTrip()`.
// No hay respaldo local, ni caché paralela, ni un generador de propuestas
// escondido para cuando el backend tarde. Si el endpoint falla, se enseña el
// error (regla 15).

type Status = 'loading' | 'success' | 'error';

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link to="/" className="text-sm text-sky-700 underline hover:text-sky-900">
        ← Cambiar la búsqueda
      </Link>
      {children}
    </main>
  );
}

function Results() {
  const [searchParams] = useSearchParams();
  // Regla 13: la dependencia del efecto es una cadena, no el objeto de
  // parámetros. Un objeto reconstruido en cada render cambia de identidad en
  // cada render, y el efecto que lo vigila se dispararía siempre.
  const search = searchParams.toString();

  const validation = useMemo(
    () => validateTripForm(fromSearchParams(new URLSearchParams(search))),
    [search],
  );

  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<GenerateTripResponseBody | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!validation.valid) return;

    // Si el usuario cambia de búsqueda antes de que llegue la anterior, la
    // primera se cancela: sin esto, la respuesta lenta pisaría a la rápida.
    const controller = new AbortController();
    setStatus('loading');

    generateTrip(validation.request, { signal: controller.signal })
      .then((response) => {
        setData(response);
        setStatus('success');
      })
      .catch((error: unknown) => {
        // Cancelar no es fallar: el componente ya no está esperando nada.
        if (error instanceof DOMException && error.name === 'AbortError') return;

        setErrorMessage(
          error instanceof TripApiError
            ? error.message
            : 'Ha ocurrido un error inesperado. Inténtalo de nuevo en unos minutos.',
        );
        setStatus('error');
      });

    return () => controller.abort();
  }, [validation, attempt]);

  // Una URL manipulada o incompleta no es un fallo del servidor: se dice y se
  // ofrece la vuelta al formulario, en vez de lanzar una petición condenada.
  if (!validation.valid) {
    return (
      <Layout>
        <div
          role="alert"
          className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-4 text-red-800"
        >
          <h1 className="text-lg font-semibold">Los datos de la búsqueda no son válidos</h1>
          <p className="mt-1 text-sm">
            Vuelve al formulario y completa la búsqueda de nuevo.
          </p>
        </div>
      </Layout>
    );
  }

  const { request } = validation;

  return (
    <Layout>
      <header className="mt-4 mb-8">
        <h1 className="text-3xl font-semibold text-slate-900">
          {request.origin} → {request.destination}
        </h1>
        <p className="mt-1 text-slate-600">
          {request.travelers.adults} {request.travelers.adults === 1 ? 'adulto' : 'adultos'}
          {request.travelers.children > 0 &&
            ` y ${request.travelers.children} ${
              request.travelers.children === 1 ? 'menor' : 'menores'
            }`}
        </p>
      </header>

      {/* Regla 15: cargando, éxito y error, los tres visibles. */}
      {status === 'loading' && (
        <div role="status" aria-live="polite" className="py-12 text-center">
          <p className="text-slate-700">Buscando las mejores combinaciones…</p>
          <p className="mt-1 text-sm text-slate-500">
            Estamos comparando vuelos y alojamientos. Tarda unos segundos.
          </p>
        </div>
      )}

      {status === 'error' && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-4 text-red-800"
        >
          <h2 className="font-semibold">No hemos podido preparar tu viaje</h2>
          <p className="mt-1 text-sm">{errorMessage}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white
              hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Volver a intentarlo
          </button>
        </div>
      )}

      {status === 'success' && data && (
        <>
          {data.proposals.length === 0 ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-4 text-amber-900">
              <h2 className="font-semibold">No hemos encontrado propuestas</h2>
              <p className="mt-1 text-sm">
                {data.message ??
                  'Prueba a ampliar el presupuesto o a cambiar las fechas del viaje.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {data.proposals.map((proposal) => (
                <ProposalCard key={proposal.id} proposal={proposal} />
              ))}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}

export default Results;
