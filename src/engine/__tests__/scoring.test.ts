import { describe, expect, it } from 'vitest';
import { COSTS } from '../constants';
import { buildGeometry } from '../board';
import { applyAction } from '../game';
import { legalClusterVertices } from '../rules';
import { longestNetwork, scoreBreakdown, updateLongestNetwork, victoryPoints } from '../scoring';
import type { GameState } from '../types';
import { blankGame, place, road, setHand } from './helpers';

/** A simple path of `n` connected edges, walking along the coastline. */
function path(s: GameState, n: number): { vertices: number[]; edges: number[] } {
  const coast = buildGeometry().coast;
  const edges = coast.slice(0, n);
  const first = s.board.edges[edges[0]];
  const second = s.board.edges[edges[1]];
  let cur = first.a === second.a || first.a === second.b ? first.b : first.a;
  const vertices = [cur];
  for (const e of edges) {
    const edge = s.board.edges[e];
    cur = edge.a === cur ? edge.b : edge.a;
    vertices.push(cur);
  }
  return { vertices, edges };
}

describe('Longest Network', () => {
  it('measures the longest connected trail', () => {
    let s = blankGame();
    const p = path(s, 6);
    for (const e of p.edges) s = road(s, e, 0);
    expect(longestNetwork(s, 0)).toBe(6);
  });

  it('awards +2 at 5 connections, keeps it on ties, and loses it when overtaken', () => {
    let s = blankGame();
    const p = path(s, 5);
    for (const e of p.edges) s = road(s, e, 0);
    updateLongestNetwork(s);
    expect(s.longestRoadHolder).toBe(0);
    expect(scoreBreakdown(s, 0).longestNetwork).toBe(2);
  });

  it("is cut by a rival's building in the middle of the trail", () => {
    let s = blankGame();
    const p = path(s, 6);
    for (const e of p.edges) s = road(s, e, 0);
    updateLongestNetwork(s);
    expect(s.longestRoadHolder).toBe(0);
    s = place(s, p.vertices[3], 1); // splits into 3 + 3
    expect(longestNetwork(s, 0)).toBe(3);
    updateLongestNetwork(s);
    expect(s.longestRoadHolder).toBeNull();
  });
});

describe('victory', () => {
  it('counts clusters 1, factories 2, bonuses 2 and secret breakthroughs 1', () => {
    let s = blankGame();
    s = place(s, 0, 0, 'cluster');
    s = place(s, 10, 0, 'factory');
    s = { ...s, longestRoadHolder: 0, largestArmyHolder: 0 };
    s = { ...s, players: s.players.map((p) => (p.id === 0 ? { ...p, devCards: [{ id: 1, type: 'breakthrough', boughtOnTurn: 0 }] } : p)) };
    const sb = scoreBreakdown(s, 0);
    expect(sb.publicTotal).toBe(1 + 2 + 2 + 2);
    expect(sb.total).toBe(8);
    expect(victoryPoints(s, 0, false)).toBe(7);
  });

  it('ends the game the moment the current player reaches 10 Compute Points', () => {
    let s = blankGame();
    // 4 factories (8) + a cluster with a free site next to it = 9 CP, then build a 10th point.
    const p = path(s, 2);
    s = place(s, p.vertices[0], 0, 'cluster');
    s = road(road(s, p.edges[0], 0), p.edges[1], 0);
    let placed = 0;
    for (const v of s.board.vertices) {
      if (placed === 4) break;
      if (v.id === p.vertices[0] || v.id === p.vertices[1] || v.id === p.vertices[2]) continue;
      if (s.board.vertices[v.id].neighborIds.some((n) => p.vertices.includes(n))) continue;
      if (s.buildings[v.id] || v.neighborIds.some((n) => s.buildings[n])) continue;
      s = place(s, v.id, 0, 'factory');
      placed++;
    }
    expect(victoryPoints(s, 0)).toBe(9);
    s = setHand(s, 0, COSTS.cluster);
    expect(legalClusterVertices(s, 0)).toContain(p.vertices[2]);
    const after = applyAction(s, { type: 'BUILD_CLUSTER', vertex: p.vertices[2] });
    expect(after.phase).toBe('gameOver');
    expect(after.winner).toBe(0);
    expect(() => applyAction(after, { type: 'END_TURN' })).toThrow(/over/);
  });

  it("does not award a win on another company's turn", () => {
    let s = blankGame();
    for (const v of [0, 10, 20, 30, 40]) s = place(s, v, 1, 'factory'); // 10 CP for player 1
    s = { ...s, currentPlayer: 0 };
    s = applyAction(s, { type: 'END_TURN' }); // player 1's turn begins
    expect(s.phase).toBe('gameOver');
    expect(s.winner).toBe(1);
  });
});
