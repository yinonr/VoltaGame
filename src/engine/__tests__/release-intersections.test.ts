import { describe, expect, it } from 'vitest';
import { COMPUTE_RULES, INTEGRATED_DEPLOYMENT_COST, bundle } from '../constants';
import { applyAction } from '../game';
import { gridStatus } from '../grid';
import { victoryPoints } from '../scoring';
import type { GameState } from '../types';
import { blankGame, conservation, road, setHand, withNextRoll } from './helpers';

// Release QA: where two Settlers of Compute mechanics meet. The single mechanics have their own
// suites (financing, fullstack, grid); these pin the seams between them.

const NINETEEN = bundle({ power: 19, networking: 19, land: 19, capital: 19, gpu: 19 });

function computeGame(seed = 42): GameState {
  return { ...blankGame(seed), rules: { ...COMPUTE_RULES } };
}

function withBreakthroughs(s: GameState, player: number, n: number): GameState {
  const cards = Array.from({ length: n }, (_, i) => ({ id: 900 + i, type: 'breakthrough' as const, boughtOnTurn: 0 }));
  return { ...s, players: s.players.map((p) => (p.id === player ? { ...p, devCards: [...p.devCards, ...cards] } : p)) };
}

/** Player 0 has Full-Stack Integration, the Integrated Deployment cost and an open network site. */
function deployable(breakthroughs: number): { s: GameState; site: number } {
  let s = computeGame();
  const site = s.board.vertices.find((v) => v.tileIds.length === 3)!.id;
  s = road(s, s.board.vertices[site].edgeIds[0], 0);
  s = setHand(s, 0, INTEGRATED_DEPLOYMENT_COST);
  s = { ...s, players: s.players.map((p) => (p.id === 0 ? { ...p, fullStackTurn: 1 } : p)) };
  return { s: withBreakthroughs(s, 0, breakthroughs), site };
}

/** The current player rolls `total`. */
function roll(s: GameState, total: number): GameState {
  return applyAction(withNextRoll({ ...s, phase: 'preRoll', pendingTrade: null }, total), { type: 'ROLL' });
}

describe('Integrated Deployment and victory', () => {
  it('wins on the spot when the +2 CP reaches 10', () => {
    const { s, site } = deployable(8);
    expect(victoryPoints(s, 0)).toBe(8);
    const after = applyAction(s, { type: 'BUILD_INTEGRATED_FACTORY', vertex: site });
    expect(victoryPoints(after, 0)).toBe(10);
    expect(after.winner).toBe(0);
    expect(after.phase).toBe('gameOver');
    expect(conservation(after)).toEqual(NINETEEN);
  });

  it('does not end the game below 10 CP', () => {
    const { s, site } = deployable(7);
    const after = applyAction(s, { type: 'BUILD_INTEGRATED_FACTORY', vertex: site });
    expect(victoryPoints(after, 0)).toBe(9);
    expect(after.winner).toBeNull();
    expect(after.phase).toBe('main');
  });
});

describe('Infrastructure Financing during Grid Stability', () => {
  it('a financed factory keeps repaying while the grid stabilizes; a calm 7 repays nothing and disrupts nothing', () => {
    let s = computeGame(7);
    const home = s.board.tiles.find((t) => t.number !== null && t.number !== 7)!;
    const corner = home.vertexIds[0];
    // The outage goes to a hex that neither touches the factory nor shares its number.
    const away = s.board.tiles.find((t) => t.number !== null && t.number !== home.number && !t.vertexIds.includes(corner))!;
    const buildings = s.buildings.slice();
    buildings[corner] = { owner: 1, kind: 'factory', financed: 3 };
    s = { ...s, buildings };

    s = roll(s, 7);
    expect(s.phase).toBe('moveDisruption');
    s = applyAction(s, { type: 'MOVE_DISRUPTION', tile: away.id, victim: null });
    expect(gridStatus(s)).toMatchObject({ vulnerable: false, stableRolls: 6, outageTile: away.id });

    s = roll(s, home.number!);
    const owed = s.buildings[corner]!.financed!;
    expect(owed).toBeLessThan(3);
    expect(s.lastProduction!.deliveries?.length ?? 0).toBeGreaterThan(0);
    expect(gridStatus(s).stableRolls).toBe(5);

    const handBefore = s.players.map((p) => ({ ...p.resources }));
    s = roll(s, 7);
    expect(s.lastRoll!.stabilized).toBe(true);
    expect(s.phase).toBe('main');
    expect(s.disruptionTile).toBe(away.id);
    expect(s.buildings[corner]).toEqual({ owner: 1, kind: 'factory', financed: owed });
    expect(s.players.map((p) => p.resources)).toEqual(handBefore);
    expect(gridStatus(s).stableRolls).toBe(4);
    expect(conservation(s)).toEqual(NINETEEN);
  });
});
