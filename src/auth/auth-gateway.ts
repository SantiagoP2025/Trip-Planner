import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSupabaseConfig } from '../services/runtime-config.client.ts';

// Sección 8.2: "Añadir autenticación antes de permitir acceso a viajes
// privados". Esta es la cara del navegador de esa autenticación.
//
// El componente de React habla con esta interfaz y no con Supabase. Dos razones:
// se puede probar la pantalla entera con un doble de diez líneas, y el día que
// haya que cambiar de proveedor de identidad se cambia este fichero y nada más
// (mismo patrón que los proveedores de la sección 14.1).

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
}

export interface AuthGateway {
  getSession(): Promise<AuthSession | null>;
  // Devuelve la función para dejar de escuchar. El token de acceso caduca cada
  // pocos minutos y Supabase lo renueva solo: sin escuchar los cambios, la
  // aplicación seguiría mandando al servidor uno ya caducado.
  onSessionChange(listener: (session: AuthSession | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  // `needsConfirmation` es cierto cuando el proyecto exige confirmar el correo:
  // la cuenta existe pero todavía no hay sesión, y el usuario tiene que saberlo.
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
}

// CLAUDE.md: todos los textos de cara al usuario, en español. Supabase contesta
// en inglés y con jerga, así que sus errores se traducen aquí por código; lo que
// no se reconoce sale como mensaje genérico, nunca como el texto original.
const MESSAGE_BY_CODE: Record<string, string> = {
  invalid_credentials: 'El correo o la contraseña no son correctos.',
  email_not_confirmed: 'Confirma tu correo antes de entrar. Revisa tu bandeja de entrada.',
  user_already_exists: 'Ya existe una cuenta con este correo.',
  email_exists: 'Ya existe una cuenta con este correo.',
  weak_password: 'La contraseña es demasiado débil. Prueba con una más larga.',
  over_request_rate_limit: 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.',
  over_email_send_rate_limit:
    'Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.',
  validation_failed: 'Revisa el correo y la contraseña.',
};

const GENERIC_MESSAGE = 'No hemos podido completar la operación. Inténtalo de nuevo en unos minutos.';

export class AuthError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options);
    this.name = 'AuthError';
  }
}

function toAuthError(error: { message: string; code?: string; status?: number }): AuthError {
  const message = (error.code && MESSAGE_BY_CODE[error.code]) ?? GENERIC_MESSAGE;
  // El detalle técnico se queda en `cause`, para la consola.
  return new AuthError(message, { cause: error });
}

interface SupabaseSessionShape {
  access_token: string;
  user: { id: string; email?: string | null };
}

function toSession(session: SupabaseSessionShape | null | undefined): AuthSession | null {
  if (!session?.user) return null;

  return {
    accessToken: session.access_token,
    user: { id: session.user.id, email: session.user.email ?? null },
  };
}

export function createSupabaseAuthGateway(client: SupabaseClient): AuthGateway {
  return {
    async getSession() {
      const { data } = await client.auth.getSession();
      return toSession(data.session as SupabaseSessionShape | null);
    },

    onSessionChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(toSession(session as SupabaseSessionShape | null));
      });

      return () => data.subscription.unsubscribe();
    },

    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw toAuthError(error);
    },

    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw toAuthError(error);

      return { needsConfirmation: data.session === null };
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw toAuthError(error);
    },
  };
}

// Devuelve `null` cuando el despliegue no tiene Supabase configurado. La
// aplicación sigue generando viajes; lo que hace la interfaz es decir que las
// cuentas no están disponibles, en vez de enseñar un formulario de acceso que no
// puede funcionar.
export async function createDefaultAuthGateway(): Promise<AuthGateway | null> {
  const config = await loadSupabaseConfig();
  if (!config) return null;

  // La librería de Supabase se carga con `import()` dinámico y solo cuando hay
  // cuentas configuradas: pesa más que todo el resto del frontend junto, y un
  // despliegue sin cuentas no tiene por qué descargarla nunca.
  const { createClient } = await import('@supabase/supabase-js');

  const client = createClient(config.url, config.anonKey, {
    auth: {
      // La sesión vive en el navegador y se renueva sola: es lo que evita que el
      // usuario tenga que volver a entrar cada vez que abre la aplicación.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return createSupabaseAuthGateway(client);
}
