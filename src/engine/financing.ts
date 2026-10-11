import type { Check } from './rules';
import type { Building, GameState, ResourceBundle } from './types';
import { GameError } from './mutate';

// Infrastructure Financing — the intentional alternative to a standard AI Factory upgrade
// (rules.financing). Spec: docs/VOLTA_SPECIAL_CARDS.md "Card B" (accounting, immutability,
// shortage gate) re-targeted from a random card to a deliberate build choice.
//
// OWNER: Financing engine agent. Everything below `outputMultiplier` is a stub to implement.

/** True when a building is a financed AI Factory that still owes committed units. */
export function isFinanced(b: Building | null | undefined): boolean {
  return !!b && b.kind === 'factory' && (b.financed ?? 0) > 0;
}

/** Output per adjacent producing hex: 2 for a full AI Factory, 1 for a cluster or a financed factory. */
export function outputMultiplier(b: Building): number {
  return b.kind === 'factory' && !isFinanced(b) ? 2 : 1;
}

/** Vertices of `player`'s financed factories that still owe units. */
export function financedVertices(state: GameState, player: number): number[] {
  const out: number[] = [];
  state.buildings.forEach((b, v) => {
    if (b && b.owner === player && isFinanced(b)) out.push(v);
  });
  return out;
}

/** Own clusters that may be upgraded with financing. STUB. */
export function legalFinancingVertices(_state: GameState, _player: number): number[] {
  return [];
}

/** Can `player` make a financed upgrade right now (ignoring which vertex)? STUB. */
export function checkFinancedUpgrade(_state: GameState, _player: number): Check {
  return { ok: false, reason: 'Infrastructure Financing is not available in this game.' };
}

/** Capital needed to refinance the factory at `vertex` (1 per remaining unit). STUB. */
export function refinanceCost(_state: GameState, _vertex: number): ResourceBundle {
  throw new Error('not implemented');
}

/** Can `player` refinance the financed factory at `vertex` right now? STUB. */
export function checkRefinance(_state: GameState, _player: number, _vertex: number): Check {
  return { ok: false, reason: 'Nothing to refinance.' };
}

/** Reducer body for BUILD_FINANCED_FACTORY. `s` is already cloned. STUB. */
export function applyFinancedUpgrade(_s: GameState, _actor: number, _vertex: number): void {
  throw new GameError('Infrastructure Financing is not available in this game.');
}

/** Reducer body for REFINANCE. `s` is already cloned. STUB. */
export function applyRefinance(_s: GameState, _actor: number, _vertex: number): void {
  throw new GameError('Nothing to refinance.');
}
