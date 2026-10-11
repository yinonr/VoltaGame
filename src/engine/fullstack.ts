import type { Check } from './rules';
import type { GameState } from './types';
import { GameError } from './mutate';

// Full-Stack Integration — an earned, permanent company status (rules.fullStack). A company that
// has built across the whole stack (operational factory, several sites, broad resource access,
// a connected network) unlocks Integrated Deployment: an AI Factory straight onto an open site.
//
// OWNER: Full-Stack engine agent. Everything here is a stub to implement.

export type MilestoneId = 'factory' | 'sites' | 'resources' | 'network';

export interface Milestone {
  id: MilestoneId;
  /** Short label, e.g. "Operational AI Factory". */
  label: string;
  done: boolean;
  /** Progress text, e.g. "2 / 3 sites". */
  detail: string;
}

export interface FullStackProgress {
  milestones: Milestone[];
  done: number;
  total: number;
  unlocked: boolean;
}

/** Has `player` unlocked Full-Stack Integration? (Permanent once unlocked.) */
export function hasFullStack(state: GameState, player: number): boolean {
  return state.players[player].fullStackTurn !== undefined;
}

/** Milestone progress toward Full-Stack Integration. STUB. */
export function fullStackProgress(state: GameState, player: number): FullStackProgress {
  return { milestones: [], done: 0, total: 4, unlocked: hasFullStack(state, player) };
}

/** Reducer tail hook: unlock Full-Stack for every company that now meets all milestones. STUB (no-op). */
export function updateFullStack(_s: GameState): void {}

/** Open network sites where `player` may use Integrated Deployment. STUB. */
export function legalIntegratedVertices(_state: GameState, _player: number): number[] {
  return [];
}

/** Can `player` use Integrated Deployment right now (ignoring which vertex)? STUB. */
export function checkIntegratedDeployment(_state: GameState, _player: number): Check {
  return { ok: false, reason: 'Unlock Full-Stack Integration first.' };
}

/** Reducer body for BUILD_INTEGRATED_FACTORY. `s` is already cloned. STUB. */
export function applyIntegratedDeployment(_s: GameState, _actor: number, _vertex: number): void {
  throw new GameError('Unlock Full-Stack Integration first.');
}
