import { describe, expect, it } from 'vitest';
import { decideAIAction } from '../ai';
import { applyAction, createGame, getActingPlayer } from '../game';
import type { GameState, LogEntry } from '../types';
import { logNewestTurnFirst } from '../../ui/logOrder';
import { ALL_AI } from './helpers';

const e = (id: number, kind: LogEntry['kind'], text: string): LogEntry => ({ id, turn: 0, kind, player: null, text });

describe('Activity log order', () => {
  it('lists the newest turn first, each heading above its own events in the order they happened', () => {
    const log = [e(1, 'system', 'setup'), e(2, 'turn', 'Turn 1'), e(3, 'roll', 'a1'), e(4, 'build', 'a2'), e(5, 'turn', 'Turn 2'), e(6, 'roll', 'b1')];
    expect(logNewestTurnFirst(log).map((x) => x.text)).toEqual(['Turn 2', 'b1', 'Turn 1', 'a1', 'a2', 'setup']);
    expect(logNewestTurnFirst([])).toEqual([]);
  });

  it('in a real game every heading is followed by that turn’s player’s own roll', () => {
    let s: GameState = createGame({ seed: 11, seats: ALL_AI });
    for (let i = 0; i < 400 && s.phase !== 'gameOver' && s.turn < 9; i++) {
      const p = getActingPlayer(s);
      if (p === null) break;
      s = applyAction(s, decideAIAction(s, p));
    }
    const shown = logNewestTurnFirst(s.log);
    expect(shown[0].kind).toBe('turn');
    shown.forEach((x, i) => {
      if (x.kind !== 'turn') return;
      const firstRoll = shown.slice(i + 1).find((y) => y.kind === 'roll' || y.kind === 'turn');
      if (firstRoll?.kind === 'roll') expect(firstRoll.player, x.text).toBe(x.player);
    });
  });
});
