import type { ProposalType, TripScoreBreakdown } from '../types/trip.js';
import { rescoreForProfile } from './score-trip.js';

// Sección 10.6: tres perfiles, cada uno con sus pesos. El orden importa porque
// una combinación solo puede ocupar una propuesta: la recomendada elige primero
// porque la especificación la define como "mejor puntuación total"; económica y
// confort se quedan con la mejor de las restantes según sus propios pesos.
export const PROPOSAL_TYPES: readonly ProposalType[] = ['recommended', 'economical', 'comfort'];

export interface ProposalCandidate {
  id: string;
  flightId: string;
  accommodationId: string;
  scores: TripScoreBreakdown;
  estimatedTotal: number;
}

export interface SelectedProposal {
  type: ProposalType;
  rank: number;
  // Puntuación bajo los pesos de su propio perfil (sección 10.6).
  score: number;
  candidate: ProposalCandidate;
}

function isDifferentFlightAndAccommodation(a: ProposalCandidate, b: ProposalCandidate): boolean {
  return a.flightId !== b.flightId && a.accommodationId !== b.accommodationId;
}

function isDifferentInSomething(a: ProposalCandidate, b: ProposalCandidate): boolean {
  return a.flightId !== b.flightId || a.accommodationId !== b.accommodationId;
}

// Sección 10.6: "no se deben mostrar tres propuestas prácticamente idénticas".
// Se busca primero una que cambie vuelo y alojamiento; si no la hay, una que
// cambie al menos uno de los dos; y solo si tampoco, la mejor que quede. Así,
// con pocos candidatos se siguen devolviendo tres propuestas distintas entre sí
// en lugar de quedarse en una.
function pickCandidate(
  ranked: readonly { candidate: ProposalCandidate; score: number }[],
  usedIds: ReadonlySet<string>,
  alreadySelected: readonly ProposalCandidate[],
): { candidate: ProposalCandidate; score: number } | undefined {
  const available = ranked.filter((entry) => !usedIds.has(entry.candidate.id));
  if (available.length === 0) return undefined;

  return (
    available.find((entry) =>
      alreadySelected.every((selected) => isDifferentFlightAndAccommodation(entry.candidate, selected)),
    ) ??
    available.find((entry) =>
      alreadySelected.every((selected) => isDifferentInSomething(entry.candidate, selected)),
    ) ??
    available[0]
  );
}

// Sección 10.6: selección de las propuestas finales. Los candidatos ya vienen
// filtrados por restricciones duras (10.1), umbrales mínimos (10.4) y frontera
// de Pareto (10.5); aquí solo se elige y se ordena.
export function selectDiverseProposals(
  candidates: readonly ProposalCandidate[],
): SelectedProposal[] {
  const usedIds = new Set<string>();
  const selectedCandidates: ProposalCandidate[] = [];
  const selected: Omit<SelectedProposal, 'rank'>[] = [];

  for (const type of PROPOSAL_TYPES) {
    // Reponderar es O(1) por candidato: se hace una vez por perfil, antes de
    // ordenar, y no dentro del comparador (regla 6 de CLAUDE.md).
    const ranked = candidates
      .map((candidate) => ({ candidate, score: rescoreForProfile(candidate.scores, type) }))
      .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));

    const pick = pickCandidate(ranked, usedIds, selectedCandidates);
    if (!pick) break;

    usedIds.add(pick.candidate.id);
    selectedCandidates.push(pick.candidate);
    selected.push({ type, score: pick.score, candidate: pick.candidate });
  }

  // El rank se asigna con la puntuación global de la sección 10.2, que es la
  // única comparable entre perfiles: la de cada perfil usa pesos distintos.
  return [...selected]
    .sort((a, b) => b.candidate.scores.total - a.candidate.scores.total)
    .map((proposal, index) => ({ ...proposal, rank: index + 1 }));
}
