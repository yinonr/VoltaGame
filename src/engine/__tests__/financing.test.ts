import { describe, expect, it } from 'vitest';
import { decideAIAction } from '../ai';
import { CLASSIC_RULES, COMPUTE_RULES, FINANCING_COMMITMENT, FINANCING_COST, FINANCING_MAX_OUTSTANDING, bundle, pips, rulesOf } from '../constants';
import { checkFinancedUpgrade, checkRefinance, financedVertices, isFinanced, legalFinancingVertices, outputMultiplier, refinanceCost } from '../financing';
import { GameError, applyAction, createGame, getActingPlayer } from '../game';
import { checkBuild, piecesLeft } from '../rules';
import { scoreBreakdown, victoryPoints } from '../scoring';
import type { Building, GameState, Resource } from '../types';
import { ALL_AI, blankGame, conservation, place, setHand, withNextRoll } from './helpers';

const NINETEEN = bundle({ power: 19, networking: 19, land: 19, capital: 19, gpu: 19 });

/** Recursively freeze a state so any in-place mutation by the reducer throws (ES modules are strict). */
function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/** An empty board in player 0's main phase with Infrastructure Financing on. */
function financeGame(seed = 42): GameState {
  return { ...blankGame(seed), rules: { ...COMPUTE_RULES } };
}

function setBuilding(s: GameState, vertex: number, b: Building | null): GameState {
  const buildings = s.buildings.slice();
  buildings[vertex] = b;
  return { ...s, buildings };
}

function withBreakthroughs(s: GameState, player: number, n: number): GameState {
  const cards = Array.from({ length: n }, (_, i) => ({ id: 800 + i, type: 'breakthrough' as const, boughtOnTurn: 0 }));
  return { ...s, players: s.players.map((p) => (p.id === player ? { ...p, devCards: [...p.devCards, ...cards] } : p)) };
}

/** A corner touching three numbered hexes; `tile` is one of them, paying `resource` on `number`. */
function site(s: GameState) {
  const v = s.board.vertices.find((x) => x.tileIds.length === 3 && x.tileIds.every((t) => s.board.tiles[t].number !== null))!;
  const tile = s.board.tiles[v.tileIds[0]];
  return { v: v.id, tile: tile.id, number: tile.number!, resource: tile.type as Resource };
}

/** Corners that are neither `v` nor next to it (placement helpers ignore the distance rule anyway). */
function otherVertices(s: GameState, v: number, n: number): number[] {
  const near = new Set([v, ...s.board.vertices[v].neighborIds]);
  return s.board.vertices.filter((x) => !near.has(x.id)).slice(0, n).map((x) => x.id);
}

function rollFor(s: GameState, total: number, player = 0): GameState {
  return withNextRoll({ ...s, phase: 'preRoll', currentPlayer: player }, total);
}

describe('Infrastructure Financing — upgrade', () => {
  it('turns an own cluster into a financed AI Factory for 1 Capital + 2 GPUs', () => {
    let s = financeGame();
    const { v } = site(s);
    s = setHand(place(s, v, 0), 0, { capital: 1, gpu: 2, land: 1 });
    const cp = victoryPoints(s, 0);
    const left = piecesLeft(s, 0);
    expect(checkFinancedUpgrade(s, 0).ok).toBe(true);
    expect(legalFinancingVertices(s, 0)).toEqual([v]);

    const after = applyAction(deepFreeze(s), { type: 'BUILD_FINANCED_FACTORY', vertex: v });
    expect(after.buildings[v]).toEqual({ owner: 0, kind: 'factory', financed: FINANCING_COMMITMENT });
    expect(after.players[0].resources).toEqual(bundle({ land: 1 }));
    expect(victoryPoints(after, 0)).toBe(cp); // still 1 CP until the commitment is delivered
    expect(scoreBreakdown(after, 0)).toMatchObject({ clusters: 0, factories: 0, financedFactories: 1, publicTotal: 1 });
    expect(piecesLeft(after, 0)).toEqual({ road: left.road, cluster: left.cluster + 1, factory: left.factory - 1 });
    expect(after.devCardPlayedThisTurn).toBe(false);
    expect(after.log.at(-1)!.kind).toBe('finance');
    expect(conservation(after)).toEqual(NINETEEN);
  });

  it('explains every refusal', () => {
    let s = financeGame();
    const { v } = site(s);
    const [w] = otherVertices(s, v, 1);
    s = setHand(place(s, v, 0), 0, FINANCING_COST);

    const classic: GameState = { ...s, rules: undefined };
    expect(checkFinancedUpgrade(classic, 0).reason).toMatch(/off in Classic Mode/);
    expect(() => applyAction(classic, { type: 'BUILD_FINANCED_FACTORY', vertex: v })).toThrow(GameError);
    expect(checkFinancedUpgrade({ ...s, rules: { ...COMPUTE_RULES, financing: false } }, 0).ok).toBe(false);
    expect(legalFinancingVertices(classic, 0)).toEqual([]);

    expect(checkFinancedUpgrade({ ...s, phase: 'preRoll' }, 0).reason).toMatch(/Roll the dice/);
    expect(checkFinancedUpgrade(s, 1).reason).toMatch(/isn't your turn/);
    expect(checkFinancedUpgrade(setHand(s, 0, { gpu: 2 }), 0).reason).toBe('Need 1 Capital more.');
    expect(checkFinancedUpgrade(setHand(s, 0, { capital: 1, gpu: 1 }), 0).reason).toBe('Need 1 GPU more.');
    expect(checkFinancedUpgrade(setHand(financeGame(), 0, FINANCING_COST), 0).reason).toMatch(/Build a cluster/);

    // Only your own clusters: not a rival's, not an empty corner, not a factory.
    expect(() => applyAction(place(s, w, 1), { type: 'BUILD_FINANCED_FACTORY', vertex: w })).toThrow(GameError);
    expect(() => applyAction(s, { type: 'BUILD_FINANCED_FACTORY', vertex: w })).toThrow(GameError);
    expect(() => applyAction(place(s, w, 0, 'factory'), { type: 'BUILD_FINANCED_FACTORY', vertex: w })).toThrow(GameError);
  });

  it('uses a factory piece: refused once all 4 AI Factories are built', () => {
    let s = financeGame();
    const { v } = site(s);
    s = setHand(place(s, v, 0), 0, FINANCING_COST);
    for (const w of otherVertices(s, v, 3)) s = place(s, w, 0, 'factory');
    s = applyAction(s, { type: 'BUILD_FINANCED_FACTORY', vertex: v });
    expect(piecesLeft(s, 0).factory).toBe(0);
    const [extra] = otherVertices(s, v, 4).slice(3);
    s = setHand(place(s, extra, 0), 0, { capital: 4, gpu: 4 });
    expect(checkFinancedUpgrade(s, 0).reason).toBe('All 4 AI Factories are built.');
    expect(checkBuild(s, 0, 'factory').reason).toBe('All 4 AI Factories are built.');
  });

  it(`allows ${FINANCING_MAX_OUTSTANDING} outstanding financed factories, refuses one more, and frees a slot after refinancing`, () => {
    let s = financeGame();
    const { v } = site(s);
    const [a, b] = otherVertices(s, v, 2);
    s = place(place(place(s, v, 0), a, 0), b, 0);
    s = setHand(s, 0, { capital: 3, gpu: 6 });
    s = applyAction(s, { type: 'BUILD_FINANCED_FACTORY', vertex: v });
    s = applyAction(s, { type: 'BUILD_FINANCED_FACTORY', vertex: a });
    expect(financedVertices(s, 0).sort((x, y) => x - y)).toEqual([v, a].sort((x, y) => x - y));
    expect(checkFinancedUpgrade(s, 0).reason).toMatch(/already carry 2 financed factories/);
    expect(() => applyAction(s, { type: 'BUILD_FINANCED_FACTORY', vertex: b })).toThrow(GameError);

    s = setHand(s, 0, { capital: 1 + FINANCING_COMMITMENT, gpu: 2 });
    s = applyAction(s, { type: 'REFINANCE', vertex: v });
    expect(checkFinancedUpgrade(s, 0).ok).toBe(true);
    s = applyAction(s, { type: 'BUILD_FINANCED_FACTORY', vertex: b });
    expect(financedVertices(s, 0)).toHaveLength(2);
    expect(conservation(s)).toEqual(NINETEEN);
  });
});

describe('Infrastructure Financing — production commitments', () => {
  it('pays the owner 1 like a cluster and delivers 1 committed unit per payout (input never mutated)', () => {
    let s = financeGame();
    const { v, number, resource } = site(s);
    s = rollFor(setBuilding(s, v, { owner: 0, kind: 'factory', financed: 3 }), number);
    const frozen = deepFreeze(s);
    const after = applyAction(frozen, { type: 'ROLL' });
    expect(after.players[0].resources[resource]).toBe(1);
    expect(after.buildings[v]).toEqual({ owner: 0, kind: 'factory', financed: 2 });
    expect(frozen.buildings[v]).toEqual({ owner: 0, kind: 'factory', financed: 3 });
    expect(after.lastProduction!.deliveries).toEqual([{ player: 0, vertex: v, resource, left: 2 }]);
    expect(after.log.some((e) => e.kind === 'finance' && /\(2 left\)/.test(e.text))).toBe(true);
    expect(conservation(after)).toEqual(NINETEEN); // the committed unit never leaves the market
  });

  it('stalls under the Grid Disruption', () => {
    let s = financeGame();
    const { v, tile, number, resource } = site(s);
    s = rollFor({ ...setBuilding(s, v, { owner: 0, kind: 'factory', financed: 3 }), disruptionTile: tile }, number);
    const after = applyAction(s, { type: 'ROLL' });
    expect(after.players[0].resources[resource]).toBe(0);
    expect(after.buildings[v]!.financed).toBe(3);
    expect(after.lastProduction!.deliveries).toEqual([]);
  });

  it('stalls on a market shortage, including the sole-claimant partial payout', () => {
    let s = financeGame();
    const { v, tile, number, resource } = site(s);
    s = setBuilding(s, v, { owner: 0, kind: 'factory', financed: 3 });
    // Two claimants, 1 unit in the market: nobody collects, nothing is delivered.
    const rivalCorner = s.board.tiles[tile].vertexIds.find((x) => x !== v && !s.board.vertices[v].neighborIds.includes(x))!;
    let two = setHand(place(s, rivalCorner, 1), 3, { [resource]: 18 });
    two = applyAction(rollFor(two, number), { type: 'ROLL' });
    expect(two.lastProduction!.shortages).toContain(resource);
    expect(two.buildings[v]!.financed).toBe(3);
    expect(two.lastProduction!.deliveries).toEqual([]);
    // Sole claimant, empty market: takes what is left (nothing) and delivers nothing.
    let sole = setHand(s, 3, { [resource]: 19 });
    sole = applyAction(rollFor(sole, number), { type: 'ROLL' });
    expect(sole.lastProduction!.shortages).toContain(resource);
    expect(sole.buildings[v]!.financed).toBe(3);
    expect(conservation(sole)).toEqual(NINETEEN);
  });

  it('never causes a phantom shortage: the committed unit needs no market supply', () => {
    let s = financeGame();
    const { v, number, resource } = site(s);
    s = setHand(setBuilding(s, v, { owner: 0, kind: 'factory', financed: 3 }), 3, { [resource]: 18 }); // exactly 1 left
    const after = applyAction(rollFor(s, number), { type: 'ROLL' });
    expect(after.lastProduction!.shortages).toEqual([]);
    expect(after.players[0].resources[resource]).toBe(1);
    expect(after.buildings[v]!.financed).toBe(2);
  });

  it('becomes a full AI Factory after the last unit: field removed, 2 CP, double output', () => {
    let s = financeGame();
    const { v, number, resource } = site(s);
    s = setBuilding(s, v, { owner: 0, kind: 'factory', financed: 1 });
    const done = applyAction(rollFor(s, number), { type: 'ROLL' });
    expect(done.buildings[v]).toEqual({ owner: 0, kind: 'factory' });
    expect('financed' in done.buildings[v]!).toBe(false);
    expect(isFinanced(done.buildings[v])).toBe(false);
    expect(outputMultiplier(done.buildings[v]!)).toBe(2);
    expect(victoryPoints(done, 0)).toBe(2);
    expect(done.log.some((e) => e.kind === 'finance' && /fully delivered/.test(e.text))).toBe(true);
    const again = applyAction(rollFor(done, number), { type: 'ROLL' });
    expect(again.players[0].resources[resource] - done.players[0].resources[resource]).toBe(2);
  });

  it('completing on a rival roll wins only when the owner’s own turn starts', () => {
    let s = financeGame();
    const { v, number } = site(s);
    s = withBreakthroughs(setBuilding(s, v, { owner: 0, kind: 'factory', financed: 1 }), 0, 8);
    expect(victoryPoints(s, 0)).toBe(9);
    const rolled = applyAction(rollFor(s, number, 3), { type: 'ROLL' });
    expect(victoryPoints(rolled, 0)).toBe(10);
    expect(rolled.winner).toBeNull();
    const next = applyAction(rolled, { type: 'END_TURN' });
    expect(next.currentPlayer).toBe(0);
    expect(next.winner).toBe(0);
    expect(next.phase).toBe('gameOver');
  });

  it('completing on the owner’s own roll wins at once', () => {
    let s = financeGame();
    const { v, number } = site(s);
    s = withBreakthroughs(setBuilding(s, v, { owner: 0, kind: 'factory', financed: 1 }), 0, 8);
    const rolled = applyAction(rollFor(s, number, 0), { type: 'ROLL' });
    expect(rolled.winner).toBe(0);
  });
});

describe('Infrastructure Financing — refinancing', () => {
  it('costs 1 Capital per remaining unit, grants the CP at once, is not a card play, and works the same turn', () => {
    let s = financeGame();
    const { v } = site(s);
    s = setHand(place(s, v, 0), 0, { capital: 1 + FINANCING_COMMITMENT, gpu: 2 });
    s = applyAction(s, { type: 'BUILD_FINANCED_FACTORY', vertex: v });
    expect(refinanceCost(s, v)).toEqual(bundle({ capital: FINANCING_COMMITMENT }));
    expect(checkRefinance(s, 0, v).ok).toBe(true);
    const frozen = deepFreeze(s);
    const after = applyAction(frozen, { type: 'REFINANCE', vertex: v });
    expect(after.buildings[v]).toEqual({ owner: 0, kind: 'factory' });
    expect(frozen.buildings[v]!.financed).toBe(FINANCING_COMMITMENT);
    expect(after.players[0].resources).toEqual(bundle());
    expect(victoryPoints(after, 0)).toBe(2);
    expect(after.devCardPlayedThisTurn).toBe(false);
    expect(after.log.at(-1)!.kind).toBe('finance');
    expect(conservation(after)).toEqual(NINETEEN);
    // Allowed even after this turn's Innovation Card, and it leaves that flag alone.
    const carded = applyAction({ ...s, devCardPlayedThisTurn: true }, { type: 'REFINANCE', vertex: v });
    expect(carded.devCardPlayedThisTurn).toBe(true);
  });

  it('explains every refusal', () => {
    let s = financeGame();
    const { v } = site(s);
    const [w] = otherVertices(s, v, 1);
    s = setHand(setBuilding(s, v, { owner: 0, kind: 'factory', financed: 4 }), 0, { capital: 3 });
    expect(checkRefinance(s, 0, v).reason).toBe('Need 1 Capital more.');
    expect(() => applyAction(s, { type: 'REFINANCE', vertex: v })).toThrow(GameError);
    s = setHand(s, 0, { capital: 4 });
    expect(checkRefinance({ ...s, phase: 'preRoll' }, 0, v).reason).toMatch(/Roll the dice/);
    expect(checkRefinance(s, 1, v).reason).toMatch(/isn't your turn/);
    expect(checkRefinance(setBuilding(s, w, { owner: 1, kind: 'factory', financed: 2 }), 0, w).reason).toMatch(/your own/);
    expect(checkRefinance(setBuilding(s, w, { owner: 0, kind: 'factory' }), 0, w).reason).toMatch(/already fully delivered/);
    expect(checkRefinance(place(s, w, 0), 0, w).reason).toMatch(/Pick one of your financed/);
  });

  it('can win the game on the spot', () => {
    let s = financeGame();
    const { v } = site(s);
    s = setHand(withBreakthroughs(setBuilding(s, v, { owner: 0, kind: 'factory', financed: 2 }), 0, 8), 0, { capital: 2 });
    const after = applyAction(s, { type: 'REFINANCE', vertex: v });
    expect(after.winner).toBe(0);
    expect(after.phase).toBe('gameOver');
  });
});

describe('Infrastructure Financing — compatibility', () => {
  it('old saves (no rules field, plain factories) load as unfinanced Classic games', () => {
    let s = createGame({ seed: 5 });
    const v = s.buildings.findIndex((b) => b?.owner === 0);
    s = place(s, v, 0, 'factory');
    const { rules: _rules, ...legacy } = s;
    const loaded: GameState = JSON.parse(JSON.stringify(legacy));
    expect(loaded.rules).toBeUndefined();
    expect(rulesOf(loaded)).toEqual(CLASSIC_RULES);
    expect(isFinanced(loaded.buildings[v])).toBe(false);
    expect(outputMultiplier(loaded.buildings[v]!)).toBe(2);
    expect(scoreBreakdown(loaded, 0)).toMatchObject({ factories: 1, financedFactories: 0 });
    let t = applyAction(loaded, { type: 'ROLL' });
    if (t.phase === 'main') expect(() => applyAction(t, { type: 'BUILD_FINANCED_FACTORY', vertex: v })).toThrow(GameError);
    for (let i = 0; i < 200 && t.phase !== 'gameOver'; i++) t = applyAction(t, decideAIAction(t, getActingPlayer(t)!));
    expect(conservation(t)).toEqual(NINETEEN);
  });
});

describe('Infrastructure Financing — computer players', () => {
  function aiGame() {
    const s = financeGame(17);
    const players = s.players.map((p) => ({ ...p, isAI: true }));
    // The richest corner on the board: a site worth financing.
    const v = s.board.vertices.reduce((best, x) => {
      const score = (id: number) => s.board.vertices[id].tileIds.reduce((n, t) => n + pips(s.board.tiles[t].number), 0);
      return score(x.id) > score(best) ? x.id : best;
    }, 0);
    return { s: place({ ...s, players }, v, 0), v };
  }

  it('finances a strong site when short of Capital but holding the GPUs', () => {
    const { s, v } = aiGame();
    expect(decideAIAction(setHand(s, 0, { capital: 1, gpu: 2 }), 0)).toEqual({ type: 'BUILD_FINANCED_FACTORY', vertex: v });
  });

  it('prefers a standard upgrade when it can afford one', () => {
    const { s, v } = aiGame();
    expect(decideAIAction(setHand(s, 0, { capital: 3, gpu: 2 }), 0)).toEqual({ type: 'BUILD_FACTORY', vertex: v });
  });

  it('never finances in Classic Mode', () => {
    const { s } = aiGame();
    expect(decideAIAction(setHand({ ...s, rules: undefined }, 0, { capital: 1, gpu: 2 }), 0).type).not.toBe('BUILD_FINANCED_FACTORY');
  });

  it('refinances when that wins the game', () => {
    const { s, v } = aiGame();
    const t = setHand(withBreakthroughs(setBuilding(s, v, { owner: 0, kind: 'factory', financed: 2 }), 0, 8), 0, { capital: 2 });
    expect(decideAIAction(t, 0)).toEqual({ type: 'REFINANCE', vertex: v });
  });

  it('all-AI games with Financing finish, conserve resources, never mutate states, and use financing', () => {
    let games = 0;
    let withFinancing = 0;
    let delivered = 0;
    let refinanced = 0;
    for (let seed = 9300; seed < 9340; seed++) {
      let s = createGame({ seed, seats: ALL_AI, rules: COMPUTE_RULES });
      const freeze = seed < 9303; // the full freeze is slow; three games are enough to catch mutation
      let financed = false;
      let steps = 0;
      while (s.phase !== 'gameOver' && steps < 8000) {
        const a = decideAIAction(s, getActingPlayer(s)!);
        if (a.type === 'BUILD_FINANCED_FACTORY') financed = true;
        if (a.type === 'REFINANCE') refinanced++;
        s = applyAction(freeze ? deepFreeze(s) : s, a);
        delivered += s.lastProduction?.deliveries?.length ?? 0;
        for (const b of s.buildings) if (b && 'financed' in b) expect(b.kind === 'factory' && b.financed! >= 1).toBe(true);
        steps++;
      }
      expect(s.phase, `seed ${seed}`).toBe('gameOver');
      expect(conservation(s), `seed ${seed}`).toEqual(NINETEEN);
      games++;
      if (financed) withFinancing++;
    }
    // Measured on these seeds: financing appears in every game; floors leave room for AI tuning.
    expect(withFinancing / games).toBeGreaterThanOrEqual(0.75);
    expect(delivered).toBeGreaterThan(games);
    expect(refinanced).toBeGreaterThan(0);
  }, 120000);
});
