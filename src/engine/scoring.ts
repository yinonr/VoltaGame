import { LARGEST_PRIORITY_MIN, LONGEST_NETWORK_MIN } from './constants';
import { isFinanced } from './financing';
import type { GameState } from './types';

/** Longest trail of a player's connections; rival buildings cut the network. */
export function longestNetwork(state: GameState, player: number): number {
  const { board, roads, buildings } = state;
  const starts = new Set<number>();
  roads.forEach((owner, e) => {
    if (owner === player) {
      starts.add(board.edges[e].a);
      starts.add(board.edges[e].b);
    }
  });
  if (starts.size === 0) return 0;

  let best = 0;
  const used = new Set<number>();
  const dfs = (v: number, length: number) => {
    if (length > best) best = length;
    for (const e of board.vertices[v].edgeIds) {
      if (roads[e] !== player || used.has(e)) continue;
      const edge = board.edges[e];
      const next = edge.a === v ? edge.b : edge.a;
      used.add(e);
      const b = buildings[next];
      if (b && b.owner !== player) {
        if (length + 1 > best) best = length + 1;
      } else {
        dfs(next, length + 1);
      }
      used.delete(e);
    }
  };
  for (const v of starts) dfs(v, 0);
  return best;
}

/** Recompute the Longest Network holder (2 VP) using the familiar tie rules:
 *  the holder keeps it on a tie; if the holder is overtaken by a tie, nobody holds it. */
export function updateLongestNetwork(state: GameState): void {
  const lengths = state.players.map((p) => longestNetwork(state, p.id));
  const max = Math.max(...lengths);
  const holder = state.longestRoadHolder;
  if (holder !== null && lengths[holder] >= LONGEST_NETWORK_MIN && lengths[holder] === max) return;
  if (max < LONGEST_NETWORK_MIN) {
    state.longestRoadHolder = null;
    return;
  }
  const top = lengths.map((l, i) => (l === max ? i : -1)).filter((i) => i >= 0);
  state.longestRoadHolder = top.length === 1 ? top[0] : null;
}

/** After a player plays Infrastructure Priority: take the bonus if strictly ahead. */
export function updatePriorityAccess(state: GameState, player: number): void {
  const count = state.players[player].priorityPlayed;
  if (count < LARGEST_PRIORITY_MIN) return;
  const holder = state.largestArmyHolder;
  if (holder === null || (holder !== player && count > state.players[holder].priorityPlayed)) {
    state.largestArmyHolder = player;
  }
}

export interface ScoreBreakdown {
  clusters: number;
  /** Fully operational AI Factories (2 CP each). */
  factories: number;
  /** Financed AI Factories still owing committed units (1 CP each until complete). */
  financedFactories: number;
  longestNetwork: number;
  priorityAccess: number;
  breakthroughs: number;
  publicTotal: number;
  total: number;
}

export function scoreBreakdown(state: GameState, player: number): ScoreBreakdown {
  let clusters = 0;
  let factories = 0;
  let financedFactories = 0;
  for (const b of state.buildings) {
    if (b && b.owner === player) {
      if (b.kind === 'cluster') clusters++;
      else if (isFinanced(b)) financedFactories++;
      else factories++;
    }
  }
  const longest = state.longestRoadHolder === player ? 2 : 0;
  const priority = state.largestArmyHolder === player ? 2 : 0;
  const breakthroughs = state.players[player].devCards.filter((c) => c.type === 'breakthrough').length;
  const publicTotal = clusters + financedFactories + factories * 2 + longest + priority;
  return {
    clusters,
    factories,
    financedFactories,
    longestNetwork: longest,
    priorityAccess: priority,
    breakthroughs,
    publicTotal,
    total: publicTotal + breakthroughs,
  };
}

export function victoryPoints(state: GameState, player: number, includeHidden = true): number {
  const s = scoreBreakdown(state, player);
  return includeHidden ? s.total : s.publicTotal;
}
