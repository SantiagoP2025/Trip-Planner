import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.tsx';
import type { ItineraryEditing } from '../components/DayByDay.tsx';
import { ProposalCard } from '../components/ProposalCard.tsx';
import { SessionBar } from '../components/SessionBar.tsx';
import { formatDate } from '../services/format.ts';
import {
  revertItineraryEdit,
  saveItineraryEdit,
} from '../services/itinerary-edits.client.ts';
import { deleteSavedTrip, listSavedTrips } from '../services/saved-trips.client.ts';
import { readCachedSavedTrips, writeCachedSavedTrips } from '../services/saved-trips.cache.ts';
import type { ItineraryEdit, SavedTrip } from '../types/api.ts';

// Fase 8: mis viajes guardados.
//
// Regla 9 de CLAUDE.md: la fuente de verdad es el servidor. La caché de
// `localStorage` sirve para que la lista aparezca al instante, y en cuanto llega
// la del servidor, la del servidor manda. Si la copia local no puede escribirse
// —el almacenamiento lleno es el caso real— se avisa (regla 14), porque un aviso
// que nadie ve es exactamente el fallo que arrastraba la versión anterior.
//
// Regla 15: cargando, éxito y error visible, en la lista y en cada borrado.

type Status = 'loading' | 'ready' | 'error';

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <SessionBar />
      <Link to="/" className="text-sm text-sky-700 underline hover:text-sky-900">
        ← Buscar otro viaje
      </Link>
      {children}
    </main>
  );
}

function SavedTrips() {
  const { status: authStatus, user, accessToken } = useAuth();

  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  // Se distingue de `error` a propósito: que no haya podido guardarse la copia
  // local no impide ver los viajes, así que no puede enseñarse como si todo
  // hubiera fallado.
  const [cacheWarning, setCacheWarning] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (authStatus !== 'authenticated' || !accessToken || !userId) return;

    // La copia local se pinta primero para que la pantalla no esté en blanco.
    // Nunca sustituye a la petición: la respuesta del servidor la pisa siempre.
    const cached = readCachedSavedTrips(userId);
    if (cached) {
      setSavedTrips(cached);
      setFromCache(true);
    }

    const controller = new AbortController();
    setStatus('loading');
    setError('');

    listSavedTrips(accessToken, { signal: controller.signal })
      .then((trips) => {
        setSavedTrips(trips);
        setFromCache(false);
        setStatus('ready');

        const written = writeCachedSavedTrips(userId, trips);
        setCacheWarning(
          written.ok
            ? ''
            : 'No hemos podido guardar una copia en este dispositivo. Tus viajes siguen guardados en tu cuenta.',
        );
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;

        setError(
          caught instanceof Error
            ? caught.message
            : 'No hemos podido cargar tus viajes guardados.',
        );
        setStatus('error');
      });

    return () => controller.abort();
  }, [authStatus, accessToken, userId, attempt]);

  async function handleDelete(id: string) {
    if (!accessToken || !userId) return;

    setDeletingId(id);
    setError('');

    try {
      await deleteSavedTrip(accessToken, id);

      // La lista nueva se calcula a partir de la que hay y se guarda en la
      // caché: si no, la copia local seguiría enseñando el viaje borrado hasta
      // la siguiente carga.
      const remaining = savedTrips.filter((trip) => trip.id !== id);
      setSavedTrips(remaining);

      const written = writeCachedSavedTrips(userId, remaining);
      setCacheWarning(
        written.ok
          ? ''
          : 'No hemos podido actualizar la copia de este dispositivo. Tus viajes siguen guardados en tu cuenta.',
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No hemos podido borrar este viaje. Inténtalo de nuevo.',
      );
    } finally {
      setDeletingId(null);
    }
  }

  // Fase 11. Guarda la lista nueva en el estado y en la caché de una vez: son
  // los dos sitios que enseñan viajes, y dejar uno atrás haría que la edición
  // apareciera y desapareciera al recargar.
  function applyEdits(tripId: string, edits: ItineraryEdit[]) {
    const updated = savedTrips.map((trip) => (trip.id === tripId ? { ...trip, edits } : trip));
    setSavedTrips(updated);

    if (!userId) return;
    const written = writeCachedSavedTrips(userId, updated);
    setCacheWarning(
      written.ok
        ? ''
        : 'No hemos podido actualizar la copia de este dispositivo. Tus cambios siguen guardados en tu cuenta.',
    );
  }

  // Las dos operaciones dejan que el error suba: quien lo enseña es el bloque
  // que el usuario está editando, que es donde está mirando (regla 15).
  function editingFor(trip: SavedTrip): ItineraryEditing {
    return {
      edits: trip.edits,

      async save(itemId, fields) {
        if (!accessToken) throw new Error('Tu sesión ha caducado. Vuelve a entrar.');

        const edit = await saveItineraryEdit(accessToken, trip.id, itemId, fields);
        // `null` significa que lo escrito no cambiaba nada: el servidor lo trata
        // como una vuelta al original y aquí hay que quitar la marca, no añadirla.
        const rest = trip.edits.filter((current) => current.itemId !== itemId);
        applyEdits(trip.id, edit ? [...rest, edit] : rest);
      },

      async revert(itemId) {
        if (!accessToken) throw new Error('Tu sesión ha caducado. Vuelve a entrar.');

        await revertItineraryEdit(accessToken, trip.id, itemId);
        applyEdits(
          trip.id,
          trip.edits.filter((current) => current.itemId !== itemId),
        );
      },
    };
  }

  if (authStatus === 'loading') {
    return (
      <Layout>
        <p role="status" className="mt-8">
          Cargando…
        </p>
      </Layout>
    );
  }

  if (authStatus !== 'authenticated') {
    return (
      <Layout>
        <div
          role="alert"
          className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-4 text-amber-900"
        >
          <h1 className="text-lg font-semibold">Entra para ver tus viajes</h1>
          <p className="mt-1 text-sm">
            {authStatus === 'unavailable'
              ? 'Las cuentas no están disponibles ahora mismo.'
              : 'Tus viajes guardados están en tu cuenta, no en este dispositivo.'}
          </p>
          {authStatus === 'anonymous' && (
            <Link
              to="/cuenta"
              className="mt-3 inline-block font-medium text-sky-800 underline hover:text-sky-900"
            >
              Entrar o crear cuenta
            </Link>
          )}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <header className="mt-4 mb-8">
        <h1 className="text-3xl font-semibold text-slate-900">Mis viajes guardados</h1>
      </header>

      {cacheWarning && (
        <p
          role="status"
          className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {cacheWarning}
        </p>
      )}

      {/* Un mismo sitio para los dos errores que puede haber en esta pantalla:
          el de cargar la lista y el de borrar un viaje. Los dos se ven; solo el
          primero ofrece reintentar, porque el segundo se reintenta pulsando otra
          vez el botón del viaje. */}
      {error && (
        <div
          role="alert"
          className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-4 text-red-800"
        >
          <h2 className="font-semibold">
            {status === 'error' ? 'No hemos podido cargar tus viajes' : 'No hemos podido borrar el viaje'}
          </h2>
          <p className="mt-1 text-sm">{error}</p>
          {status === 'error' && savedTrips.length > 0 && (
            <p className="mt-1 text-sm">
              Lo que ves debajo es la última copia guardada en este dispositivo y puede estar
              desactualizada.
            </p>
          )}
          {status === 'error' && (
            <button
              type="button"
              onClick={retry}
              className="mt-3 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white
                hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Volver a intentarlo
            </button>
          )}
        </div>
      )}

      {status === 'loading' && savedTrips.length === 0 && (
        <p role="status" className="py-12 text-center text-slate-700">
          Cargando tus viajes…
        </p>
      )}

      {status === 'ready' && savedTrips.length === 0 && (
        <div className="rounded-md border border-slate-200 bg-white px-4 py-8 text-center">
          <p className="text-slate-700">Todavía no has guardado ningún viaje.</p>
          <Link
            to="/"
            className="mt-3 inline-block font-medium text-sky-700 underline hover:text-sky-900"
          >
            Buscar un viaje
          </Link>
        </div>
      )}

      {savedTrips.length > 0 && (
        <div className="flex flex-col gap-8">
          {fromCache && status === 'loading' && (
            <p role="status" className="text-sm text-slate-500">
              Actualizando la lista…
            </p>
          )}

          {savedTrips.map((trip) => (
            <section key={trip.id} className="flex flex-col gap-3">
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{trip.title}</h2>
                  <p className="text-sm text-slate-600">
                    {formatDate(trip.departureDate)} — {formatDate(trip.returnDate)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(trip.id)}
                  disabled={deletingId === trip.id}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700
                    hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500
                    disabled:opacity-60"
                >
                  {deletingId === trip.id ? 'Borrando…' : 'Quitar de mis viajes'}
                </button>
              </header>

              <ProposalCard proposal={trip.proposal} editing={editingFor(trip)} />
            </section>
          ))}
        </div>
      )}
    </Layout>
  );
}

export default SavedTrips;
