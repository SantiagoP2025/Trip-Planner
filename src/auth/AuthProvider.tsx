import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clearCachedSavedTrips } from '../services/saved-trips.cache.ts';
import {
  createDefaultAuthGateway,
  type AuthGateway,
  type AuthSession,
  type AuthUser,
} from './auth-gateway.ts';

// Fase 8: la sesión, en un solo sitio.
//
// Regla 15: cargando, éxito y error visible, también aquí. `status` distingue
// los cuatro estados en los que puede estar la aplicación respecto a las
// cuentas, y `unavailable` no es un error del usuario: es un despliegue sin
// Supabase configurado, y la interfaz lo dice en vez de enseñar un formulario de
// acceso que no puede funcionar.

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'unavailable';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const NO_ACCOUNTS_MESSAGE = 'Las cuentas de usuario no están disponibles ahora mismo.';

export interface AuthProviderProps {
  children: React.ReactNode;
  // Inyectable para poder probar las pantallas con un doble, igual que los
  // handlers del servidor reciben sus dependencias.
  createGateway?: () => Promise<AuthGateway | null>;
}

export function AuthProvider({ children, createGateway = createDefaultAuthGateway }: AuthProviderProps) {
  const [gateway, setGateway] = useState<AuthGateway | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    // Si el componente se desmonta mientras se resuelve la configuración, no se
    // toca el estado de algo que ya no está en pantalla.
    let active = true;
    let unsubscribe: (() => void) | undefined;

    createGateway()
      .then(async (created) => {
        if (!active) return;

        if (!created) {
          setStatus('unavailable');
          return;
        }

        setGateway(created);

        const current = await created.getSession();
        if (!active) return;

        setSession(current);
        setStatus(current ? 'authenticated' : 'anonymous');

        // El token de acceso caduca cada pocos minutos y Supabase lo renueva
        // solo. Sin escuchar los cambios, el frontend seguiría mandándole al
        // servidor un token ya caducado y las peticiones acabarían en 401.
        unsubscribe = created.onSessionChange((next) => {
          if (!active) return;
          setSession(next);
          setStatus(next ? 'authenticated' : 'anonymous');
        });
      })
      .catch(() => {
        // No poder cargar la configuración es lo mismo, de cara al usuario, que
        // no tener cuentas: la aplicación sigue funcionando sin ellas.
        if (active) setStatus('unavailable');
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [createGateway]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!gateway) throw new Error(NO_ACCOUNTS_MESSAGE);
      await gateway.signIn(email, password);
    },
    [gateway],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!gateway) throw new Error(NO_ACCOUNTS_MESSAGE);
      return gateway.signUp(email, password);
    },
    [gateway],
  );

  const signOut = useCallback(async () => {
    if (!gateway) throw new Error(NO_ACCOUNTS_MESSAGE);
    await gateway.signOut();
    // La copia local se va con la sesión: en un dispositivo compartido, el
    // siguiente que entre no puede encontrarse los viajes del anterior.
    clearCachedSavedTrips();
  }, [gateway]);

  // Regla 13: el valor del contexto se memoriza. Un objeto reconstruido en cada
  // render cambia de identidad en cada render, y cualquier efecto que lo vigile
  // se dispararía siempre.
  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      accessToken: session?.accessToken ?? null,
      signIn,
      signUp,
      signOut,
    }),
    [status, session, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth solo puede usarse dentro de <AuthProvider>.');
  }
  return value;
}
