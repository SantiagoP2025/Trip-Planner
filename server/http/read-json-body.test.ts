import { describe, expect, it } from 'vitest';
import { MAX_REQUEST_BODY_BYTES } from '../config/limits.ts';
import { readJsonBody } from './read-json-body.ts';

function jsonRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request('https://ejemplo.test/api/trips/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('readJsonBody', () => {
  it('devuelve el JSON cuando el cuerpo es válido', async () => {
    const result = await readJsonBody(jsonRequest('{"destino":"Lisboa"}'));

    expect(result).toEqual({ ok: true, value: { destino: 'Lisboa' } });
  });

  it('rechaza un cuerpo que no es JSON', async () => {
    const request = new Request('https://ejemplo.test/api/trips/generate', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hola',
    });

    expect(await readJsonBody(request)).toEqual({ ok: false, reason: 'UNSUPPORTED_MEDIA_TYPE' });
  });

  it('acepta el content-type con juego de caracteres', async () => {
    const result = await readJsonBody(
      jsonRequest('{}', { 'content-type': 'application/json; charset=utf-8' }),
    );

    expect(result).toEqual({ ok: true, value: {} });
  });

  it('rechaza un JSON mal formado', async () => {
    expect(await readJsonBody(jsonRequest('{"destino":'))).toEqual({
      ok: false,
      reason: 'MALFORMED_JSON',
    });
  });

  // Regla 5 de CLAUDE.md: tope duro de tamaño del body.
  it('rechaza un cuerpo que supera el tope', async () => {
    const huge = JSON.stringify({ relleno: 'a'.repeat(MAX_REQUEST_BODY_BYTES) });

    expect(await readJsonBody(jsonRequest(huge))).toEqual({ ok: false, reason: 'BODY_TOO_LARGE' });
  });

  // La cabecera la escribe quien llama: si dice que el cuerpo es pequeño y no lo
  // es, el segundo control sobre lo leído tiene que cazarlo igual.
  it('rechaza un cuerpo grande aunque el content-length declarado mienta', async () => {
    const huge = JSON.stringify({ relleno: 'a'.repeat(MAX_REQUEST_BODY_BYTES) });

    expect(await readJsonBody(jsonRequest(huge, { 'content-length': '10' }))).toEqual({
      ok: false,
      reason: 'BODY_TOO_LARGE',
    });
  });

  it('rechaza por content-length antes de leer el cuerpo', async () => {
    const request = jsonRequest('{}', {
      'content-length': String(MAX_REQUEST_BODY_BYTES + 1),
    });

    expect(await readJsonBody(request)).toEqual({ ok: false, reason: 'BODY_TOO_LARGE' });
    // Si hubiera llegado a leerlo, el cuerpo estaría consumido.
    expect(request.bodyUsed).toBe(false);
  });
});
