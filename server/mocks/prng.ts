// Convención de CLAUDE.md: en los mocks, nunca Math.random() directo. La semilla
// se deriva de las entradas de la búsqueda para que la misma búsqueda dé siempre
// el mismo resultado (fase 2, "misma entrada -> misma salida").

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// mulberry32: PRNG determinista y suficientemente uniforme para datos simulados.
export function createSeededRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return function random(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

export function randomFloat(random: () => number, min: number, max: number, decimals = 1): number {
  const value = random() * (max - min) + min;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function randomItem<T>(random: () => number, items: readonly T[]): T {
  return items[randomInt(random, 0, items.length - 1)];
}

export function randomBoolean(random: () => number, probabilityTrue = 0.5): boolean {
  return random() < probabilityTrue;
}
