import { describe, expect, it } from 'vitest';
import { COSTS, PIECE_LIMITS, sumBundle } from '../constants';
import { applyAction, GameError } from '../game';
import { checkBuild, isVertexOpen, legalClusterVertices, legalRoadEdges } from '../rules';
import { victoryPoints } from '../scoring';
import { blankGame, conservation, place, road, setHand } from './helpers';

/** A corner, one of its edges, the far end of that edge, and a corner two steps away. */
function corridor(s: ReturnType<typeof blankGame>) {
  const start = s.board.vertices.find((v) => v.neighborIds.length === 3)!;
  const e1 = start.edgeIds[0];
  const edge1 = s.board.edges[e1];
  const mid = edge1.a === start.id ? edge1.b : edge1.a;
  const e2 = s.board.vertices[mid].edgeIds.find((e) => e !== e1)!;
  const edge2 = s.board.edges[e2];
  const far = edge2.a === mid ? edge2.b : edge2.a;
  return { start: start.id, e1, mid, e2, far };
}

describe('building costs, inventory and scoring', () => {
  it('deducts the exact cost for a connection and returns it to the market', () => {
    let s = blankGame();
    const c = corridor(s);
    s = place(s, c.start, 0);
    s = setHand(s, 0, { power: 2, networking: 1, land: 1 });
    const after = applyAction(s, { type: 'BUILD_ROAD', edge: c.e1 });
    expect(after.roads[c.e1]).toBe(0);
    expect(after.players[0].resources).toMatchObject({ power: 1, networking: 0, land: 1 });
    expect(after.bank.power).toBe(s.bank.power + 1);
    expect(conservation(after)).toEqual(conservation(s));
    expect(s.roads[c.e1]).toBeNull(); // input state untouched (immutability)
  });

  it('builds a cluster for 1 Power + 1 Networking + 1 Land + 1 Capital and scores 1 CP', () => {
    let s = blankGame();
    const c = corridor(s);
    s = place(s, c.start, 0);
    s = road(road(s, c.e1, 0), c.e2, 0);
    s = setHand(s, 0, { power: 1, networking: 1, land: 1, capital: 1 });
    expect(victoryPoints(s, 0)).toBe(1);
    const after = applyAction(s, { type: 'BUILD_CLUSTER', vertex: c.far });
    expect(after.buildings[c.far]).toEqual({ owner: 0, kind: 'cluster' });
    expect(sumBundle(after.players[0].resources)).toBe(0);
    expect(victoryPoints(after, 0)).toBe(2);
  });

  it('upgrades a cluster to an AI Factory for 3 Capital + 2 GPUs without double counting', () => {
    let s = blankGame();
    const c = corridor(s);
    s = place(s, c.start, 0);
    s = setHand(s, 0, { capital: 3, gpu: 2 });
    expect(victoryPoints(s, 0)).toBe(1);
    const after = applyAction(s, { type: 'BUILD_FACTORY', vertex: c.start });
    expect(after.buildings[c.start]).toEqual({ owner: 0, kind: 'factory' });
    expect(victoryPoints(after, 0)).toBe(2); // 2 total, replacing the cluster's 1
    expect(sumBundle(after.players[0].resources)).toBe(0);
  });

  it('rejects builds the player cannot afford, with an explanation', () => {
    let s = blankGame();
    const c = corridor(s);
    s = place(s, c.start, 0);
    s = setHand(s, 0, { capital: 2, gpu: 2 });
    const check = checkBuild(s, 0, 'factory');
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/Need 1 Capital/);
    expect(() => applyAction(s, { type: 'BUILD_FACTORY', vertex: c.start })).toThrow(GameError);
  });

  it('enforces piece limits', () => {
    let s = blankGame();
    // Five clusters already placed for player 0 → no more clusters.
    const spots: number[] = [];
    for (const v of s.board.vertices) {
      if (spots.length === PIECE_LIMITS.cluster) break;
      if (isVertexOpen(s, v.id)) {
        s = place(s, v.id, 0);
        spots.push(v.id);
      }
    }
    s = setHand(s, 0, COSTS.cluster);
    expect(checkBuild(s, 0, 'cluster').reason).toMatch(/All 5 clusters/);
  });

  it('sells Innovation Cards for 1 Land + 1 Capital + 1 GPU', () => {
    let s = blankGame();
    s = setHand(s, 0, { land: 1, capital: 1, gpu: 1 });
    const deck = s.devDeck.length;
    const after = applyAction(s, { type: 'BUY_CARD' });
    expect(after.devDeck).toHaveLength(deck - 1);
    expect(after.players[0].devCards).toHaveLength(1);
    expect(after.players[0].devCards[0].boughtOnTurn).toBe(s.turn);
    expect(sumBundle(after.players[0].resources)).toBe(0);
  });
});

describe('placement legality', () => {
  it('enforces the distance rule for clusters', () => {
    let s = blankGame();
    const c = corridor(s);
    s = place(s, c.start, 1);
    expect(isVertexOpen(s, c.start)).toBe(false);
    expect(isVertexOpen(s, c.mid)).toBe(false); // adjacent to a building
    expect(isVertexOpen(s, c.far)).toBe(true);
  });

  it('requires clusters to touch your own network', () => {
    let s = blankGame();
    const c = corridor(s);
    s = place(s, c.start, 0);
    s = setHand(s, 0, COSTS.cluster);
    expect(legalClusterVertices(s, 0)).not.toContain(c.far);
    expect(() => applyAction(s, { type: 'BUILD_CLUSTER', vertex: c.far })).toThrow(GameError);
    s = road(road(s, c.e1, 0), c.e2, 0);
    expect(legalClusterVertices(s, 0)).toContain(c.far);
    expect(legalClusterVertices(s, 0)).not.toContain(c.mid); // too close to own cluster
  });

  it('requires connections to extend your own network', () => {
    let s = blankGame();
    const c = corridor(s);
    s = place(s, c.start, 0);
    const legal = legalRoadEdges(s, 0);
    expect(legal).toContain(c.e1);
    expect(legal).not.toContain(c.e2); // not connected yet
    s = road(s, c.e1, 0);
    expect(legalRoadEdges(s, 0)).toContain(c.e2);
    expect(legalRoadEdges(s, 1)).not.toContain(c.e2);
  });

  it("does not let a network extend through a rival's building", () => {
    let s = blankGame();
    const c = corridor(s);
    s = place(s, c.start, 0);
    s = road(s, c.e1, 0);
    s = place(s, c.mid, 1); // rival builds at the end of our connection (test-only placement)
    expect(legalRoadEdges(s, 0)).not.toContain(c.e2);
  });

  it('rejects building on an occupied edge', () => {
    let s = blankGame();
    const c = corridor(s);
    s = place(s, c.start, 0);
    s = road(s, c.e1, 1);
    s = setHand(s, 0, COSTS.road);
    expect(() => applyAction(s, { type: 'BUILD_ROAD', edge: c.e1 })).toThrow(GameError);
  });
});
