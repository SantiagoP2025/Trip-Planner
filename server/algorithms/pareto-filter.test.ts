import { describe, expect, it } from 'vitest';
import { dominates, filterDominated } from './pareto-filter.js';

interface Option {
  id: string;
  price: number;
  quality: number;
}

// Todos los criterios se comparan como "más es mejor" (sección 10.3).
const criteriaOf = (option: Option) => [option.price, option.quality];

// Sección 17.1: "Eliminación de dominadas".
describe('dominates', () => {
  it('domina quien es igual o mejor en todo y estrictamente mejor en algo', () => {
    expect(dominates([90, 80], [90, 70])).toBe(true);
    expect(dominates([90, 80], [80, 70])).toBe(true);
  });

  it('no domina quien empata en todos los criterios', () => {
    expect(dominates([90, 80], [90, 80])).toBe(false);
  });

  it('no domina quien es peor en algún criterio', () => {
    expect(dominates([90, 60], [80, 70])).toBe(false);
  });
});

describe('filterDominated', () => {
  it('elimina las opciones dominadas y conserva la frontera', () => {
    const options: Option[] = [
      { id: 'a', price: 90, quality: 60 },
      { id: 'b', price: 60, quality: 90 },
      { id: 'c', price: 50, quality: 50 }, // dominada por a y por b
      { id: 'd', price: 90, quality: 61 }, // domina a "a"
    ];

    const survivors = filterDominated(options, criteriaOf);
    expect(survivors.map((option) => option.id).sort()).toEqual(['b', 'd']);
  });

  it('conserva los empates exactos, porque ninguno domina al otro', () => {
    const options: Option[] = [
      { id: 'a', price: 70, quality: 70 },
      { id: 'b', price: 70, quality: 70 },
    ];
    expect(filterDominated(options, criteriaOf)).toHaveLength(2);
  });

  it('no elimina nada cuando ninguna opción domina a otra', () => {
    const options: Option[] = [
      { id: 'a', price: 95, quality: 40 },
      { id: 'b', price: 70, quality: 70 },
      { id: 'c', price: 40, quality: 95 },
    ];
    expect(filterDominated(options, criteriaOf)).toHaveLength(3);
  });

  it('no modifica el array de entrada', () => {
    const options: Option[] = [
      { id: 'a', price: 90, quality: 60 },
      { id: 'b', price: 50, quality: 50 },
    ];
    const copy = [...options];
    filterDominated(options, criteriaOf);
    expect(options).toEqual(copy);
  });

  it('con conjuntos vacíos o de un elemento devuelve lo que recibe', () => {
    expect(filterDominated([], criteriaOf)).toEqual([]);
    const single: Option[] = [{ id: 'a', price: 10, quality: 10 }];
    expect(filterDominated(single, criteriaOf)).toEqual(single);
  });
});
