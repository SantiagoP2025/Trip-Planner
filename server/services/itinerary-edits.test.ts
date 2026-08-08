import { describe, expect, it } from 'vitest';
import type { ItineraryDay, ItineraryItem } from '../types/itinerary.ts';
import {
  findItineraryItem,
  indexEditsByItemId,
  isMeaningfulEdit,
  normalizeEdit,
  toStoredEdit,
} from './itinerary-edits.ts';

function item(overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  return {
    id: 'dia-1-visit-museo',
    startTime: '2026-09-11T10:00:00.000Z',
    endTime: '2026-09-11T11:30:00.000Z',
    type: 'visit',
    title: 'Museo de la ciudad',
    description: 'Museo',
    durationMinutes: 90,
    verificationStatus: 'unverified',
    ...overrides,
  };
}

const ORIGINAL = item();

describe('normalizeEdit', () => {
  it('recorta los espacios', () => {
    expect(normalizeEdit({ title: '  La Tasquita  ' })).toEqual({ title: 'La Tasquita' });
  });

  // Vacío y solo espacios significan lo mismo: "aquí no he escrito nada".
  it('trata el texto vacío como ausente', () => {
    expect(normalizeEdit({ title: '', description: '   ' })).toEqual({});
  });

  it('no inventa campos que no llegaron', () => {
    expect(normalizeEdit({ title: 'Algo' })).toEqual({ title: 'Algo' });
  });
});

describe('isMeaningfulEdit', () => {
  it('acepta un texto distinto del original', () => {
    expect(isMeaningfulEdit(ORIGINAL, { title: 'Museo del Azulejo' })).toBe(true);
  });

  // "Una edición vacía o idéntica al original no cuenta como edición": es la
  // regla de esta fase y la que evita marcar como editado lo que no se tocó.
  it('rechaza una edición vacía', () => {
    expect(isMeaningfulEdit(ORIGINAL, {})).toBe(false);
    expect(isMeaningfulEdit(ORIGINAL, { title: '   ', description: '' })).toBe(false);
  });

  it('rechaza una edición idéntica al original', () => {
    expect(isMeaningfulEdit(ORIGINAL, { title: 'Museo de la ciudad' })).toBe(false);
    expect(
      isMeaningfulEdit(ORIGINAL, { title: 'Museo de la ciudad', description: 'Museo' }),
    ).toBe(false);
  });

  it('rechaza una edición que solo difiere en espacios', () => {
    expect(isMeaningfulEdit(ORIGINAL, { title: '  Museo de la ciudad  ' })).toBe(false);
  });

  it('acepta cambiar solo la descripción', () => {
    expect(isMeaningfulEdit(ORIGINAL, { description: 'Entrada gratis los domingos' })).toBe(true);
  });

  it('acepta escribir una descripción donde el original no tenía', () => {
    const sinDescripcion = item({ description: undefined });

    expect(isMeaningfulEdit(sinDescripcion, { description: 'La Tasquita, calle Mayor 3' })).toBe(
      true,
    );
  });
});

describe('toStoredEdit', () => {
  it('guarda solo lo que cambia', () => {
    expect(
      toStoredEdit(ORIGINAL, { title: 'Museo de la ciudad', description: 'Cierra a las 18:00' }),
    ).toEqual({ description: 'Cierra a las 18:00' });
  });

  it('guarda los dos campos cuando los dos cambian', () => {
    expect(toStoredEdit(ORIGINAL, { title: 'Otro sitio', description: 'Otra cosa' })).toEqual({
      title: 'Otro sitio',
      description: 'Otra cosa',
    });
  });

  // Devolver `null` es lo que el handler traduce en "vuelve al original".
  it('devuelve null cuando no queda nada que guardar', () => {
    expect(toStoredEdit(ORIGINAL, {})).toBeNull();
    expect(toStoredEdit(ORIGINAL, { title: 'Museo de la ciudad' })).toBeNull();
    expect(toStoredEdit(ORIGINAL, { title: '  ' })).toBeNull();
  });

  it('no toca el elemento original', () => {
    const original = item();
    toStoredEdit(original, { title: 'Otro sitio' });

    expect(original.title).toBe('Museo de la ciudad');
  });
});

describe('findItineraryItem', () => {
  const days: ItineraryDay[] = [
    { date: '2026-09-10', items: [item({ id: 'a' })] },
    { date: '2026-09-11', items: [item({ id: 'b' }), item({ id: 'c' })] },
  ];

  it('encuentra un elemento de cualquier día', () => {
    expect(findItineraryItem(days, 'c')?.id).toBe('c');
  });

  // Es la comprobación que impide llenar la tabla con identificadores
  // inventados: solo se edita lo que el motor ha generado.
  it('devuelve null si el identificador no existe', () => {
    expect(findItineraryItem(days, 'inventado')).toBeNull();
  });

  it('devuelve null con un itinerario vacío', () => {
    expect(findItineraryItem([], 'a')).toBeNull();
  });
});

describe('indexEditsByItemId', () => {
  it('indexa por elemento', () => {
    const index = indexEditsByItemId([
      { itemId: 'a', title: 'Uno', updatedAt: '2026-08-08T10:00:00.000Z' },
      { itemId: 'b', description: 'Dos', updatedAt: '2026-08-08T10:00:00.000Z' },
    ]);

    expect(index.get('a')?.title).toBe('Uno');
    expect(index.get('b')?.description).toBe('Dos');
    expect(index.get('c')).toBeUndefined();
  });

  it('con una lista vacía devuelve un índice vacío', () => {
    expect(indexEditsByItemId([]).size).toBe(0);
  });
});
