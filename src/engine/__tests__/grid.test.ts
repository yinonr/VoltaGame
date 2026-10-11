import { describe, expect, it } from 'vitest';
import { decideAIAction } from '../ai';
import { COMPUTE_RULES, GRID_OUTAGE_ROLLS, GRID_STABILITY_ROLLS, bundle, rulesOf } from '../constants';
import { applyAction, createGame, getActingPlayer } from '../game';
import { gridStatus } from '../grid';
import { barrenTileId } from '../board';
import type { GameState } from '../types';
import { ALL_AI, blankGame, conservation, setHand, withNextRoll } from './helpers';

const NINETEEN = bundle({ power: 19, networking: 19, land: 19, capital: 19, gpu: 19 });

function computeGame(seed = 42): GameState {
  return { ...blankGame(seed), rules: { ...COMPUTE_RULES } };
}

/** The current player rolls `total` (any phase bookkeeping reset so rolls can be chained). */
function roll(s: GameState, total: number): GameState {
  return applyAction(withNextRoll({ ...s, phase: 'preRoll', pendingTrade: null }, total), { type: 'ROLL' });
}

/** A numbered hex and one of its corners. */
function target(s: GameState, skip: number[] = []) {
  const tile = s.board.tiles.find((t) => t.number !== null && t.type !== 'barren' && !skip.includes(t.id))!;
  return { tile: tile.id, number: tile.number!, corner: tile.vertexIds[0], resource: tile.type as Exclude<typeof tile.type, 'barren'> };
}

/** A natural 7 followed by moving the outage onto `tile` (nobody to rob there). */
function disrupt(s: GameState, tile: number): GameState {
  const rolled = roll(s, 7);
  expect(rolled.phase).toBe('moveDisruption');
  return applyAction(rolled, { type: 'MOVE_DISRUPTION', tile, victim: null });
}

/** A non-7 roll that touches nothing we watch (2 and 12 sit on one hex each). */
function quietRoll(s: GameState, avoid: number): GameState {
  return roll(s, avoid === 2 ? 12 : 2);
}

describe('Grid Stability — natural 7s', () => {
  it('Classic keeps every 7 disruptive and never adds grid timers', () => {
    let s = blankGame(42);
    const { tile } = target(s);
    s = disrupt(s, tile);
    expect(s.grid).toBeUndefined();
    const again = roll(s, 7);
    expect(again.phase).toBe('moveDisruption');
    expect(again.lastRoll!.stabilized).toBeUndefined();
    expect(gridStatus(again).enabled).toBe(false);
  });

  it('a disruption starts a 6-roll stabilization and a 4-roll outage', () => {
    const s0 = computeGame();
    const { tile } = target(s0);
    const s = disrupt(s0, tile);
    expect(s.disruptionTile).toBe(tile);
    expect(s.grid).toEqual({ stableRolls: GRID_STABILITY_ROLLS, outageRolls: GRID_OUTAGE_ROLLS });
    expect(gridStatus(s)).toMatchObject({ enabled: true, vulnerable: false, stableRolls: 6, outageTile: tile, outageRolls: 4 });
  });

  it('a 7 while stabilizing: no discard, no theft, no outage move, no production, and it still counts', () => {
    let s = computeGame();
    const { tile } = target(s);
    s = disrupt(s, tile);
    s = setHand(s, 0, { power: 5, gpu: 5 }); // over the hand limit
    const before = s;
    const after = roll(s, 7);
    expect(after.phase).toBe('main');
    expect(after.lastRoll!.stabilized).toBe(true);
    expect(after.lastProduction).toBeNull();
    expect(after.players[0].resources).toEqual(before.players[0].resources);
    expect(after.pendingDiscards.every((n) => n === 0)).toBe(true);
    expect(after.disruptionTile).toBe(tile);
    expect(after.grid).toEqual({ stableRolls: 5, outageRolls: 3 });
    expect(after.log.at(-1)!.text).toMatch(/stabilizing: no disruption .*5 protected rolls left/);
    expect(conservation(after)).toEqual(NINETEEN);
  });

  it('the 6th roll after a disruption is still protected; the 7th can disrupt again', () => {
    let s = computeGame();
    const { tile, number } = target(s);
    s = disrupt(s, tile);
    for (let i = 0; i < 5; i++) s = quietRoll(s, number);
    expect(s.grid!.stableRolls).toBe(1);
    s = roll(s, 7); // 6th roll: protected, and suppressed 7s do not restart the period
    expect(s.lastRoll!.stabilized).toBe(true);
    expect(s.grid!.stableRolls).toBe(0);
    expect(gridStatus(s).vulnerable).toBe(true);
    const seventh = roll(s, 7);
    expect(seventh.lastRoll!.stabilized).toBeUndefined();
    expect(seventh.phase).toBe('moveDisruption');
  });
});

describe('Grid Stability — outages', () => {
  it('blocks the hex for exactly 4 rolls, then the hex produces again', () => {
    let s = computeGame(7);
    const { tile, number, corner, resource } = target(s);
    const buildings = s.buildings.slice();
    buildings[corner] = { owner: 1, kind: 'cluster' };
    s = disrupt({ ...s, buildings }, tile);
    for (let i = 1; i <= GRID_OUTAGE_ROLLS; i++) {
      s = roll(s, number);
      expect(s.players[1].resources[resource], `blocked roll ${i}`).toBe(0);
    }
    expect(s.disruptionTile).toBe(barrenTileId(s.board)); // expired after the 4th roll resolved
    expect(s.grid!.outageRolls).toBe(0);
    expect(s.log.some((e) => /Grid restored/.test(e.text))).toBe(true);
    s = roll(s, number);
    expect(s.players[1].resources[resource]).toBe(1);
    expect(conservation(s)).toEqual(NINETEEN);
  });

  it('7s count toward the outage countdown too', () => {
    let s = computeGame();
    const { tile } = target(s);
    s = disrupt(s, tile);
    for (let i = 0; i < GRID_OUTAGE_ROLLS; i++) s = roll(s, 7); // all protected
    expect(s.disruptionTile).toBe(barrenTileId(s.board));
    expect(s.grid).toEqual({ stableRolls: 2, outageRolls: 0 });
  });

  it('a financed factory repays nothing while blocked and resumes after the outage expires', () => {
    let s = computeGame(7);
    const { tile, number, corner, resource } = target(s);
    const buildings = s.buildings.slice();
    buildings[corner] = { owner: 1, kind: 'factory', financed: 3 };
    s = disrupt({ ...s, buildings }, tile);
    for (let i = 0; i < GRID_OUTAGE_ROLLS; i++) {
      s = roll(s, number);
      expect(s.buildings[corner]).toEqual({ owner: 1, kind: 'factory', financed: 3 });
      expect(s.lastProduction!.deliveries).toEqual([]);
    }
    s = roll(s, number);
    expect(s.buildings[corner]).toEqual({ owner: 1, kind: 'factory', financed: 2 });
    expect(s.players[1].resources[resource]).toBe(1);
    expect(conservation(s)).toEqual(NINETEEN);
  });
});

describe('Grid Stability — Infrastructure Priority', () => {
  function withPriority(s: GameState): GameState {
    return { ...s, players: s.players.map((p) => (p.id === 0 ? { ...p, devCards: [{ id: 500, type: 'priority' as const, boughtOnTurn: 0 }] } : p)) };
  }

  it('bypasses stabilization, replaces the outage and restarts both timers', () => {
    let s = computeGame();
    const first = target(s);
    const second = target(s, [first.tile]);
    s = disrupt(s, first.tile);
    s = roll(s, first.number === 2 ? 12 : 2);
    expect(s.grid).toEqual({ stableRolls: 5, outageRolls: 3 });
    s = applyAction(withPriority({ ...s, devCardPlayedThisTurn: false }), { type: 'PLAY_PRIORITY' });
    expect(s.phase).toBe('moveDisruption');
    s = applyAction(s, { type: 'MOVE_DISRUPTION', tile: second.tile, victim: null });
    expect(s.disruptionTile).toBe(second.tile);
    expect(s.grid).toEqual({ stableRolls: GRID_STABILITY_ROLLS, outageRolls: GRID_OUTAGE_ROLLS });
  });

  it('works when no outage is active', () => {
    let s = withPriority({ ...computeGame(), phase: 'preRoll' });
    expect(gridStatus(s).outageTile).toBeNull();
    s = applyAction(s, { type: 'PLAY_PRIORITY' });
    const { tile } = target(s);
    s = applyAction(s, { type: 'MOVE_DISRUPTION', tile, victim: null });
    expect(s.grid).toEqual({ stableRolls: 6, outageRolls: 4 });
    expect(s.phase).toBe('preRoll');
  });
});

describe('Grid Stability — saves', () => {
  it('a save taken mid-countdown resumes exactly', () => {
    let s = computeGame(9);
    const { tile, number } = target(s);
    s = disrupt(s, tile);
    s = quietRoll(quietRoll(s, number), number); // 2 protected rolls used, outage 2 rolls from expiry
    const loaded: GameState = JSON.parse(JSON.stringify(s));
    expect(loaded.grid).toEqual({ stableRolls: 4, outageRolls: 2 });
    let a = s;
    let b = loaded;
    for (const t of [number, 7, number, 7]) {
      a = roll(a, t);
      b = roll(b, t);
    }
    expect(b).toEqual(a);
    expect(b.disruptionTile).toBe(barrenTileId(b.board));
  });

  it('a Compute save from before Grid Stability keeps its persistent outages and every-7 disruptions', () => {
    let s = computeGame();
    const { tile, number } = target(s);
    const { gridStability: _off, ...oldRules } = COMPUTE_RULES;
    s = { ...s, rules: oldRules, disruptionTile: tile };
    delete s.grid;
    const loaded: GameState = JSON.parse(JSON.stringify(s));
    expect(rulesOf(loaded).gridStability).toBeUndefined();
    let t = loaded;
    for (let i = 0; i < 6; i++) t = quietRoll(t, number);
    expect(t.disruptionTile).toBe(tile); // persistent, as in the rules the game started with
    expect(t.grid).toBeUndefined();
    expect(roll(t, 7).phase).toBe('moveDisruption');
  });

  it('a state with the rule on but no timers starts vulnerable, with a full countdown for an existing outage', () => {
    let s = computeGame();
    const { tile, number } = target(s);
    s = { ...s, disruptionTile: tile };
    expect(s.grid).toBeUndefined();
    expect(gridStatus(s)).toMatchObject({ vulnerable: true, outageTile: tile, outageRolls: GRID_OUTAGE_ROLLS });
    s = quietRoll(s, number);
    expect(s.grid).toEqual({ stableRolls: 0, outageRolls: 3 });
  });
});

describe('Grid Stability — full AI games', () => {
  it('finish, conserve resources, keep both timers in range, and suppress some 7s', () => {
    let natural = 0;
    let suppressed = 0;
    for (let seed = 4100; seed < 4120; seed++) {
      let s = createGame({ seed, seats: ALL_AI, rules: COMPUTE_RULES });
      let steps = 0;
      while (s.phase !== 'gameOver' && steps < 8000) {
        s = applyAction(s, decideAIAction(s, getActingPlayer(s)!));
        if (s.grid) {
          expect(s.grid.stableRolls).toBeGreaterThanOrEqual(0);
          expect(s.grid.stableRolls).toBeLessThanOrEqual(GRID_STABILITY_ROLLS);
          expect(s.grid.outageRolls).toBeLessThanOrEqual(GRID_OUTAGE_ROLLS);
          if (s.grid.outageRolls === 0) expect(s.board.tiles[s.disruptionTile].type).toBe('barren');
        }
        steps++;
      }
      for (const e of s.log) {
        if (/^Grid Disruption!/.test(e.text)) natural++;
        if (/stabilizing: no disruption/.test(e.text)) suppressed++;
      }
      expect(s.phase, `seed ${seed}`).toBe('gameOver');
      expect(conservation(s), `seed ${seed}`).toEqual(NINETEEN);
    }
    expect(natural).toBeGreaterThan(0);
    expect(suppressed).toBeGreaterThan(0);
  }, 120000);
});
