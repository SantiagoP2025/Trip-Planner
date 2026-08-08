import { describe, expect, it, vi } from 'vitest';
import {
  MAX_ACCESS_TOKEN_LENGTH,
  readBearerToken,
  SupabaseSessionVerifier,
  UnavailableSessionVerifier,
  type SupabaseAuthApi,
} from './session.ts';

function requestWith(authorization?: string): Request {
  const init: RequestInit = authorization ? { headers: { authorization } } : {};
  return new Request('https://ejemplo.test/api/trips/saved', init);
}

describe('readBearerToken', () => {
  it('lee el token de una cabecera bien formada', () => {
    expect(readBearerToken(requestWith('Bearer abc.def.ghi'))).toBe('abc.def.ghi');
  });

  it('acepta el esquema en cualquier combinación de mayúsculas', () => {
    expect(readBearerToken(requestWith('bearer abc'))).toBe('abc');
    expect(readBearerToken(requestWith('BEARER abc'))).toBe('abc');
  });

  it('devuelve null cuando no hay cabecera', () => {
    expect(readBearerToken(requestWith())).toBeNull();
  });

  it('devuelve null ante un esquema que no es Bearer', () => {
    expect(readBearerToken(requestWith('Basic dXN1YXJpbzpjbGF2ZQ=='))).toBeNull();
    expect(readBearerToken(requestWith('abc.def.ghi'))).toBeNull();
  });

  it('devuelve null ante una cabecera vacía o sin token', () => {
    expect(readBearerToken(requestWith('Bearer'))).toBeNull();
    expect(readBearerToken(requestWith('Bearer   '))).toBeNull();
  });

  // Sección 8.2, "Validar tamaño y contenido del body", aplicado a la cabecera:
  // lo que llega muy por encima del tamaño de un token no es una sesión, y no
  // hay por qué reenviárselo a nadie para averiguarlo.
  it('descarta un token descomunal sin llegar a comprobarlo', () => {
    const enorme = 'a'.repeat(MAX_ACCESS_TOKEN_LENGTH + 1);

    expect(readBearerToken(requestWith(`Bearer ${enorme}`))).toBeNull();
  });
});

function fakeClient(
  response: Awaited<ReturnType<SupabaseAuthApi['auth']['getUser']>>,
): { client: SupabaseAuthApi; getUser: ReturnType<typeof vi.fn> } {
  const getUser = vi.fn(async () => response);
  return { client: { auth: { getUser } }, getUser };
}

describe('SupabaseSessionVerifier', () => {
  it('devuelve el usuario cuando Supabase reconoce el token', async () => {
    const { client } = fakeClient({
      data: { user: { id: 'usuario-1', email: 'alguien@ejemplo.test' } },
      error: null,
    });

    const result = await new SupabaseSessionVerifier(client).verify('token');

    expect(result).toEqual({
      status: 'authenticated',
      user: { id: 'usuario-1', email: 'alguien@ejemplo.test' },
    });
  });

  it('no llama a Supabase cuando no hay token', async () => {
    const { client, getUser } = fakeClient({ data: { user: null }, error: null });

    const result = await new SupabaseSessionVerifier(client).verify(null);

    expect(result).toEqual({ status: 'anonymous' });
    expect(getUser).not.toHaveBeenCalled();
  });

  it('trata como anónimo el token que Supabase rechaza', async () => {
    const { client } = fakeClient({
      data: { user: null },
      error: { message: 'invalid claim: missing sub claim', status: 401, code: 'bad_jwt' },
    });

    expect(await new SupabaseSessionVerifier(client).verify('caducado')).toEqual({
      status: 'anonymous',
    });
  });

  // La diferencia que importa: una caída de Supabase no puede contarse como
  // "tu sesión no vale". Lo primero es un 500; lo segundo, un 401.
  it('distingue una caída del servicio de un token inválido', async () => {
    const { client } = fakeClient({
      data: { user: null },
      error: { message: 'fetch failed', status: 503 },
    });

    const result = await new SupabaseSessionVerifier(client).verify('token');

    expect(result.status).toBe('unavailable');
  });

  it('trata como caída un fallo de red que lanza', async () => {
    const client: SupabaseAuthApi = {
      auth: { getUser: () => Promise.reject(new Error('ECONNRESET')) },
    };

    const result = await new SupabaseSessionVerifier(client).verify('token');

    expect(result.status).toBe('unavailable');
  });

  it('se rinde cuando el servicio de autenticación no responde a tiempo', async () => {
    vi.useFakeTimers();
    const client: SupabaseAuthApi = { auth: { getUser: () => new Promise(() => {}) } };

    const pending = new SupabaseSessionVerifier(client, 1_000).verify('token');
    await vi.advanceTimersByTimeAsync(1_000);

    expect((await pending).status).toBe('unavailable');
    vi.useRealTimers();
  });

  it('acepta un usuario sin correo', async () => {
    const { client } = fakeClient({ data: { user: { id: 'usuario-1' } }, error: null });

    const result = await new SupabaseSessionVerifier(client).verify('token');

    expect(result).toEqual({ status: 'authenticated', user: { id: 'usuario-1', email: null } });
  });
});

describe('UnavailableSessionVerifier', () => {
  // Sin Supabase configurado no se puede comprobar nada, y decirle al usuario
  // que su sesión no vale sería culparle de una configuración que le falta al
  // despliegue.
  it('dice que no puede comprobarlo, no que la sesión sea inválida', async () => {
    const verifier = new UnavailableSessionVerifier('Supabase no está configurado.');

    expect((await verifier.verify('token')).status).toBe('unavailable');
  });

  // Y aun así, sin token sigue siendo un anónimo corriente: generar un viaje no
  // exige cuenta y no puede romperse porque no haya cuentas.
  it('sin token es anónimo, no un error', async () => {
    const verifier = new UnavailableSessionVerifier('Supabase no está configurado.');

    expect(await verifier.verify(null)).toEqual({ status: 'anonymous' });
  });
});
