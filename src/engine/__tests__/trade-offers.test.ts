import { describe, expect, it } from 'vitest';
import { decideAIAction, HUMAN_OFFER_EVERY_ROUNDS } from '../ai';
import { productionPips } from '../evaluation';
import { applyAction, createGame, DEFAULT_SEATS, getActingPlayer } from '../game';
import { victoryPoints } from '../scoring';
import type { GameState } from '../types';
import { RESOURCES } from '../types';
import { ALL_AI } from './helpers';

// Interruption fatigue: every AI offer to a human opens a modal. AI rivals now approach a human
// only on their offer rounds and only when the human is strictly the best partner; AI-to-AI
// trading (and so every all-AI game, seeded test and the Quick Demo) is unchanged.

/** Seat 0 is human; it plays like the AI but declines every offer made to it. */
function humanDeclinesGame(seed: number) {
  let s = createGame({ seed, seats: DEFAULT_SEATS });
  const offers: { state: GameState; from: number }[] = [];
  let steps = 0;
  while (s.phase !== 'gameOver' && steps < 6000) {
    const actor = getActingPlayer(s)!;
    let action = decideAIAction(s, actor);
    if (actor === 0 && s.pendingTrade?.to === 0) action = { type: 'RESPOND_TRADE', accept: false };
    if (action.type === 'PROPOSE_TRADE' && action.to === 0) offers.push({ state: s, from: actor });
    s = applyAction(s, action);
    steps++;
  }
  return { s, offers };
}

function allAIFingerprint(seed: number) {
  let s = createGame({ seed, seats: ALL_AI });
  let steps = 0;
  while (s.phase !== 'gameOver' && steps < 6000) {
    s = applyAction(s, decideAIAction(s, getActingPlayer(s)!));
    steps++;
  }
  return { turn: s.turn, winner: s.winner, cp: s.players.map((p) => victoryPoints(s, p.id)), steps, nextLogId: s.nextLogId, rng: s.rng };
}

describe('AI trade offers to humans', () => {
  it('are rare: about 2 per game instead of about 11 (30 seeds)', () => {
    // Measured before the change with the same driver and seeds 1–30: 326 offers (10.9 per game).
    // After: 66 (2.2 per game). Assert a robust bound well clear of the old rate.
    let total = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { s, offers } = humanDeclinesGame(seed);
      expect(s.phase, `seed ${seed}`).toBe('gameOver');
      total += offers.length;
    }
    expect(total).toBeLessThanOrEqual(100);
    expect(total).toBeGreaterThan(0); // humans still get the occasional deal
  });

  it('come only on the proposer’s offer rounds, and only when the human is strictly the best partner', () => {
    for (const seed of [4, 8, 9, 24, 29]) {
      for (const { state, from } of humanDeclinesGame(seed).offers) {
        const round = Math.floor((state.turn - 1) / state.players.length);
        expect((round + from) % HUMAN_OFFER_EVERY_ROUNDS).toBe(0);
        const action = decideAIAction(state, from);
        if (action.type !== 'PROPOSE_TRADE') throw new Error('expected an offer');
        const want = RESOURCES.find((r) => action.get[r] > 0)!;
        const humanProd = productionPips(state, 0, true)[want];
        for (const p of state.players) {
          if (!p.isAI || p.id === from || victoryPoints(state, p.id, false) >= 8) continue;
          expect(productionPips(state, p.id, true)[want]).toBeLessThan(humanProd);
        }
      }
    }
  });

  it('leave all-AI games byte-for-byte unchanged (fingerprints recorded before the change)', () => {
    expect(allAIFingerprint(55)).toEqual({ turn: 82, winner: 1, cp: [4, 11, 5, 7], steps: 366, nextLogId: 579, rng: 990226390 });
    expect(allAIFingerprint(2024)).toEqual({ turn: 52, winner: 3, cp: [6, 8, 7, 11], steps: 243, nextLogId: 374, rng: -194961250 });
  });
});
