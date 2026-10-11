import type { GameState, LogKind, ResourceBundle } from './types';
import { RESOURCES } from './types';

// Low-level helpers shared by the reducer (game.ts) and the feature modules it delegates to
// (financing.ts, fullstack.ts, events.ts). They only ever touch a state that the reducer has
// already cloned, so they may mutate it. Never call them on a state you did not clone.

export class GameError extends Error {}

const MAX_LOG = 400;

export function addLog(s: GameState, kind: LogKind, player: number | null, text: string): void {
  s.log.push({ id: s.nextLogId++, turn: s.turn, player, kind, text });
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
}

/** Move `cost` from a player's hand to the market supply. */
export function pay(s: GameState, player: number, cost: ResourceBundle): void {
  const p = s.players[player];
  for (const r of RESOURCES) {
    p.resources[r] -= cost[r];
    s.bank[r] += cost[r];
  }
}

/** Move `gain` from the market supply to a player's hand. */
export function gainFromBank(s: GameState, player: number, gain: ResourceBundle): void {
  const p = s.players[player];
  for (const r of RESOURCES) {
    p.resources[r] += gain[r];
    s.bank[r] -= gain[r];
  }
}

export function nameOf(s: GameState, player: number): string {
  return s.players[player].name;
}

/** Log a Longest Network change after `updateLongestNetwork(s)` (call it with the holder from before). */
export function announceLongest(s: GameState, before: number | null): void {
  const after = s.longestRoadHolder;
  if (after === before) return;
  if (after !== null) addLog(s, 'build', after, `${nameOf(s, after)} now has the Longest Network (+2 CP).`);
  else if (before !== null) addLog(s, 'build', before, `${nameOf(s, before)} lost the Longest Network.`);
}
