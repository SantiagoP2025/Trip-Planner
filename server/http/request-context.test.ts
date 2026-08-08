import { describe, expect, it } from 'vitest';
import { createRequestId, resolveClientIp } from './request-context.ts';

function requestWith(headers: Record<string, string>): Request {
  return new Request('https://ejemplo.test/api/health', { headers });
}

describe('createRequestId', () => {
  it('genera un identificador distinto en cada petición', () => {
    expect(createRequestId()).not.toBe(createRequestId());
  });
});

describe('resolveClientIp', () => {
  it('prefiere x-real-ip', () => {
    expect(
      resolveClientIp(requestWith({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' })),
    ).toBe('9.9.9.9');
  });

  it('usa la primera entrada de x-forwarded-for cuando no hay x-real-ip', () => {
    expect(resolveClientIp(requestWith({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' }))).toBe(
      '1.1.1.1',
    );
  });

  // Preferimos limitar de más a dejar un hueco sin límite.
  it('agrupa bajo una misma clave las peticiones sin IP identificable', () => {
    expect(resolveClientIp(requestWith({}))).toBe('unknown');
    expect(resolveClientIp(requestWith({ 'x-forwarded-for': '   ' }))).toBe('unknown');
  });
});
