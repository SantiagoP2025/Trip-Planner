// Sección 10.5: una opción está dominada cuando existe otra igual o mejor en
// todos los criterios y estrictamente mejor en al menos uno. Las dominadas se
// eliminan antes de presentar resultados.

// Todos los criterios se comparan como "más es mejor". Quien llame se encarga de
// invertir los que no lo sean; con las puntuaciones normalizadas de la sección
// 10.3 esto ya se cumple siempre.
export function dominates(a: readonly number[], b: readonly number[]): boolean {
  let strictlyBetterSomewhere = false;

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] < b[i]) return false;
    if (a[i] > b[i]) strictlyBetterSomewhere = true;
  }

  return strictlyBetterSomewhere;
}

// La comparación de Pareto es por parejas y no hay forma de evitarlo, pero los
// vectores de criterios se extraen una sola vez antes del doble bucle: dentro no
// se recorre ni se recalcula nada (regla 6 de CLAUDE.md).
export function filterDominated<T>(items: readonly T[], criteriaOf: (item: T) => number[]): T[] {
  const criteria = items.map(criteriaOf);
  const survivors: T[] = [];

  for (let i = 0; i < items.length; i += 1) {
    let isDominated = false;

    for (let j = 0; j < items.length; j += 1) {
      if (i === j) continue;
      if (dominates(criteria[j], criteria[i])) {
        isDominated = true;
        break;
      }
    }

    if (!isDominated) survivors.push(items[i]);
  }

  return survivors;
}
