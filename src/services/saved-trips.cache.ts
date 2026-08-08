import type { SavedTrip } from '../types/api.ts';

// Regla 9 de CLAUDE.md: `localStorage` puede servir como caché, nunca como
// fuente de verdad. Lo que hay aquí es una copia de lo que ya está en el
// servidor, para que la lista aparezca al instante mientras llega la de verdad.
// En cuanto llega la del servidor, manda la del servidor.
//
// Regla 14 y fallo A.9 de la auditoría: **toda** escritura va con `try/catch`.
// El `writeAll()` sin proteger del proyecto de partida lanzaba una excepción sin
// capturar al llenarse el almacenamiento, y el usuario perdía lo que acababa de
// escribir sin ver ni un mensaje. Aquí no se lanza nunca: se devuelve si ha
// podido guardarse, y quien llama lo enseña (regla 15).

const STORAGE_KEY = 'trip-planner.saved-trips';

interface CachePayload {
  // De quién es la copia. Sin esto, en un dispositivo compartido el segundo
  // usuario vería un instante los viajes del primero.
  userId: string;
  savedTrips: SavedTrip[];
}

export type CacheWriteResult = { ok: true } | { ok: false; error: unknown };

// El almacenamiento puede no existir (renderizado en servidor, navegador con
// las cookies bloqueadas) y leerlo puede lanzar. Se comprueba una vez y a mano,
// en lugar de repetir el `try` en cada función.
function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readCachedSavedTrips(userId: string): SavedTrip[] | null {
  const store = storage();
  if (!store) return null;

  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;

    const payload = JSON.parse(raw) as Partial<CachePayload>;
    if (payload.userId !== userId || !Array.isArray(payload.savedTrips)) return null;

    return payload.savedTrips;
  } catch {
    // Una caché corrupta no es un error que enseñar: es una caché que no sirve.
    // Se ignora y se espera a la lista del servidor, que es la que manda.
    return null;
  }
}

export function writeCachedSavedTrips(userId: string, savedTrips: SavedTrip[]): CacheWriteResult {
  const store = storage();
  if (!store) return { ok: false, error: new Error('El navegador no permite guardar copias locales.') };

  try {
    const payload: CachePayload = { userId, savedTrips };
    store.setItem(STORAGE_KEY, JSON.stringify(payload));
    return { ok: true };
  } catch (error) {
    // El caso real que tumbaba la versión anterior: `QuotaExceededError` al
    // llenarse el almacenamiento. Aquí no se pierde nada —los viajes están en el
    // servidor— pero el usuario tiene que enterarse de que la copia local no ha
    // podido guardarse.
    return { ok: false, error };
  }
}

export function clearCachedSavedTrips(): void {
  const store = storage();
  if (!store) return;

  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Si ni siquiera se puede borrar, no hay nada más que hacer y desde luego no
    // hay nada que contarle al usuario: la lista real sigue en el servidor.
  }
}
