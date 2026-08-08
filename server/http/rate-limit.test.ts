import { describe, expect, it } from 'vitest';
import { FixedWindowRateLimiter, rateLimitHeaders } from './rate-limit.ts';

// Reloj controlado: el limitador depende del tiempo, y un test que dependa del
// reloj real es un test que falla solo de vez en cuando.
function fakeClock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('FixedWindowRateLimiter', () => {
  it('permite las peticiones hasta el tope y rechaza la siguiente', () => {
    const clock = fakeClock();
    const limiter = new FixedWindowRateLimiter({
      windowMs: 60_000,
      maxRequests: 3,
      now: clock.now,
    });

    expect(limiter.check('1.1.1.1').allowed).toBe(true);
    expect(limiter.check('1.1.1.1').allowed).toBe(true);
    expect(limiter.check('1.1.1.1').allowed).toBe(true);
    expect(limiter.check('1.1.1.1').allowed).toBe(false);
  });

  it('cuenta cada clave por separado', () => {
    const clock = fakeClock();
    const limiter = new FixedWindowRateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
      now: clock.now,
    });

    expect(limiter.check('1.1.1.1').allowed).toBe(true);
    expect(limiter.check('2.2.2.2').allowed).toBe(true);
    expect(limiter.check('1.1.1.1').allowed).toBe(false);
  });

  it('vuelve a permitir cuando la ventana ha pasado', () => {
    const clock = fakeClock();
    const limiter = new FixedWindowRateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
      now: clock.now,
    });

    expect(limiter.check('1.1.1.1').allowed).toBe(true);
    expect(limiter.check('1.1.1.1').allowed).toBe(false);

    clock.advance(60_000);
    expect(limiter.check('1.1.1.1').allowed).toBe(true);
  });

  it('informa de cuántas peticiones quedan y de cuándo se reinicia', () => {
    const clock = fakeClock();
    const limiter = new FixedWindowRateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
      now: clock.now,
    });

    const first = limiter.check('1.1.1.1');
    expect(first.limit).toBe(2);
    expect(first.remaining).toBe(1);
    expect(first.resetAt).toBe(clock.now() + 60_000);

    clock.advance(30_000);
    const second = limiter.check('1.1.1.1');
    expect(second.remaining).toBe(0);
    expect(second.retryAfterSeconds).toBe(30);
  });

  it('nunca devuelve un Retry-After menor que un segundo', () => {
    const clock = fakeClock();
    const limiter = new FixedWindowRateLimiter({
      windowMs: 1_000,
      maxRequests: 1,
      now: clock.now,
    });

    limiter.check('1.1.1.1');
    clock.advance(999);

    expect(limiter.check('1.1.1.1').retryAfterSeconds).toBe(1);
  });

  // Sin este tope, una avalancha desde direcciones distintas convierte el
  // limitador en la fuga de memoria que debía evitar.
  it('no guarda más claves que el tope configurado', () => {
    const clock = fakeClock();
    const limiter = new FixedWindowRateLimiter({
      windowMs: 60_000,
      maxRequests: 5,
      maxTrackedKeys: 10,
      now: clock.now,
    });

    for (let index = 0; index < 500; index += 1) {
      limiter.check(`ip-${index}`);
    }

    // La única forma de observar el tamaño desde fuera sin exponerlo: las claves
    // más antiguas se han olvidado, así que vuelven a empezar de cero.
    expect(limiter.check('ip-0').remaining).toBe(4);
  });

  it('libera las ventanas caducadas antes de desalojar a nadie vigente', () => {
    const clock = fakeClock();
    const limiter = new FixedWindowRateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
      maxTrackedKeys: 4,
      now: clock.now,
    });

    limiter.check('vieja-1');
    limiter.check('vieja-2');
    limiter.check('vieja-3');

    clock.advance(60_001);

    const reciente = limiter.check('reciente');
    expect(reciente.remaining).toBe(1);

    // Las tres viejas ya habían caducado, así que al hacer sitio se fueron
    // ellas y la reciente sigue contando.
    limiter.check('otra');
    expect(limiter.check('reciente').remaining).toBe(0);
  });
});

describe('rateLimitHeaders', () => {
  it('no incluye Retry-After cuando la petición se ha permitido', () => {
    const headers = rateLimitHeaders({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: 0,
      retryAfterSeconds: 42,
    });

    expect(headers['ratelimit-limit']).toBe('10');
    expect(headers['ratelimit-remaining']).toBe('9');
    expect(headers['retry-after']).toBeUndefined();
  });

  it('incluye Retry-After cuando la petición se ha rechazado', () => {
    const headers = rateLimitHeaders({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAt: 0,
      retryAfterSeconds: 42,
    });

    expect(headers['retry-after']).toBe('42');
  });
});
