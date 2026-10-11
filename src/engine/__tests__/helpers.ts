import { bundle } from '../constants';
import { createGame } from '../game';
import { Rng } from '../rng';
import type { BuildingKind, GameState, ResourceBundle } from '../types';
import { RESOURCES } from '../types';

export const ALL_AI = ['parallax', 'helixa', 'ambulo', 'stacksmith'].map((companyId) => ({ companyId, isAI: true }));

/** An empty board in the main phase for player 0 (no opening placement). */
export function blankGame(seed = 42): GameState {
  const s = createGame({ seed, quickStart: false });
  return { ...s, phase: 'main', setup: null, turn: 1, currentPlayer: 0, log: [] };
}

/** Find an RNG state whose next two dice sum to `total`, and install it. */
export function withNextRoll(s: GameState, total: number): GameState {
  for (let seed = 1; seed < 100000; seed++) {
    const r = new Rng(seed);
    const d1 = r.int(6) + 1;
    const d2 = r.int(6) + 1;
    if (d1 + d2 === total) return { ...s, rng: seed };
  }
  throw new Error('no seed');
}

export function place(s: GameState, vertex: number, owner: number, kind: BuildingKind = 'cluster'): GameState {
  const buildings = s.buildings.slice();
  buildings[vertex] = { owner, kind };
  return { ...s, buildings };
}

export function road(s: GameState, edge: number, owner: number): GameState {
  const roads = s.roads.slice();
  roads[edge] = owner;
  return { ...s, roads };
}

/** Give a player an exact hand, keeping the market supply consistent. */
export function setHand(s: GameState, player: number, hand: Partial<ResourceBundle>): GameState {
  const full = bundle(hand);
  const bank = { ...s.bank };
  for (const r of RESOURCES) bank[r] += s.players[player].resources[r] - full[r];
  return { ...s, bank, players: s.players.map((p) => (p.id === player ? { ...p, resources: full } : p)) };
}

/** Total of every resource across hands + market: must always be 19 each. */
export function conservation(s: GameState): ResourceBundle {
  const out = { ...s.bank };
  for (const p of s.players) for (const r of RESOURCES) out[r] += p.resources[r];
  return out;
}

/** Find a tile of a given resource type with a production number. */
export function tileOf(s: GameState, type: string): number {
  return s.board.tiles.find((t) => t.type === type && t.number !== null)!.id;
}
