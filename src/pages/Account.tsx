import { useId, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.tsx';
import { FormField } from '../components/FormField.tsx';
import {
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  validateCredentials,
  type CredentialErrors,
} from '../services/credentials.ts';
import { useDocumentTitle } from '../services/use-document-title.ts';

// Fase 8: entrar y crear cuenta. Sección 8.2, "Añadir autenticación antes de
// permitir acceso a viajes privados".
//
// Regla 15: cargando, éxito y error visible. Un formulario de acceso sin la
// tercera es el peor de todos: el usuario escribe su contraseña, pulsa, no pasa
// nada, y no sabe si se ha equivocado o si la aplicación está rota.

type Mode = 'signIn' | 'signUp';
type Status = 'idle' | 'submitting' | 'done';

const inputClass =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm ' +
  'focus:border-sky-500';

function Account() {
  useDocumentTitle('Tu cuenta');
  const { status: authStatus, signIn, signUp } = useAuth();
  const formId = useId();

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<CredentialErrors>({});
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fieldId = (name: string) => `${formId}-${name}`;

  if (authStatus === 'loading') {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p role="status">Cargando…</p>
      </main>
    );
  }

  // Sin Supabase configurado no hay cuentas. Se dice, en vez de enseñar un
  // formulario que no puede funcionar.
  if (authStatus === 'unavailable') {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-4 text-amber-900">
          <h1 className="text-lg font-semibold">Las cuentas no están disponibles</h1>
          <p className="mt-1 text-sm">
            Puedes seguir buscando viajes, pero ahora mismo no es posible entrar ni guardarlos.
          </p>
        </div>
        <Link to="/" className="mt-6 inline-block text-sm text-sky-700 underline hover:text-sky-900">
          ← Volver a buscar
        </Link>
      </main>
    );
  }

  if (authStatus === 'authenticated') {
    return <Navigate to="/viajes" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors = validateCredentials({ email, password });
    setFieldErrors(errors);
    setError('');
    setNotice('');
    if (Object.keys(errors).length > 0) return;

    setStatus('submitting');

    try {
      if (mode === 'signIn') {
        await signIn(email.trim(), password);
        // No se navega desde aquí: al llegar la sesión, este componente se
        // vuelve a pintar y el `Navigate` de arriba lleva a los viajes. Una sola
        // forma de salir de esta pantalla, y no dos que puedan discrepar.
        setStatus('done');
        return;
      }

      const result = await signUp(email.trim(), password);
      setStatus('done');
      if (result.needsConfirmation) {
        setNotice('Te hemos enviado un correo para confirmar la cuenta. Ábrelo y vuelve aquí.');
      }
    } catch (caught) {
      // El mensaje llega ya traducido al español desde `auth-gateway.ts`.
      setError(
        caught instanceof Error
          ? caught.message
          : 'No hemos podido completar la operación. Inténtalo de nuevo.',
      );
      setStatus('idle');
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setFieldErrors({});
    setError('');
    setNotice('');
  }

  const submitting = status === 'submitting';

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Link to="/" className="text-sm text-sky-700 underline hover:text-sky-900">
        ← Volver a buscar
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-3xl font-semibold text-slate-900">
          {mode === 'signIn' ? 'Entrar' : 'Crear cuenta'}
        </h1>
        <p className="mt-2 text-slate-600">
          Con una cuenta puedes guardar los viajes que te interesen y volver a ellos desde
          cualquier dispositivo.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="mb-6 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormField id={fieldId('email')} label="Correo electrónico" error={fieldErrors.email}>
          <input
            id={fieldId('email')}
            name="email"
            type="email"
            className={inputClass}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={MAX_EMAIL_LENGTH}
            autoComplete="email"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? fieldId('email-error') : undefined}
          />
        </FormField>

        <FormField
          id={fieldId('password')}
          label="Contraseña"
          error={fieldErrors.password}
          hint={`Al menos ${MIN_PASSWORD_LENGTH} caracteres.`}
        >
          <input
            id={fieldId('password')}
            name="password"
            type="password"
            className={inputClass}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            maxLength={MAX_PASSWORD_LENGTH}
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={
              fieldErrors.password ? fieldId('password-error') : fieldId('password-hint')
            }
          />
        </FormField>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-sky-700 px-5 py-3 font-medium text-white shadow-sm
            hover:bg-sky-800 disabled:opacity-60"
        >
          {submitting
            ? 'Un momento…'
            : mode === 'signIn'
              ? 'Entrar'
              : 'Crear cuenta'}
        </button>
      </form>

      <p className="mt-6 text-sm text-slate-600">
        {mode === 'signIn' ? '¿Todavía no tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
        <button
          type="button"
          onClick={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')}
          className="font-medium text-sky-700 underline hover:text-sky-900"
        >
          {mode === 'signIn' ? 'Créala aquí' : 'Entra aquí'}
        </button>
      </p>
    </main>
  );
}

export default Account;
