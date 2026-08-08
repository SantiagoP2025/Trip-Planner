import { RATE_LIMIT_MAX_TRACKED_KEYS, type RateLimitPolicy } from '../config/limits.ts';

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  // Momento en que la ventana se reinicia, en milisegundos desde época.
  resetAt: number;
  retryAfterSeconds: number;
}

// Sección 14.1, misma idea que con los proveedores: el motor habla con una
// interfaz, no con una implementación. Cambiar el contador en memoria por uno
// compartido (Redis, Upstash) es sustituir esta pieza, nada más.
export interface RateLimiter {
  check(key: string): RateLimitDecision;
}

export interface FixedWindowRateLimiterOptions extends RateLimitPolicy {
  maxTrackedKeys?: number;
  now?: () => number;
}

interface WindowState {
  count: number;
  startedAt: number;
}

// Ventana fija por clave: sencilla, sin dependencias y suficiente como barrera.
//
// Limitación consciente: en Vercel cada instancia de la función tiene su propia
// memoria, así que con varias instancias vivas el tope efectivo se multiplica
// por el número de instancias. Sirve para lo que tiene que servir —que una sola
// IP no tumbe el endpoint a base de peticiones seguidas (sección 8.2)— pero no
// es una cuota exacta. La cuota exacta necesita almacén compartido, y llega
// cuando los proveedores dejen de ser simulados y cada llamada cueste dinero.
export class FixedWindowRateLimiter implements RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly maxTrackedKeys: number;
  private readonly now: () => number;
  private readonly windows: Map<string, WindowState>;

  constructor(options: FixedWindowRateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    this.maxTrackedKeys = options.maxTrackedKeys ?? RATE_LIMIT_MAX_TRACKED_KEYS;
    this.now = options.now ?? Date.now;
    this.windows = new Map();
  }

  check(key: string): RateLimitDecision {
    const now = this.now();
    const current = this.windows.get(key);

    if (current === undefined || now - current.startedAt >= this.windowMs) {
      if (current === undefined) {
        this.makeRoomFor(now);
      }
      const fresh: WindowState = { count: 1, startedAt: now };
      this.windows.set(key, fresh);
      return this.decide(fresh);
    }

    current.count += 1;
    return this.decide(current);
  }

  private decide(state: WindowState): RateLimitDecision {
    const resetAt = state.startedAt + this.windowMs;
    const remaining = Math.max(0, this.maxRequests - state.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - this.now()) / 1000));

    return {
      allowed: state.count <= this.maxRequests,
      limit: this.maxRequests,
      remaining,
      resetAt,
      retryAfterSeconds,
    };
  }

  // El barrido solo se dispara cuando el mapa está lleno, así que su coste se
  // reparte entre muchas peticiones en vez de pagarse en cada una. Una sola
  // pasada recoge las ventanas caducadas y, de camino, la más antigua: recorrer
  // el mapa dos veces para dos agregados es el patrón que prohíbe la regla 6.
  private makeRoomFor(now: number): void {
    if (this.windows.size < this.maxTrackedKeys) return;

    const expired: string[] = [];
    let oldestKey: string | undefined;
    let oldestStartedAt = Number.POSITIVE_INFINITY;

    for (const [key, state] of this.windows) {
      if (now - state.startedAt >= this.windowMs) {
        expired.push(key);
      } else if (state.startedAt < oldestStartedAt) {
        oldestStartedAt = state.startedAt;
        oldestKey = key;
      }
    }

    for (const key of expired) {
      this.windows.delete(key);
    }

    // Si todas las ventanas siguen vigentes no hay nada caducado que tirar, y
    // aun así hay que dejar sitio: se sacrifica la más antigua.
    if (this.windows.size >= this.maxTrackedKeys && oldestKey !== undefined) {
      this.windows.delete(oldestKey);
    }
  }
}

// Cabeceras estándar de límite de peticiones. Los segundos que faltan salen de
// la propia decisión y no de un segundo reloj: el limitador puede llevar uno
// inyectado, y consultar `Date.now()` aquí daría cuentas distintas.
// `Retry-After` solo tiene sentido cuando la petición se ha rechazado.
export function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  const headers: Record<string, string> = {
    'ratelimit-limit': String(decision.limit),
    'ratelimit-remaining': String(decision.remaining),
    'ratelimit-reset': String(decision.retryAfterSeconds),
  };

  if (!decision.allowed) {
    headers['retry-after'] = String(decision.retryAfterSeconds);
  }

  return headers;
}
