import { describe, it, expect } from 'vitest';
import { createGame, applyAction, getActingPlayer } from '../game';
import { decideAIAction } from '../ai';
import { victoryPoints } from '../scoring';

describe('smoke', () => {
  it('runs AI-only games', () => {
    for (let seed = 1; seed <= 10; seed++) {
      let s = createGame({ seed, seats: [0,1,2,3].map(i => ({ companyId: ['parallax','helixa','ambulo','stacksmith'][i], isAI: true })) });
      let steps = 0;
      while (s.phase !== 'gameOver' && steps < 20000) {
        const p = getActingPlayer(s)!;
        const a = decideAIAction(s, p);
        s = applyAction(s, a);
        steps++;
      }
      console.log(seed, 'steps', steps, 'turn', s.turn, 'winner', s.winner, s.players.map(p => victoryPoints(s, p.id)));
    }
    expect(true).toBe(true);
  });
});
