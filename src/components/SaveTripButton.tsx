import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.tsx';
import { saveTrip } from '../services/saved-trips.client.ts';
import type { ProposalType } from '../types/api.ts';

// Guardar una propuesta. Regla 15: cargando, éxito y **error visible**, los tres.
//
// Al servidor solo se le mandan dos identificadores. Sección 8.2, "No confiar en
// cálculos enviados por el frontend": la propuesta que se guarda la lee el
// servidor de su propia base de datos, no de aquí.

type Status = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveTripButtonProps {
  // Ausente cuando la generación no llegó a guardarse (la persistencia es
  // best-effort). Sin fila en la base de datos no hay nada a lo que apuntar, y
  // se dice en vez de enseñar un botón que solo puede fallar.
  tripId?: string;
  proposalType: ProposalType;
}

export function SaveTripButton({ tripId, proposalType }: SaveTripButtonProps) {
  const { status: authStatus, accessToken } = useAuth();
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  // Sin cuentas configuradas no hay nada que ofrecer.
  if (authStatus === 'unavailable' || authStatus === 'loading') return null;

  if (authStatus !== 'authenticated') {
    return (
      <p className="text-sm text-slate-600">
        <Link to="/cuenta" className="font-medium text-sky-700 underline hover:text-sky-900">
          Entra en tu cuenta
        </Link>{' '}
        para guardar este viaje.
      </p>
    );
  }

  if (!tripId) {
    return (
      <p className="text-sm text-slate-500">
        Este viaje no se ha podido registrar, así que no puede guardarse. Vuelve a buscarlo dentro
        de unos minutos.
      </p>
    );
  }

  async function handleSave() {
    if (!accessToken || !tripId) return;

    setStatus('saving');
    setMessage('');

    try {
      const saved = await saveTrip(accessToken, { tripId, proposalType });
      setMessage(`Guardado como «${saved.title}».`);
      setStatus('saved');
    } catch (error) {
      // El mensaje viene ya redactado en español desde el servidor.
      setMessage(
        error instanceof Error
          ? error.message
          : 'No hemos podido guardar este viaje. Inténtalo de nuevo.',
      );
      setStatus('error');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleSave}
        disabled={status === 'saving'}
        className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white shadow-sm
          hover:bg-sky-800 disabled:opacity-60"
      >
        {status === 'saving' ? 'Guardando…' : status === 'saved' ? 'Guardado' : 'Guardar viaje'}
      </button>

      {status === 'saved' && (
        <p role="status" className="text-sm text-emerald-700">
          {message}
        </p>
      )}

      {status === 'error' && (
        <p role="alert" className="text-sm text-red-700">
          {message}
        </p>
      )}
    </div>
  );
}
