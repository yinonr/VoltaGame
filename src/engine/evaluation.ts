import { bundle, pips } from './constants';
import { isVertexOpen, legalSetupClusterVertices } from './rules';
import type { GameState, Resource, ResourceBundle } from './types';
import { RESOURCES } from './types';

// Shared positional heuristics used by the computer players and by Quick Start.

export const BASE_RESOURCE_WEIGHT: Record<Resource, number> = {
  power: 1.0,
  networking: 1.0,
  land: 0.9,
  capital: 1.05,
  gpu: 1.1,
};

/** Expected production "pips" per resource for a player (factories count double). */
export function productionPips(state: GameState, player: number, ignoreDisruption = false): ResourceBundle {
  const out = bundle();
  state.buildings.forEach((b, v) => {
    if (!b || b.owner !== player) return;
    const mult = b.kind === 'factory' ? 2 : 1;
    for (const t of state.board.vertices[v].tileIds) {
      const tile = state.board.tiles[t];
      if (tile.type === 'barren') continue;
      if (!ignoreDisruption && t === state.disruptionTile) continue;
      out[tile.type] += pips(tile.number) * mult;
    }
  });
  return out;
}

export function totalPips(b: ResourceBundle): number {
  return RESOURCES.reduce((n, r) => n + b[r], 0);
}

/** How attractive is a vertex as a new cluster site for `player`? */
export function vertexValue(state: GameState, vertex: number, player: number, current?: ResourceBundle): number {
  const prod = current ?? productionPips(state, player, true);
  const v = state.board.vertices[vertex];
  let score = 0;
  const seen = new Set<Resource>();
  for (const t of v.tileIds) {
    const tile = state.board.tiles[t];
    if (tile.type === 'barren') continue;
    let value = pips(tile.number) * BASE_RESOURCE_WEIGHT[tile.type];
    if (t === state.disruptionTile) value *= 0.45;
    const have = prod[tile.type];
    if (have === 0) value *= 1.35;
    else if (have < 4) value *= 1.15;
    score += value;
    if (!seen.has(tile.type)) {
      seen.add(tile.type);
      if (have === 0) score += 1.2;
    }
  }
  if (v.port === 'any') score += 1.0;
  else if (v.port) score += 0.4 + 0.25 * prod[v.port];
  return score;
}

/** Best open vertex reachable two steps away through a given edge from `from`. */
export function bestVertexBeyondEdge(state: GameState, from: number, edgeId: number, player: number): number {
  const edge = state.board.edges[edgeId];
  const mid = edge.a === from ? edge.b : edge.a;
  let best = 0;
  if (isVertexOpen(state, mid)) best = Math.max(best, vertexValue(state, mid, player) * 0.6);
  for (const n of state.board.vertices[mid].neighborIds) {
    if (n === from) continue;
    if (isVertexOpen(state, n)) best = Math.max(best, vertexValue(state, n, player));
  }
  return best;
}

export function bestSetupVertex(state: GameState, player: number): number {
  const prod = productionPips(state, player, true);
  let best = -1;
  let bestScore = -Infinity;
  for (const v of legalSetupClusterVertices(state)) {
    const score = vertexValue(state, v, player, prod);
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

export function bestSetupRoad(state: GameState, player: number, vertex: number): number {
  let best = -1;
  let bestScore = -Infinity;
  for (const e of state.board.vertices[vertex].edgeIds) {
    if (state.roads[e] !== null) continue;
    const score = bestVertexBeyondEdge(state, vertex, e, player);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}
