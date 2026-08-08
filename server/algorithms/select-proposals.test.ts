import { describe, expect, it } from 'vitest';
import type { TripScoreBreakdown } from '../types/trip.js';
import { rescoreForProfile } from './score-trip.js';
import { selectDiverseProposals, type ProposalCandidate } from './select-proposals.js';

function candidate(
  id: string,
  flightId: string,
  accommodationId: string,
  scores: Omit<TripScoreBreakdown, 'total'>,
  estimatedTotal: number,
): ProposalCandidate {
  const withTotal: TripScoreBreakdown = { ...scores, total: 0 };
  return {
    id,
    flightId,
    accommodationId,
    scores: { ...withTotal, total: rescoreForProfile(withTotal, 'recommended') },
    estimatedTotal,
  };
}

const barata = candidate(
  'barata',
  'f1',
  'h1',
  { price: 100, accommodationQuality: 55, location: 50, transportComfort: 45, usableTime: 50, preferenceMatch: 55 },
  900,
);

const equilibrada = candidate(
  'equilibrada',
  'f2',
  'h2',
  { price: 70, accommodationQuality: 80, location: 75, transportComfort: 70, usableTime: 70, preferenceMatch: 90 },
  1400,
);

const comoda = candidate(
  'comoda',
  'f3',
  'h3',
  { price: 30, accommodationQuality: 100, location: 95, transportComfort: 90, usableTime: 80, preferenceMatch: 80 },
  1900,
);

// Sección 17.1: "Selección de propuestas diversas".
describe('selectDiverseProposals', () => {
  it('devuelve una propuesta por perfil de la sección 10.6', () => {
    const selected = selectDiverseProposals([barata, equilibrada, comoda]);

    expect(selected).toHaveLength(3);
    expect(selected.map((proposal) => proposal.type).sort()).toEqual([
      'comfort',
      'economical',
      'recommended',
    ]);
  });

  it('cada perfil se lleva la propuesta que mejor encaja con sus pesos', () => {
    const selected = selectDiverseProposals([barata, equilibrada, comoda]);
    const byType = new Map(selected.map((proposal) => [proposal.type, proposal.candidate.id]));

    expect(byType.get('economical')).toBe('barata');
    expect(byType.get('recommended')).toBe('equilibrada');
    expect(byType.get('comfort')).toBe('comoda');
  });

  // Sección 10.6: la propuesta recomendada es la de "mejor puntuación total",
  // así que elige antes que las demás aunque otro perfil quiera la misma.
  it('la recomendada se queda con la mejor puntuación total', () => {
    const selected = selectDiverseProposals([barata, comoda]);
    const byType = new Map(selected.map((proposal) => [proposal.type, proposal.candidate.id]));

    expect(comoda.scores.total).toBeGreaterThan(barata.scores.total);
    expect(byType.get('recommended')).toBe('comoda');
    expect(byType.get('economical')).toBe('barata');
  });

  it('nunca repite la misma combinación en dos propuestas', () => {
    const selected = selectDiverseProposals([barata, equilibrada, comoda]);
    const ids = new Set(selected.map((proposal) => proposal.candidate.id));
    expect(ids.size).toBe(selected.length);
  });

  // Sección 10.6: "no se deben mostrar tres propuestas prácticamente idénticas".
  it('prefiere candidatos que cambien vuelo y alojamiento a la vez', () => {
    const clonBarata = candidate(
      'clon',
      barata.flightId,
      barata.accommodationId,
      { price: 99, accommodationQuality: 55, location: 50, transportComfort: 45, usableTime: 50, preferenceMatch: 55 },
      910,
    );

    const selected = selectDiverseProposals([barata, clonBarata, equilibrada, comoda]);
    const combinations = selected.map(
      (proposal) => `${proposal.candidate.flightId}|${proposal.candidate.accommodationId}`,
    );

    expect(new Set(combinations).size).toBe(3);
  });

  it('ordena por la puntuación global de la sección 10.2, no por perfil', () => {
    const selected = selectDiverseProposals([barata, equilibrada, comoda]);

    expect(selected.map((proposal) => proposal.rank)).toEqual([1, 2, 3]);
    for (let i = 1; i < selected.length; i += 1) {
      expect(selected[i - 1].candidate.scores.total).toBeGreaterThanOrEqual(
        selected[i].candidate.scores.total,
      );
    }
  });

  it('devuelve menos de tres propuestas si no hay candidatos suficientes', () => {
    expect(selectDiverseProposals([barata, equilibrada])).toHaveLength(2);
    expect(selectDiverseProposals([barata])).toHaveLength(1);
    expect(selectDiverseProposals([])).toEqual([]);
  });

  it('es una función pura: la misma entrada da siempre la misma selección', () => {
    const candidates = [barata, equilibrada, comoda];
    expect(selectDiverseProposals(candidates)).toEqual(selectDiverseProposals(candidates));
  });
});
