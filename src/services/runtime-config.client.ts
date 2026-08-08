import { requestJson } from './api-client.ts';
import type { RuntimeConfigResponseBody } from '../types/api.ts';

// Regla 4 de CLAUDE.md: en el frontend no hay ni una variable con prefijo
// `VITE_`. Lo que el navegador necesita saber de Supabase —la URL del proyecto y
// la clave anónima, que es pública— se lo da el servidor en tiempo de ejecución.
//
// No es solo por la regla: así el mismo compilado sirve para Development,
// Preview y Production con valores distintos (sección 8.2), en vez de hornear la
// configuración de un entorno dentro del bundle.

const CONFIG_ENDPOINT = '/api/config';

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

// La petición se hace una vez por carga de página y se comparte: sin esto, cada
// componente que necesite el cliente de Supabase pediría lo mismo otra vez.
let pending: Promise<SupabasePublicConfig | null> | null = null;

async function fetchSupabaseConfig(): Promise<SupabasePublicConfig | null> {
  const body = await requestJson<RuntimeConfigResponseBody>(CONFIG_ENDPOINT);
  return body.supabase;
}

export function loadSupabaseConfig(): Promise<SupabasePublicConfig | null> {
  pending ??= fetchSupabaseConfig().catch((error: unknown) => {
    // Un fallo no se queda cacheado: si la primera carga se cruzó con un corte
    // de red, el siguiente intento tiene que poder salir de verdad.
    pending = null;
    throw error;
  });

  return pending;
}
