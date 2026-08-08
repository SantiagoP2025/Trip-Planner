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
