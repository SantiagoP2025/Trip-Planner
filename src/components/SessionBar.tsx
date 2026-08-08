import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.tsx';

// Barra de sesión: dice quién está dentro y deja salir.
//
// Regla 15: salir también es una operación del usuario, así que tiene sus tres
// estados. Un `signOut` que falla en silencio deja al usuario pulsando un botón
// que aparentemente no hace nada.
//
// Fase 14: vive dentro de `NavBar`, que es quien pone ahora el enlace a "Mis
// viajes". Aquí queda solo la identidad, para que el enlace no salga dos veces.

type Tone = 'light' | 'dark';

const STYLES: Record<Tone, { email: string; button: string; link: string }> = {
  light: {
    email: 'text-ink-700',
    button: 'border-ink-200 text-ink-700 hover:bg-sunset-100',
    link: 'text-lagoon-700 hover:text-lagoon-600',
  },
  dark: {
    // Sobre la capa oscura del mosaico: blanco casi puro, porque un blanco al
    // 60% sobre una foto no cumple contraste por mucha capa que haya encima
    // (regla 18 de la fase).
    email: 'text-white/85',
    button: 'border-white/40 text-white hover:bg-white/15',
    link: 'text-white hover:bg-white/15',
  },
};

export function SessionBar({ tone = 'light' }: { tone?: Tone }) {
  const { status, user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const styles = STYLES[tone];

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
          <span className={styles.email}>{user?.email}</span>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className={`rounded-full border px-3 py-1.5 disabled:opacity-60 ${styles.button}`}
          >
            {signingOut ? 'Cerrando…' : 'Cerrar sesión'}
          </button>
        </>
      ) : (
        <Link
          to="/cuenta"
          className={`rounded-full px-3 py-1.5 font-medium ${styles.link}`}
        >
          Entrar o crear cuenta
        </Link>
      )}

      {error && (
        <p role="alert" className={`w-full text-right ${tone === 'dark' ? 'text-sunset-200' : 'text-red-700'}`}>
          {error}
        </p>
      )}
    </div>
  );
}
