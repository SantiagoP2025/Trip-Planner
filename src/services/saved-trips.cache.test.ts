// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedTrip } from '../types/api.ts';
import {
  clearCachedSavedTrips,
  readCachedSavedTrips,
  writeCachedSavedTrips,
} from './saved-trips.cache.ts';

const TRIPS = [
  { id: 'guardado-1', title: 'Valencia → Lisboa' },
] as unknown as SavedTrip[];

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('caché de viajes guardados', () => {
  it('guarda y recupera la lista del mismo usuario', () => {
    expect(writeCachedSavedTrips('usuario-1', TRIPS)).toEqual({ ok: true });
    expect(readCachedSavedTrips('usuario-1')).toEqual(TRIPS);
  });

  // En un dispositivo compartido, el segundo usuario no puede ver ni un instante
  // los viajes del primero.
  it('no devuelve la copia de otro usuario', () => {
    writeCachedSavedTrips('usuario-1', TRIPS);

    expect(readCachedSavedTrips('usuario-2')).toBeNull();
  });

  it('devuelve null cuando no hay nada guardado', () => {
    expect(readCachedSavedTrips('usuario-1')).toBeNull();
  });

  it('devuelve null ante una copia corrupta, sin lanzar', () => {
    localStorage.setItem('trip-planner.saved-trips', '{esto no es json');

    expect(readCachedSavedTrips('usuario-1')).toBeNull();
  });

  it('borra la copia al cerrar la sesión', () => {
    writeCachedSavedTrips('usuario-1', TRIPS);
    clearCachedSavedTrips();

    expect(readCachedSavedTrips('usuario-1')).toBeNull();
  });

  // Fallo A.9 de la auditoría y regla 14: el `writeAll()` sin `try/catch` del
  // proyecto de partida lanzaba al llenarse el almacenamiento y el usuario
  // perdía lo que acababa de escribir sin ver ni un mensaje.
  it('no lanza cuando el almacenamiento está lleno: lo dice', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });

    const result = writeCachedSavedTrips('usuario-1', TRIPS);

    expect(result.ok).toBe(false);
  });

  it('tampoco lanza al borrar si el almacenamiento falla', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('SecurityError', 'SecurityError');
    });

    expect(() => clearCachedSavedTrips()).not.toThrow();
  });

  it('no lanza al leer si el almacenamiento falla', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError', 'SecurityError');
    });

    expect(readCachedSavedTrips('usuario-1')).toBeNull();
  });
});
