// Regla 4 de CLAUDE.md: aquí solo entran nombres sin prefijo `VITE_`. Todo lo
// que lleva ese prefijo acaba dentro del JavaScript que descarga el navegador, y
// la clave de servicio de Supabase salta Row Level Security: publicarla es dar
// acceso completo a la base de datos a cualquiera que abra las herramientas de
// desarrollo. Este módulo lo importa solo código de `server/` y `api/`.

export interface SupabaseServerConfig {
  url: string;
  serviceRoleKey: string;
}

// `disabled` no es un fallo: sin configurar, la aplicación genera viajes igual y
// no los guarda (persistencia best-effort). `invalid` sí lo es, y por eso se
// distingue: una configuración a medias suele ser una variable mal escrita, y
// devolver `disabled` en silencio la escondería durante semanas.
export type SupabaseConfigResult =
  | { status: 'configured'; config: SupabaseServerConfig }
  | { status: 'disabled' }
  | { status: 'invalid'; reason: string };

const SUPABASE_URL = 'SUPABASE_URL';
const SUPABASE_SERVICE_ROLE_KEY = 'SUPABASE_SERVICE_ROLE_KEY';
const SUPABASE_ANON_KEY = 'SUPABASE_ANON_KEY';

function readValue(env: Record<string, string | undefined>, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export function readSupabaseConfig(
  env: Record<string, string | undefined> = process.env,
): SupabaseConfigResult {
  const url = readValue(env, SUPABASE_URL);
  const serviceRoleKey = readValue(env, SUPABASE_SERVICE_ROLE_KEY);

  if (url === undefined && serviceRoleKey === undefined) {
    return { status: 'disabled' };
  }

  if (url === undefined) {
    return { status: 'invalid', reason: `Falta ${SUPABASE_URL}.` };
  }

  if (serviceRoleKey === undefined) {
    return { status: 'invalid', reason: `Falta ${SUPABASE_SERVICE_ROLE_KEY}.` };
  }

  if (!URL.canParse(url)) {
    return { status: 'invalid', reason: `${SUPABASE_URL} no es una URL válida.` };
  }

  return { status: 'configured', config: { url, serviceRoleKey } };
}

// Fase 8: configuración pública, la que sí puede llegar al navegador.
//
// La clave anónima no es un secreto y no cae bajo la regla 4: no da acceso a
// nada por sí sola, es el identificador público del proyecto y lo que decide qué
// puede tocar cada quien son las políticas Row Level Security de las
// migraciones. La que sí es un secreto es `SUPABASE_SERVICE_ROLE_KEY`, que salta
// RLS y no sale de aquí en ninguna circunstancia.
//
// Aun así no lleva prefijo `VITE_`, y no es una formalidad: con `VITE_` la clave
// se hornea dentro del bundle en tiempo de compilación, de forma que cambiarla o
// tener valores distintos por entorno (sección 8.2, "Separar claves de
// Development, Preview y Production") obliga a recompilar. Servida por
// `GET /api/config` es configuración de ejecución, y el mismo bundle vale para
// los tres entornos.
export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

export type SupabasePublicConfigResult =
  | { status: 'configured'; config: SupabasePublicConfig }
  | { status: 'disabled' }
  | { status: 'invalid'; reason: string };

export function readSupabasePublicConfig(
  env: Record<string, string | undefined> = process.env,
): SupabasePublicConfigResult {
  const url = readValue(env, SUPABASE_URL);
  const anonKey = readValue(env, SUPABASE_ANON_KEY);

  if (url === undefined && anonKey === undefined) {
    return { status: 'disabled' };
  }

  // Media configuración no es "sin cuentas", es un despliegue mal montado. Una
  // base de datos configurada sin clave anónima deja la aplicación guardando
  // viajes que su dueño no puede recuperar, y en silencio.
  if (url === undefined) {
    return { status: 'invalid', reason: `Falta ${SUPABASE_URL}.` };
  }

  if (anonKey === undefined) {
    return { status: 'invalid', reason: `Falta ${SUPABASE_ANON_KEY}.` };
  }

  if (!URL.canParse(url)) {
    return { status: 'invalid', reason: `${SUPABASE_URL} no es una URL válida.` };
  }

  return { status: 'configured', config: { url, anonKey } };
}
