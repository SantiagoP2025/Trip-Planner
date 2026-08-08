import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.tsx';

// Barra de sesión: dice quién está dentro y deja salir. Aparece en todas las
// pantallas para que "mis viajes" esté siempre a un clic.
//
// Regla 15: salir también es una operación del usuario, así que tiene sus tres
// estados. Un `signOut` que falla en silencio deja al usuario pulsando un botón
// que aparentemente no hace nada.

export function SessionBar() {
  const { status, user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  async function handleSignOut() {
    setSigningOut(true);
    setError('');

    try {
      await signOut();
    } catch {
      setError('No hemos podido cerrar tu sesión. Inténtalo de nuevo.');
    } finally {
      setSigningOut(false);
    }
  }

  // Mientras se resuelve, no se enseña ni "entrar" ni "salir": enseñar "entrar"
  // durante medio segundo a quien ya tiene sesión es un parpadeo que parece un
  // fallo.
  if (status === 'loading') {
    return <div className="h-9" aria-hidden="true" />;
  }

  // Sin Supabase configurado no hay cuentas. No se enseña un enlace a una
  // pantalla que solo puede decir que no funciona.
  if (status === 'unavailable') {
    return <div className="h-9" aria-hidden="true" />;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
      {status === 'authenticated' ? (
        <>
          <Link to="/viajes" className="font-medium text-sky-700 underline hover:text-sky-900">
            Mis viajes
          </Link>
          <span className="text-slate-500">{user?.email}</span>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700
              hover:bg-slate-50 disabled:opacity-60"
          >
            {signingOut ? 'Cerrando…' : 'Cerrar sesión'}
          </button>
        </>
      ) : (
        <Link to="/cuenta" className="font-medium text-sky-700 underline hover:text-sky-900">
          Entrar o crear cuenta
        </Link>
      )}

      {error && (
        <p role="alert" className="w-full text-right text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
