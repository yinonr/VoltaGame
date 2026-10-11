import { describe, expect, it } from 'vitest';
import { decideAIAction } from '../ai';
import { buildDemoGame, createDemoGame, DEMO_HAND } from '../demo';
import { applyAction, createGame, getActingPlayer } from '../game';
import { checkBuild, legalClusterVertices } from '../rules';
import { victoryPoints } from '../scoring';
import { conservation, ALL_AI } from './helpers';
import { bundle } from '../constants';

function playOut(seed: number, maxSteps = 5000) {
  let s = createGame({ seed, seats: ALL_AI });
  let steps = 0;
  let maxActionsInTurn = 0;
  while (s.phase !== 'gameOver' && steps < maxSteps) {
    const actor = getActingPlayer(s)!;
    s = applyAction(s, decideAIAction(s, actor)); // throws if the AI ever proposes an illegal move
    maxActionsInTurn = Math.max(maxActionsInTurn, s.turnActionCount);
    steps++;
  }
  return { s, steps, maxActionsInTurn };
}

describe('computer opponents', () => {
  it('play complete, legal games to a winner without stalling', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 31, 77, 1234, 98765]) {
      const { s, steps, maxActionsInTurn } = playOut(seed);
      expect(s.phase, `seed ${seed}`).toBe('gameOver');
      expect(victoryPoints(s, s.winner!)).toBeGreaterThanOrEqual(10);
      expect(steps).toBeLessThan(5000);
      expect(maxActionsInTurn).toBeLessThan(40);
      expect(conservation(s)).toEqual(bundle({ power: 19, networking: 19, land: 19, capital: 19, gpu: 19 }));
    }
  });

  it('are deterministic for the same seed', () => {
    const a = playOut(55);
    const b = playOut(55);
    expect(a.steps).toBe(b.steps);
    expect(a.s.winner).toBe(b.s.winner);
    expect(a.s.log.map((l) => l.text)).toEqual(b.s.log.map((l) => l.text));
  });

  it('finish a single turn with END_TURN in a bounded number of actions', () => {
    let s = createGame({ seed: 12, seats: ALL_AI });
    const start = s.turn;
    let n = 0;
    while (s.turn === start && n < 100) {
      s = applyAction(s, decideAIAction(s, getActingPlayer(s)!));
      n++;
    }
    expect(s.turn).toBe(start + 1);
    expect(n).toBeLessThan(40);
  });
});

describe('Quick Demo', () => {
  it('is deterministic', () => {
    const a = buildDemoGame();
    const b = buildDemoGame();
    expect(a).toEqual(b);
    expect(createDemoGame()).toEqual(a);
  });

  it('hands the human a live midgame turn with a real choice', () => {
    const s = buildDemoGame();
    expect(s.players[0].isAI).toBe(false);
    expect(s.players.slice(1).every((p) => p.isAI)).toBe(true);
    expect(s.currentPlayer).toBe(0);
    expect(s.phase).toBe('main');
    expect(s.players[0].resources).toEqual(DEMO_HAND);
    for (const p of s.players) expect(s.buildings.some((b) => b?.owner === p.id)).toBe(true);
    expect(checkBuild(s, 0, 'cluster').ok).toBe(true);
    expect(checkBuild(s, 0, 'card').ok).toBe(true);
    expect(checkBuild(s, 0, 'factory').ok).toBe(false); // one GPU short — trade for it
    expect(conservation(s)).toEqual(bundle({ power: 19, networking: 19, land: 19, capital: 19, gpu: 19 }));
  });

  it('plays onward: build, end turn, and the AI rivals take real turns back to the human', () => {
    let s = buildDemoGame();
    const cp = victoryPoints(s, 0);
    const v = legalClusterVertices(s, 0)[0];
    s = applyAction(s, { type: 'BUILD_CLUSTER', vertex: v });
    expect(victoryPoints(s, 0)).toBe(cp + 1);
    s = applyAction(s, { type: 'END_TURN' });
    let guard = 0;
    while (s.phase !== 'gameOver' && !(s.currentPlayer === 0 && getActingPlayer(s) === 0) && guard < 500) {
      const actor = getActingPlayer(s)!;
      // The human only acts here if a rival offers a trade or a 7 forces a discard;
      // the AI heuristic stands in for those answers.
      s = applyAction(s, decideAIAction(s, actor));
      guard++;
    }
    expect(guard).toBeLessThan(500);
    if (s.phase !== 'gameOver') {
      expect(s.currentPlayer).toBe(0);
      expect(s.phase === 'preRoll' || s.phase === 'discard' || s.phase === 'main').toBe(true);
    }
  });
});
