import { Icon, type IconName } from './Icon.tsx';

// Fase 14: la etiqueta de equipaje. Es el elemento con más personalidad de la
// interfaz y el que hace que no parezca una plantilla, así que va con cuidado.
//
// Forma: esquina superior derecha recortada con `clip-path`, ojal arriba a la
// derecha, y una barra de color a la izquierda.
//
// **El `clip-path` no va en el botón sino en un elemento de dentro.** Un
// `clip-path` recorta también el `outline`, y el contorno del foco de
// `index.css` se quedaría a medias o desaparecería: el elemento más vistoso de
// la pantalla sería el único sin foco visible. Recortando solo el interior, el
// contorno sigue dibujándose entero alrededor del botón.

const TAG_SHAPE = { clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)' };

// La inclinación cambia de una etiqueta a la siguiente. Esa variación es lo que
// da el aire de sellos pegados a mano en vez de botones clonados: con todas
// rectas, la fila vuelve a parecer una plantilla.
const TILTS = ['-rotate-2', 'rotate-1', '-rotate-3', 'rotate-2', '-rotate-1', 'rotate-3'];

export type TagAccent = 'lagoon' | 'emerald' | 'indigo' | 'amber';

// Los niveles se pintan con el mismo color a distinta opacidad, siempre oscuro
// sobre el fondo oscuro del mosaico, para que el texto blanco de dentro no baje
// de contraste en ningún nivel (regla 18).
const ACCENTS: Record<TagAccent, { bar: string; levels: string[] }> = {
  lagoon: {
    bar: 'border-l-lagoon-400',
    levels: ['bg-white/10', 'bg-lagoon-700/55', 'bg-lagoon-700/80', 'bg-lagoon-700'],
  },
  emerald: {
    bar: 'border-l-emerald-400',
    levels: ['bg-white/10', 'bg-emerald-700'],
  },
  indigo: {
    bar: 'border-l-indigo-400',
    levels: ['bg-white/10', 'bg-indigo-600'],
  },
  amber: {
    // La única con texto oscuro: amber-500 es claro y el blanco encima no llega
    // ni a 2,5 de contraste.
    bar: 'border-l-amber-400',
    levels: ['bg-white/10', 'bg-amber-500 text-ink-900'],
  },
};

interface LuggageTagProps {
  label: string;
  icon: IconName;
  /** Posición en la fila: solo decide la inclinación. */
  index: number;
  level: number;
  /** 1 para las que solo se encienden y apagan; 3 para las preferencias. */
  maxLevel: number;
  accent: TagAccent;
  onClick: () => void;
  /** Texto que sustituye al nombre accesible. Las preferencias lo usan para
   *  anunciar el nivel; sin él, un lector de pantalla diría "Gastronomía,
   *  botón" y no habría forma de saber en cuál de los cuatro estados está. */
  ariaLabel?: string;
}

export function LuggageTag({
  label,
  icon,
  index,
  level,
  maxLevel,
  accent,
  onClick,
  ariaLabel,
}: LuggageTagProps) {
  const selected = level > 0;
  const palette = ACCENTS[accent];
  const fill = palette.levels[Math.min(level, palette.levels.length - 1)];
  // Seleccionada se endereza; sin seleccionar, cada una con su inclinación.
  const tilt = selected ? 'rotate-0' : TILTS[index % TILTS.length];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className="group relative block w-full text-left"
    >
      <span
        style={TAG_SHAPE}
        // `key` sobre la animación no vale aquí, así que el balanceo se ata a la
        // clase: al pasar de no seleccionada a seleccionada, React cambia la
        // lista de clases y la animación arranca sola.
        className={`flex items-center gap-3 border-l-4 py-2.5 pr-4 pl-3 text-sm font-medium
          text-white transition-transform duration-150 group-hover:-translate-y-[2px]
          group-hover:rotate-0 ${palette.bar} ${fill} ${tilt}
          ${selected ? 'animate-tag-swing' : ''}`}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20"
          aria-hidden="true"
        >
          <Icon name={icon} size={16} />
        </span>

        <span className="flex-1">{label}</span>

        {/* Las marcas de nivel. Solo en las etiquetas que tienen escala: en las
            de encendido y apagado no dirían nada que no diga ya el relleno. */}
        {maxLevel > 1 && (
          <span className="flex shrink-0 gap-1" aria-hidden="true">
            {Array.from({ length: maxLevel }, (_, mark) => (
              <span
                key={mark}
                className={`h-1.5 w-1.5 rounded-full ${
                  mark < level ? 'bg-white' : 'bg-white/30'
                }`}
              />
            ))}
          </span>
        )}
      </span>

      {/* El ojal. Decorativo: va fuera del recorte para que se vea entero. */}
      <span
        aria-hidden="true"
        className="absolute top-[15px] right-[7px] h-1.5 w-1.5 rounded-full bg-white/70"
      />
    </button>
  );
}
