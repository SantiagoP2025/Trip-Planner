// Sección 10.3: todos los criterios se convierten a una escala común de 0 a 100
// antes de aplicar pesos, para que un precio en euros y una distancia en km
// puedan sumarse con sentido.

export interface ValueRange {
  min: number;
  max: number;
}

// Regla 6 de CLAUDE.md: el mínimo y el máximo del conjunto se calculan aquí una
// sola vez y se pasan como contexto a las funciones de puntuación. Ninguna de
// ellas vuelve a recorrer el conjunto desde dentro del bucle que ya lo recorre.
//
// Regla 7: nada de Math.min(...array). El spread convierte cada elemento en un
// argumento y Node lanza RangeError a partir de unos 200.000 elementos; con
// proveedores reales el tamaño del conjunto no está acotado.
export function calculateRange<T>(items: readonly T[], valueOf: (item: T) => number): ValueRange {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const item of items) {
    const value = valueOf(item);
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  // Conjunto vacío (o sin valores utilizables): rango degenerado. Las funciones
  // de normalización devuelven 100 cuando min === max, que es la salida neutra.
  if (min === Number.POSITIVE_INFINITY) return { min: 0, max: 0 };
  return { min, max };
}

// Sección 10.3: implementación literal de la especificación.
export function normalizeLowerIsBetter(value: number, minValue: number, maxValue: number): number {
  if (minValue === maxValue) return 100;
  return clampScore((100 * (maxValue - value)) / (maxValue - minValue));
}

// Simétrica de la anterior, para criterios donde más es mejor (valoración,
// tiempo aprovechable). La especificación solo escribe una de las dos porque
// son la misma fórmula con el numerador invertido.
export function normalizeHigherIsBetter(value: number, minValue: number, maxValue: number): number {
  if (minValue === maxValue) return 100;
  return clampScore((100 * (value - minValue)) / (maxValue - minValue));
}

// Un valor fuera del rango con el que se normalizó (por ejemplo, una oferta
// añadida después de calcular el contexto) no debe sacar la escala de 0-100.
export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function roundScore(value: number): number {
  return Math.round(clampScore(value) * 100) / 100;
}
