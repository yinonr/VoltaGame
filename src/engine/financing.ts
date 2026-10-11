import {
  FINANCING_COMMITMENT,
  FINANCING_COST,
  FINANCING_MAX_OUTSTANDING,
  bundle,
  describeBundle,
  hasBundle,
  missingFor,
  rulesOf,
} from './constants';
import type { Check } from './rules';
import { piecesLeft, turnCheck } from './rules';
import type { Building, GameState, ResourceBundle } from './types';
import { GameError, addLog, nameOf, pay } from './mutate';

// Infrastructure Financing — the intentional alternative to a standard AI Factory upgrade
// (rules.financing). Spec: docs/VOLTA_SPECIAL_CARDS.md "Card B" (accounting, immutability,
// shortage gate) re-targeted from a random card to a deliberate build choice.
//
// A financed upgrade turns an own cluster into `{ owner, kind: 'factory', financed: 3 }` for
// FINANCING_COST. Until its commitment is delivered (game.ts produce() decrements it one
// committed unit per payout) it produces and scores like a cluster; then it is a full factory.
// Refinancing pays the remaining units off in Capital. Neither is an Innovation Card play.

const OK: Check = { ok: true };

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

/** Own clusters that may be upgraded with financing (none while the rule is off). */
export function legalFinancingVertices(state: GameState, player: number): number[] {
  if (!rulesOf(state).financing) return [];
  const out: number[] = [];
  state.buildings.forEach((b, v) => {
    if (b && b.owner === player && b.kind === 'cluster') out.push(v);
  });
  return out;
}

/** Can `player` make a financed upgrade right now (ignoring which vertex)? Readable reason when not. */
export function checkFinancedUpgrade(state: GameState, player: number): Check {
  if (!rulesOf(state).financing) {
    const classic = !state.rules || (!state.rules.fullStack && !state.rules.marketEvents);
    return { ok: false, reason: classic ? 'Infrastructure Financing is off in Classic Mode.' : 'Infrastructure Financing is off in this game.' };
  }
  const t = turnCheck(state, player);
  if (!t.ok) return t;
  if (piecesLeft(state, player).factory <= 0) return { ok: false, reason: 'All 4 AI Factories are built.' };
  if (financedVertices(state, player).length >= FINANCING_MAX_OUTSTANDING) {
    return {
      ok: false,
      reason: `You already carry ${FINANCING_MAX_OUTSTANDING} financed factories — deliver or refinance one first.`,
    };
  }
  const p = state.players[player];
  if (!hasBundle(p.resources, FINANCING_COST)) {
    return { ok: false, reason: `Need ${describeBundle(missingFor(p.resources, FINANCING_COST))} more.` };
  }
  if (legalFinancingVertices(state, player).length === 0) return { ok: false, reason: 'Build a cluster to finance first.' };
  return OK;
}

/** Capital needed to refinance the factory at `vertex` (1 per remaining unit; nothing if it owes nothing). */
export function refinanceCost(state: GameState, vertex: number): ResourceBundle {
  const b = state.buildings[vertex];
  return bundle({ capital: isFinanced(b) ? b!.financed! : 0 });
}

/** Can `player` refinance the financed factory at `vertex` right now? Readable reason when not. */
export function checkRefinance(state: GameState, player: number, vertex: number): Check {
  const t = turnCheck(state, player);
  if (!t.ok) return t;
  const b = state.buildings[vertex];
  if (!b || b.kind !== 'factory') return { ok: false, reason: 'Pick one of your financed AI Factories.' };
  if (b.owner !== player) return { ok: false, reason: 'You can only refinance your own AI Factory.' };
  if (!isFinanced(b)) return { ok: false, reason: 'That AI Factory is already fully delivered.' };
  const cost = refinanceCost(state, vertex);
  const have = state.players[player].resources;
  if (!hasBundle(have, cost)) return { ok: false, reason: `Need ${describeBundle(missingFor(have, cost))} more.` };
  return OK;
}

/** Reducer body for BUILD_FINANCED_FACTORY. `s` is already cloned. */
export function applyFinancedUpgrade(s: GameState, actor: number, vertex: number): void {
  const check = checkFinancedUpgrade(s, actor);
  if (!check.ok) throw new GameError(check.reason);
  if (!legalFinancingVertices(s, actor).includes(vertex)) throw new GameError('Finance an upgrade of one of your own clusters.');
  pay(s, actor, FINANCING_COST);
  // A new object: Building objects are shared with earlier states.
  s.buildings[vertex] = { owner: actor, kind: 'factory', financed: FINANCING_COMMITMENT };
  addLog(
    s,
    'finance',
    actor,
    `${nameOf(s, actor)} financed an AI Factory upgrade for ${describeBundle(FINANCING_COST)}. It repays ${FINANCING_COMMITMENT} committed units from its own output, then runs at full power (+1 CP, double output).`,
  );
}

/** Reducer body for REFINANCE. `s` is already cloned. Not a card play: devCardPlayedThisTurn is untouched. */
export function applyRefinance(s: GameState, actor: number, vertex: number): void {
  const check = checkRefinance(s, actor, vertex);
  if (!check.ok) throw new GameError(check.reason);
  const cost = refinanceCost(s, vertex);
  pay(s, actor, cost);
  s.buildings[vertex] = { owner: actor, kind: 'factory' }; // field removed, never 0
  addLog(s, 'finance', actor, `${nameOf(s, actor)} refinanced a financed AI Factory for ${describeBundle(cost)}: now a full AI Factory (+1 CP, double output).`);
}
