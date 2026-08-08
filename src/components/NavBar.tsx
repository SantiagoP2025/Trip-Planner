import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.tsx';
import { SessionBar } from './SessionBar.tsx';
import { Icon } from './Icon.tsx';

// Fase 14: la barra de navegación, con sus dos modos.
//
// `floating` es para la pantalla de búsqueda, donde el mosaico llena la parte de
// arriba: la barra va encima de la foto, sin fondo, en blanco. `solid` es para
// el resto, donde no hay foto debajo y hace falta un fondo propio.
//
// Los dos modos existen porque el mismo texto blanco que se lee sobre la foto es
// invisible sobre el crema del resto de pantallas. Es el tipo de detalle que
// acaba resuelto con una barra distinta por pantalla, y entonces cada una se
// desincroniza por su lado.

type NavVariant = 'floating' | 'solid';

const LINK_BASE = 'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium';

const TONE: Record<NavVariant, { bar: string; brand: string; link: string }> = {
  floating: {
    bar: 'absolute inset-x-0 top-0 z-20',
    brand: 'text-white',
    // El fondo blanco translúcido al pasar por encima es lo único que cambia:
    // el texto ya es blanco puro sobre la capa oscura del mosaico.
    link: 'text-white/90 hover:bg-white/15 hover:text-white',
  },
  solid: {
    bar: 'sticky top-0 z-20 border-b border-ink-200 bg-sunset-50/95 backdrop-blur',
    brand: 'text-ink-900',
    link: 'text-ink-700 hover:bg-sunset-100 hover:text-ink-900',
  },
};

export function NavBar({ variant = 'solid' }: { variant?: NavVariant }) {
  const { status } = useAuth();
  const tone = TONE[variant];

  // Sin cuentas configuradas no se enseña el enlace a una pantalla que solo
  // puede decir que no funciona. Es la misma regla que ya seguía `SessionBar`.
  const showSavedTrips = status === 'authenticated' || status === 'anonymous';

  return (
    <nav
      className={`${tone.bar} flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4
        sm:px-6`}
      aria-label="Principal"
    >
      <Link
        to="/"
        className={`inline-flex items-center gap-2 font-heading text-lg font-semibold ${tone.brand}`}
      >
        <Icon name="plane" size={22} className="-rotate-12" />
        TripPlanner
      </Link>

      <div className="flex flex-wrap items-center gap-1 sm:gap-2">
        <Link to="/" className={`${LINK_BASE} ${tone.link}`}>
          <Icon name="compass" size={17} />
          Buscar
        </Link>

        {showSavedTrips && (
          <Link to="/viajes" className={`${LINK_BASE} ${tone.link}`}>
            <Icon name="suitcase" size={17} />
            Mis viajes
          </Link>
        )}

        <SessionBar tone={variant === 'floating' ? 'dark' : 'light'} />
      </div>
    </nav>
  );
}
