import type { AuthGateway, AuthSession } from './auth-gateway.ts';

// Doble de `AuthGateway` para los tests de pantalla. Vive aquí, y no dentro de
// un fichero de test, porque lo usan tres pantallas distintas y una copia por
// pantalla se separa de las otras en cuanto cambia la interfaz.
//
// Que exista este fichero es la razón de haber puesto una interfaz delante de
// Supabase: se puede probar la sesión entera —entrar, salir, que caduque el
// token— sin red y sin proyecto de Supabase.

export interface FakeAuthGateway {
  gateway: AuthGateway;
  // Simula lo que hace Supabase por su cuenta: renovar el token, cerrar la
  // sesión desde otra pestaña, o iniciarla.
  emit(session: AuthSession | null): void;
  readonly calls: { signIn: number; signUp: number; signOut: number };
}

export interface FakeAuthGatewayOptions {
  session?: AuthSession | null;
  signIn?: (email: string, password: string) => Promise<void>;
  signUp?: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut?: () => Promise<void>;
}

export function createFakeAuthGateway(options: FakeAuthGatewayOptions = {}): FakeAuthGateway {
  let session: AuthSession | null = options.session ?? null;
  const listeners = new Set<(session: AuthSession | null) => void>();
  const calls = { signIn: 0, signUp: 0, signOut: 0 };

  const gateway: AuthGateway = {
    getSession: async () => session,

    onSessionChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async signIn(email, password) {
      calls.signIn += 1;
      if (options.signIn) await options.signIn(email, password);
    },

    async signUp(email, password) {
      calls.signUp += 1;
      return options.signUp ? options.signUp(email, password) : { needsConfirmation: false };
    },

    async signOut() {
      calls.signOut += 1;
      if (options.signOut) await options.signOut();
    },
  };

  return {
    gateway,
    emit(next) {
      session = next;
      for (const listener of listeners) listener(next);
    },
    calls,
  };
}

export const TEST_SESSION: AuthSession = {
  accessToken: 'token-de-prueba',
  user: { id: 'usuario-1', email: 'alguien@ejemplo.test' },
};
