import { barrenTileId } from './board';
import { GRID_OUTAGE_ROLLS, GRID_STABILITY_ROLLS, RESOURCE_INFO, rulesOf } from './constants';
import { addLog } from './mutate';
import type { GameState, GridState } from './types';

// Grid Stability (rules.gridStability, on in the Settlers of Compute rules, never in Classic).
// A Grid Disruption is a significant event instead of a constant interruption:
// - after a disruption the next GRID_STABILITY_ROLLS player rolls are protected: a natural 7
//   then causes no discard, no theft and no outage move (it still produces nothing);
// - an outage blocks its hex for the next GRID_OUTAGE_ROLLS rolls, then the marker returns to
//   the Dead Zone (which is how "no outage" is represented, so only one outage can ever exist);
// - every roll counts down both timers, 7s included; Infrastructure Priority bypasses the
//   stabilization, replaces the current outage and restarts both timers.
// The timers are plain numbers in GameState.grid: deterministic, serializable, no RNG.

/** Is a hex (other than the Dead Zone) currently offline? */
export function hasActiveOutage(state: GameState): boolean {
  return state.board.tiles[state.disruptionTile].type !== 'barren';
}

/**
 * The grid timers. A state without them (a game from before Grid Stability that has the rule
 * switched on, or the very first roll) starts vulnerable, and an outage already on the board
 * gets a full countdown.
 */
export function gridOf(state: GameState): GridState {
  // Clamp to whole numbers in range so an edited save can't create a permanent shield or outage.
  const clamp = (n: unknown, max: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(0, Math.floor(n))) : 0);
  const stableRolls = clamp(state.grid?.stableRolls, GRID_STABILITY_ROLLS);
  const outageRolls = clamp(state.grid?.outageRolls, GRID_OUTAGE_ROLLS);
  return { stableRolls, outageRolls: hasActiveOutage(state) && outageRolls === 0 ? GRID_OUTAGE_ROLLS : outageRolls };
}

/**
 * Reducer hook for MOVE_DISRUPTION (natural or card). A new outage on a real hex starts its 4-roll
 * countdown and a new stabilization period. Parking the marker on the Dead Zone just clears the
 * outage: it does not hand out a fresh 6-roll shield (a natural 7 already started one at the roll).
 */
export function startDisruption(s: GameState): void {
  s.grid = hasActiveOutage(s)
    ? { stableRolls: GRID_STABILITY_ROLLS, outageRolls: GRID_OUTAGE_ROLLS }
    : { stableRolls: gridOf(s).stableRolls, outageRolls: 0 };
}

/** Reducer hook after a natural 7 disrupts: stabilization starts with the next roll. */
export function stabilizeAfterNaturalDisruption(s: GameState): void {
  s.grid = { ...gridOf(s), stableRolls: GRID_STABILITY_ROLLS };
}

/** Reducer hook at the end of every ROLL: count both timers down; an outage that runs out expires. */
export function advanceGrid(s: GameState, grid: GridState): void {
  const outageRolls = Math.max(0, grid.outageRolls - 1);
  if (grid.outageRolls > 0 && outageRolls === 0 && hasActiveOutage(s)) {
    const tile = s.board.tiles[s.disruptionTile];
    s.disruptionTile = barrenTileId(s.board);
    if (tile.type !== 'barren') addLog(s, 'disruption', null, `Grid restored: the ${RESOURCE_INFO[tile.type].label} ${tile.number} hex is back online.`);
  }
  s.grid = { stableRolls: Math.max(0, grid.stableRolls - 1), outageRolls };
}

export interface GridStatus {
  /** Grid Stability is in play (false in Classic: show nothing). */
  enabled: boolean;
  /** A natural 7 would trigger a Grid Disruption now. */
  vulnerable: boolean;
  /** Protected rolls left (0 when vulnerable). */
  stableRolls: number;
  /** The hex currently offline, or null. */
  outageTile: number | null;
  /** Rolls until that outage expires (0 when there is none). */
  outageRolls: number;
}

export function gridStatus(state: GameState): GridStatus {
  const enabled = !!rulesOf(state).gridStability;
  const grid = gridOf(state);
  const outage = hasActiveOutage(state);
  return {
    enabled,
    vulnerable: enabled && grid.stableRolls === 0,
    stableRolls: enabled ? grid.stableRolls : 0,
    outageTile: outage ? state.disruptionTile : null,
    outageRolls: enabled && outage ? grid.outageRolls : 0,
  };
}
