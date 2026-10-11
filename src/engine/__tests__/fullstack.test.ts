import { describe, expect, it } from 'vitest';
import { decideAIAction } from '../ai';
import { COMPUTE_RULES, INTEGRATED_DEPLOYMENT_COST, PIECE_LIMITS, RESOURCE_INFO, bundle, subBundle, sumBundle } from '../constants';
import {
  FULLSTACK_MIN_NETWORK,
  FULLSTACK_MIN_RESOURCE_TYPES,
  FULLSTACK_MIN_SITES,
  checkIntegratedDeployment,
  fullStackProgress,
  hasFullStack,
  largestConnectedNetwork,
  legalIntegratedVertices,
  touchedResourceTypes,
} from '../fullstack';
import { GameError, applyAction, createGame, getActingPlayer } from '../game';
import { checkPlayCard, isVertexOpen, legalClusterVertices, piecesLeft } from '../rules';
import { longestNetwork, victoryPoints } from '../scoring';
import type { Building, GameState, Resource, RuleOptions } from '../types';
import { RESOURCES } from '../types';
import { ALL_AI, blankGame, conservation, place, road, setHand, withNextRoll } from './helpers';

// Full-Stack Integration (rules.fullStack): four milestones unlock Integrated Deployment, permanently.

const NINETEEN = bundle({ power: 19, networking: 19, land: 19, capital: 19, gpu: 19 });

/** An empty board in player 0's main phase under the given rules (default COMPUTE_RULES; null = Classic, no `rules`). */
function game(rules: Partial<RuleOptions> | null = COMPUTE_RULES, seed = 42): GameState {
  const s = blankGame(seed);
  return rules ? { ...s, rules: { financing: false, fullStack: false, marketEvents: false, ...rules } } : s;
}

function put(s: GameState, vertex: number, b: Building): GameState {
  const buildings = s.buildings.slice();
  buildings[vertex] = b;
  return { ...s, buildings };
}

function roads(s: GameState, edges: number[], owner: number): GameState {
  return edges.reduce((st, e) => road(st, e, owner), s);
}

function unroad(s: GameState, edge: number): GameState {
  const r = s.roads.slice();
  r[edge] = null;
  return { ...s, roads: r };
}

/** The edge at `v` that is not one of `used` (an interior corner has three). */
function spurAt(s: GameState, v: number, used: number[]): number | undefined {
  return s.board.vertices[v].edgeIds.find((e) => !used.includes(e));
}

function otherEnd(s: GameState, edge: number, v: number): number {
  const e = s.board.edges[edge];
  return e.a === v ? e.b : e.a;
}

/** A simple path of `n` edges from `start` (`vertices[0] === start`). */
function path(s: GameState, start: number, n: number): { vertices: number[]; edges: number[] } {
  const vertices = [start];
  const edges: number[] = [];
  const dfs = (): boolean => {
    if (edges.length === n) return true;
    const v = vertices[vertices.length - 1];
    for (const e of s.board.vertices[v].edgeIds) {
      const w = otherEnd(s, e, v);
      if (vertices.includes(w)) continue;
      vertices.push(w);
      edges.push(e);
      if (dfs()) return true;
      vertices.pop();
      edges.pop();
    }
    return false;
  };
  if (!dfs()) throw new Error('no path');
  return { vertices, edges };
}

/** Numbered, non-barren resource types touching a vertex. */
function typesAt(s: GameState, v: number): Resource[] {
  const out = new Set<Resource>();
  for (const t of s.board.vertices[v].tileIds) {
    const tile = s.board.tiles[t];
    if (tile.type !== 'barren' && tile.number !== null) out.add(tile.type);
  }
  return [...out];
}

/** An interior corner (3 neighbours) touching 3 numbered hexes. */
function interiorVertex(s: GameState, skip: (v: number) => boolean = () => false): number {
  return s.board.vertices.find((v) => v.neighborIds.length === 3 && v.tileIds.length === 3 && typesAt(s, v.id).length > 0 && !skip(v.id))!.id;
}

/** A path of `n` edges from an interior corner whose middle corner (vertices[2]) has a spur edge. */
function pathWithSpur(s: GameState, n: number): { vertices: number[]; edges: number[]; spur: number } {
  for (const v of s.board.vertices) {
    if (v.neighborIds.length !== 3 || v.tileIds.length !== 3 || typesAt(s, v.id).length === 0) continue;
    const p = path(s, v.id, n);
    const spur = spurAt(s, p.vertices[2], p.edges);
    if (spur !== undefined) return { ...p, spur };
  }
  throw new Error('no path');
}

interface Ready {
  s: GameState;
  /** Player 0's factory, at path.vertices[0]. */
  factory: number;
  /** Player 0's connections: path.edges (4 = FULLSTACK_MIN_NETWORK); path.spur is a free edge at vertices[2]. */
  path: { vertices: number[]; edges: number[]; spur: number };
  /** Player 0's two extra clusters. */
  clusters: number[];
}

/**
 * Player 0 meets all four milestones (not yet unlocked: no action has run): an unfinanced factory at the
 * start of a 4-connection path, two clusters well away from it, and 4+ resource types touched.
 */
function ready(rules: Partial<RuleOptions> | null = COMPUTE_RULES): Ready {
  let s = game(rules);
  const p = pathWithSpur(s, FULLSTACK_MIN_NETWORK);
  const factory = p.vertices[0];
  s = put(s, factory, { owner: 0, kind: 'factory' });
  s = roads(s, p.edges, 0);
  const nearPath = new Set(p.vertices.flatMap((v) => [v, ...s.board.vertices[v].neighborIds]));
  const candidates = s.board.vertices.map((v) => v.id).filter((v) => !nearPath.has(v));
  for (const a of candidates) {
    for (const b of candidates) {
      if (b <= a || s.board.vertices[a].neighborIds.includes(b)) continue;
      const types = new Set([...typesAt(s, factory), ...typesAt(s, a), ...typesAt(s, b)]);
      if (types.size < FULLSTACK_MIN_RESOURCE_TYPES || !isVertexOpen(s, a) || !isVertexOpen(s, b)) continue;
      s = place(place(s, a, 0), b, 0);
      return { s, factory, path: p, clusters: [a, b] };
    }
  }
  throw new Error('no fixture');
}

/** Run an action that triggers the reducer's Full-Stack hook (player 0 ends the turn). */
function endTurn(s: GameState): GameState {
  return applyAction(s, { type: 'END_TURN' });
}

function milestoneLogs(s: GameState, player: number) {
  return s.log.filter((l) => l.kind === 'milestone' && l.player === player);
}

/** Player 0 already unlocked (fullStackTurn set), a single open network site `site`, and 8 resources. */
function deployable(): { s: GameState; site: number } {
  let s = game();
  const site = interiorVertex(s);
  const edge = s.board.vertices[site].edgeIds[0];
  s = road(s, edge, 0);
  s = setHand(s, 0, INTEGRATED_DEPLOYMENT_COST);
  s = { ...s, players: s.players.map((p) => (p.id === 0 ? { ...p, fullStackTurn: 1 } : p)) };
  return { s, site };
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

describe('Full-Stack milestones', () => {
  it('lists the four milestones in order with labels and progress details', () => {
    const { s } = ready();
    const progress = fullStackProgress(s, 0);
    expect(progress.milestones.map((m) => m.id)).toEqual(['factory', 'sites', 'resources', 'network']);
    expect(progress.milestones.map((m) => m.label)).toEqual([
      'Operational AI Factory',
      'Three infrastructure sites',
      'Four resource types',
      'Connected network',
    ]);
    expect(progress.milestones.every((m) => m.done)).toBe(true);
    expect(progress).toMatchObject({ done: 4, total: 4, unlocked: false });
    expect(progress.milestones[1].detail).toBe('3 / 3 sites');
    expect(progress.milestones[3].detail).toBe('4 / 4 connections');
    const empty = fullStackProgress(game(), 1);
    expect(empty.done).toBe(0);
    expect(empty.milestones.map((m) => m.detail)).toEqual(['0 / 1', '0 / 3 sites', '0 / 4', '0 / 4 connections']);
  });

  it('operational factory: a cluster or a financed factory does not count until it is delivered', () => {
    let s = game();
    const v = interiorVertex(s);
    s = place(s, v, 0);
    expect(fullStackProgress(s, 0).milestones[0]).toMatchObject({ done: false, detail: '0 / 1' });
    s = put(s, v, { owner: 0, kind: 'factory', financed: 3 });
    expect(fullStackProgress(s, 0).milestones[0]).toMatchObject({ done: false, detail: '0 / 1 · financed one still delivering' });
    s = put(s, v, { owner: 0, kind: 'factory' });
    expect(fullStackProgress(s, 0).milestones[0]).toMatchObject({ done: true, detail: '1 / 1' });
    // A rival's factory never counts.
    expect(fullStackProgress(put(game(), v, { owner: 1, kind: 'factory' }), 0).milestones[0].done).toBe(false);
  });

  it('three sites: clusters and factories count, financed factories included; 2 is not enough', () => {
    let s = game();
    const p = path(s, interiorVertex(s), 4);
    s = place(s, p.vertices[0], 0);
    s = put(s, p.vertices[2], { owner: 0, kind: 'factory', financed: 2 });
    expect(fullStackProgress(s, 0).milestones[1]).toMatchObject({ done: false, detail: '2 / 3 sites' });
    expect(FULLSTACK_MIN_SITES).toBe(3);
    s = put(s, p.vertices[4], { owner: 0, kind: 'factory' });
    expect(fullStackProgress(s, 0).milestones[1]).toMatchObject({ done: true, detail: '3 / 3 sites' });
    // A rival's building is not a site of ours.
    expect(fullStackProgress(place(s, p.vertices[4], 1), 0).milestones[1].done).toBe(false);
  });

  it('four resource types: adjacency to numbered hexes, not the hand; 3 is not enough', () => {
    let s = game();
    // Three own corners, each touching a single (different) resource type.
    const used = new Set<Resource>();
    for (const v of s.board.vertices) {
      const types = typesAt(s, v.id);
      if (used.size === 3 || types.length !== 1 || used.has(types[0]) || !isVertexOpen(s, v.id)) continue;
      used.add(types[0]);
      s = place(s, v.id, 0);
    }
    expect(used.size).toBe(3);
    const before = touchedResourceTypes(s, 0);
    expect(before).toHaveLength(3);
    // A full hand of every resource changes nothing: adjacency, not inventory.
    const rich = setHand(s, 0, { power: 3, networking: 3, land: 3, capital: 3, gpu: 3 });
    expect(fullStackProgress(rich, 0).milestones[2]).toMatchObject({ done: false });
    expect(fullStackProgress(rich, 0).milestones[2].detail).toBe(`3 / 4 · ${before.map((r) => RESOURCE_INFO[r].label).join(', ')}`);
    const missing = RESOURCES.find((r) => !before.includes(r))!;
    const fourth = s.board.vertices.find((v) => isVertexOpen(s, v.id) && typesAt(s, v.id).includes(missing))!.id;
    s = place(s, fourth, 0);
    expect(touchedResourceTypes(s, 0).length).toBeGreaterThanOrEqual(4);
    expect(fullStackProgress(s, 0).milestones[2].done).toBe(true);
  });

  it('four resource types: the outage marker is ignored and the Dead Zone never counts', () => {
    const { s } = ready();
    const types = touchedResourceTypes(s, 0);
    for (const b of s.buildings.map((x, v) => (x?.owner === 0 ? v : -1)).filter((v) => v >= 0)) {
      for (const t of s.board.vertices[b].tileIds) {
        const blocked = { ...s, disruptionTile: t };
        expect(touchedResourceTypes(blocked, 0)).toEqual(types);
      }
    }
    // A corner touching only the barren hex adds no type.
    const barren = s.board.tiles.find((t) => t.type === 'barren')!;
    expect(barren.number).toBeNull();
    const deadZoneOnly = barren.vertexIds.find((v) => typesAt(s, v).length === 0);
    if (deadZoneOnly !== undefined) expect(touchedResourceTypes(place(game(), deadZoneOnly, 0), 0)).toEqual([]);
  });

  it('connected network: 4 connections in one group; 3 is not enough; branches count (unlike Longest Network)', () => {
    let s = game();
    const p = path(s, interiorVertex(s), 3);
    s = roads(s, p.edges, 0);
    expect(largestConnectedNetwork(s, 0)).toBe(3);
    expect(fullStackProgress(s, 0).milestones[3]).toMatchObject({ done: false, detail: '3 / 4 connections' });
    // A fourth connection branching off the middle corner: a group of 4, but the longest trail stays 3.
    const mid = p.vertices[1];
    const branch = s.board.vertices[mid].edgeIds.find((e) => !p.edges.includes(e))!;
    s = road(s, branch, 0);
    expect(largestConnectedNetwork(s, 0)).toBe(4);
    expect(longestNetwork(s, 0)).toBe(3);
    expect(fullStackProgress(s, 0).milestones[3]).toMatchObject({ done: true, detail: '4 / 4 connections' });
    // Two separate groups of 2 (a 5-connection trail missing its middle one) are not a network of 4.
    const five = path(game(), interiorVertex(game()), 5);
    const apart = unroad(roads(game(), five.edges, 0), five.edges[2]);
    expect(largestConnectedNetwork(apart, 0)).toBe(2);
    expect(fullStackProgress(apart, 0).milestones[3].done).toBe(false);
  });

  it('connected network: a rival building on a corner cuts it; an own building does not', () => {
    let s = game();
    const p = path(s, interiorVertex(s), 4);
    s = roads(s, p.edges, 0);
    expect(largestConnectedNetwork(s, 0)).toBe(4);
    expect(largestConnectedNetwork(place(s, p.vertices[2], 0), 0)).toBe(4);
    const cut = place(s, p.vertices[2], 1);
    expect(largestConnectedNetwork(cut, 0)).toBe(2);
    expect(fullStackProgress(cut, 0).milestones[3].done).toBe(false);
    // Rival connections are never ours.
    expect(largestConnectedNetwork(s, 1)).toBe(0);
  });
});

describe('Full-Stack unlock', () => {
  it('unlocks after the next action, sets fullStackTurn once and logs it once', () => {
    const { s } = ready();
    expect(hasFullStack(s, 0)).toBe(false);
    const after = endTurn(s);
    expect(after.players[0].fullStackTurn).toBe(after.turn);
    expect(hasFullStack(after, 0)).toBe(true);
    expect(fullStackProgress(after, 0).unlocked).toBe(true);
    const logs = milestoneLogs(after, 0);
    expect(logs).toHaveLength(1);
    expect(logs[0].text).toBe(`${after.players[0].name} achieved Full-Stack Integration — Integrated Deployment unlocked.`);
    expect(logs[0].turn).toBe(after.turn);
    // Nobody else qualifies.
    expect(after.players.slice(1).every((p) => p.fullStackTurn === undefined)).toBe(true);
    // Later actions never re-stamp or re-log it.
    let t = applyAction(withNextRoll(after, 6), { type: 'ROLL' });
    t = applyAction(t, { type: 'END_TURN' });
    expect(t.players[0].fullStackTurn).toBe(after.turn);
    expect(milestoneLogs(t, 0)).toHaveLength(1);
  });

  it('is permanent: a rival cluster cutting the network later does not re-lock it', () => {
    const { s, path: p } = ready();
    let t = endTurn(s); // unlocks player 0; player 1 to move
    const unlockedOn = t.players[0].fullStackTurn;
    expect(unlockedOn).toBeDefined();
    // Player 1 builds a cluster in the middle of player 0's network (a real, legal build).
    const cutAt = p.vertices[2];
    t = road(t, p.spur, 1);
    t = setHand({ ...t, phase: 'main' }, 1, { power: 1, networking: 1, land: 1, capital: 1 });
    expect(legalClusterVertices(t, 1)).toContain(cutAt);
    t = applyAction(t, { type: 'BUILD_CLUSTER', vertex: cutAt });
    expect(t.buildings[cutAt]).toEqual({ owner: 1, kind: 'cluster' });
    const progress = fullStackProgress(t, 0);
    expect(progress.milestones[3].done).toBe(false);
    expect(progress.unlocked).toBe(true);
    expect(t.players[0].fullStackTurn).toBe(unlockedOn);
    expect(milestoneLogs(t, 0)).toHaveLength(1);
  });

  it("unlocks on another company's action: a financed factory completing on a rival's roll", () => {
    const fx = ready();
    const tile = fx.s.board.vertices[fx.factory].tileIds.map((t) => fx.s.board.tiles[t]).find((t) => t.type !== 'barren' && t.number !== null)!;
    let s = put(fx.s, fx.factory, { owner: 0, kind: 'factory', financed: 1 });
    s = { ...s, currentPlayer: 1, phase: 'preRoll' };
    expect(fullStackProgress(s, 0).milestones.filter((m) => !m.done).map((m) => m.id)).toEqual(['factory']);
    s = withNextRoll(s, tile.number!);
    const after = applyAction(s, { type: 'ROLL' });
    expect(after.lastRoll!.total).toBe(tile.number);
    expect(after.buildings[fx.factory]).toEqual({ owner: 0, kind: 'factory' });
    expect(after.currentPlayer).toBe(1);
    expect(after.players[0].fullStackTurn).toBe(after.turn);
    expect(milestoneLogs(after, 0)).toHaveLength(1);
    expect(conservation(after)).toEqual(NINETEEN);
  });

  it('does not unlock with three of four milestones (each boundary)', () => {
    const fx = ready();
    const remove = (st: GameState, v: number): GameState => {
      const buildings = st.buildings.slice();
      buildings[v] = null;
      return { ...st, buildings };
    };
    const cases: [string, GameState][] = [
      ['network', unroad(fx.s, fx.path.edges[3])], // 3 connections
      ['factory', put(fx.s, fx.factory, { owner: 0, kind: 'cluster' })],
      ['factory', put(fx.s, fx.factory, { owner: 0, kind: 'factory', financed: 3 })],
      ['sites', fx.clusters.map((c) => remove(fx.s, c)).find((st) => touchedResourceTypes(st, 0).length >= FULLSTACK_MIN_RESOURCE_TYPES)!],
    ];
    for (const [missing, s] of cases) {
      expect(s, missing).toBeDefined();
      expect(fullStackProgress(s, 0).milestones.filter((m) => !m.done).map((m) => m.id)).toEqual([missing]);
      const after = endTurn(s);
      expect(after.players[0].fullStackTurn, missing).toBeUndefined();
      expect(milestoneLogs(after, 0)).toHaveLength(0);
      expect(checkIntegratedDeployment(after, 0)).toEqual({ ok: false, reason: 'Unlock Full-Stack Integration first (3/4 milestones).' });
    }
  });

  it('Classic Mode and { fullStack: false } never unlock and refuse Integrated Deployment', () => {
    for (const rules of [null, { financing: true, fullStack: false }]) {
      const fx = ready(rules);
      const after = endTurn(fx.s);
      expect(after.players[0].fullStackTurn).toBeUndefined();
      expect(milestoneLogs(after, 0)).toHaveLength(0);
      // Even with a stamped status (e.g. a hand-edited save) and the full cost in hand, the rule is off.
      let s = setHand(fx.s, 0, INTEGRATED_DEPLOYMENT_COST);
      s = { ...s, players: s.players.map((p) => (p.id === 0 ? { ...p, fullStackTurn: 1 } : p)) };
      const site = legalClusterVertices(s, 0)[0];
      expect(site).toBeDefined();
      expect(legalIntegratedVertices(s, 0)).toEqual([]);
      const check = checkIntegratedDeployment(s, 0);
      expect(check.ok).toBe(false);
      expect(check.reason).toBe(rules ? 'Full-Stack Integration is off in this game.' : 'Full-Stack Integration is off in Classic Mode.');
      expect(() => applyAction(s, { type: 'BUILD_INTEGRATED_FACTORY', vertex: site })).toThrow(GameError);
    }
  });

  it('old saves: no fullStackTurn means locked; a stamped one survives a save round-trip', () => {
    const fx = ready();
    const saved = JSON.parse(JSON.stringify(fx.s)) as GameState;
    expect('fullStackTurn' in saved.players[0]).toBe(false);
    expect(hasFullStack(saved, 0)).toBe(false);
    expect(fullStackProgress(saved, 0).unlocked).toBe(false);
    const unlocked = endTurn(fx.s);
    const reloaded = JSON.parse(JSON.stringify(unlocked)) as GameState;
    expect(reloaded.players[0].fullStackTurn).toBe(unlocked.players[0].fullStackTurn);
    // A pre-rules save (no `rules` field) plays Classic: never unlocks.
    const classic: GameState = { ...fx.s };
    delete classic.rules;
    expect(endTurn(classic).players[0].fullStackTurn).toBeUndefined();
  });

  it('never unlocks during the opening draft', () => {
    let s = createGame({ seed: 5, seats: ALL_AI, quickStart: false, rules: COMPUTE_RULES });
    while (s.phase === 'setup') s = applyAction(s, decideAIAction(s, getActingPlayer(s)!));
    expect(s.players.every((p) => p.fullStackTurn === undefined)).toBe(true);
  });
});

describe('Integrated Deployment', () => {
  it('costs exactly 1 Power + 1 Networking + 1 Land + 3 Capital + 2 GPUs (8 resources)', () => {
    expect(INTEGRATED_DEPLOYMENT_COST).toEqual(bundle({ power: 1, networking: 1, land: 1, capital: 3, gpu: 2 }));
    expect(sumBundle(INTEGRATED_DEPLOYMENT_COST)).toBe(8);
    const { s, site } = deployable();
    expect(checkIntegratedDeployment(s, 0)).toEqual({ ok: true });
    for (const r of RESOURCES) {
      const short = setHand(s, 0, subBundle(INTEGRATED_DEPLOYMENT_COST, bundle({ [r]: 1 })));
      const check = checkIntegratedDeployment(short, 0);
      expect(check.ok, r).toBe(false);
      expect(check.reason).toBe(`Need 1 ${r === 'gpu' ? 'GPU' : RESOURCE_INFO[r].label} more.`);
      expect(() => applyAction(short, { type: 'BUILD_INTEGRATED_FACTORY', vertex: site })).toThrow(GameError);
    }
    // A standard upgrade's cost alone is not enough.
    expect(checkIntegratedDeployment(setHand(s, 0, { capital: 3, gpu: 2 }), 0).reason).toBe('Need 1 Power, 1 Networking, 1 Land more.');
  });

  it('deploys an unfinanced AI Factory on a new site: +2 CP, a factory piece and no cluster piece, cost to the market', () => {
    const { s, site } = deployable();
    const pieces = piecesLeft(s, 0);
    const after = applyAction(s, { type: 'BUILD_INTEGRATED_FACTORY', vertex: site });
    expect(after.buildings[site]).toEqual({ owner: 0, kind: 'factory' });
    expect('financed' in after.buildings[site]!).toBe(false);
    expect(victoryPoints(after, 0)).toBe(victoryPoints(s, 0) + 2);
    expect(piecesLeft(after, 0)).toEqual({ ...pieces, factory: pieces.factory - 1 });
    expect(sumBundle(after.players[0].resources)).toBe(0);
    for (const r of RESOURCES) expect(after.bank[r]).toBe(s.bank[r] + INTEGRATED_DEPLOYMENT_COST[r]);
    expect(conservation(after)).toEqual(NINETEEN);
    const log = after.log.filter((l) => l.kind === 'build' && l.player === 0).map((l) => l.text);
    expect(log).toContain(`${after.players[0].name} used Integrated Deployment: an AI Factory deployed straight onto a new site (+2 CP).`);
    expect(s.buildings[site]).toBeNull(); // input untouched
  });

  it('is repeatable and works with every cluster piece already on the board', () => {
    let { s, site } = deployable();
    const near = (v: number) => [v, ...s.board.vertices[v].neighborIds];
    const zone = (v: number) => new Set(near(v).flatMap(near));
    const first = zone(site);
    const site2 = interiorVertex(s, (v) => first.has(v) || near(v).some((n) => first.has(n)));
    s = road(s, s.board.vertices[site2].edgeIds[0], 0);
    const keepOut = new Set([...first, ...zone(site2)]);
    // Five clusters elsewhere: no cluster piece left, but Integrated Deployment needs none.
    let placed = 0;
    for (const v of s.board.vertices) {
      if (placed === PIECE_LIMITS.cluster) break;
      if (keepOut.has(v.id) || !isVertexOpen(s, v.id)) continue;
      s = place(s, v.id, 0);
      placed++;
    }
    expect(piecesLeft(s, 0).cluster).toBe(0);
    s = applyAction(s, { type: 'BUILD_INTEGRATED_FACTORY', vertex: site });
    expect(s.buildings[site]).toEqual({ owner: 0, kind: 'factory' });
    // A second one the same turn, on the second site, once paid for again.
    s = setHand(s, 0, INTEGRATED_DEPLOYMENT_COST);
    expect(legalIntegratedVertices(s, 0)).toContain(site2);
    s = applyAction(s, { type: 'BUILD_INTEGRATED_FACTORY', vertex: site2 });
    expect(s.buildings[site2]).toEqual({ owner: 0, kind: 'factory' });
    expect(piecesLeft(s, 0)).toMatchObject({ cluster: 0, factory: PIECE_LIMITS.factory - 2 });
    expect(conservation(s)).toEqual(NINETEEN);
  });

  it('is not a card play: an Innovation Card can still be played the same turn', () => {
    let { s, site } = deployable();
    s = { ...s, players: s.players.map((p) => (p.id === 0 ? { ...p, devCards: [{ id: 99, type: 'grant', boughtOnTurn: 0 }] } : p)) };
    const after = applyAction(s, { type: 'BUILD_INTEGRATED_FACTORY', vertex: site });
    expect(after.devCardPlayedThisTurn).toBe(false);
    expect(checkPlayCard(after, 0, 'grant').ok).toBe(true);
  });

  it('only onto open sites on the own network (distance rule, network), with readable reasons', () => {
    const { s, site } = deployable();
    expect(legalIntegratedVertices(s, 0)).toEqual(legalClusterVertices(s, 0));
    expect(legalIntegratedVertices(s, 0)).toContain(site);
    // Not on the network.
    const offNetwork = s.board.vertices.find((v) => isVertexOpen(s, v.id) && !legalClusterVertices(s, 0).includes(v.id))!.id;
    expect(() => applyAction(s, { type: 'BUILD_INTEGRATED_FACTORY', vertex: offNetwork })).toThrow(
      'Integrated Deployment needs an open site on your network, 2+ steps from any building.',
    );
    // Distance rule: a rival cluster next door closes the site (the far end of the connection stays open).
    const neighbour = s.board.vertices[site].neighborIds.find((n) => !s.board.vertices[n].edgeIds.some((e) => s.roads[e] === 0))!;
    const blocked = place(s, neighbour, 1);
    expect(legalIntegratedVertices(blocked, 0)).not.toContain(site);
    expect(legalIntegratedVertices(blocked, 0)).toHaveLength(1);
    expect(() => applyAction(blocked, { type: 'BUILD_INTEGRATED_FACTORY', vertex: site })).toThrow(GameError);
    // A rival cluster on the site itself closes both ends: no open site at all.
    const taken = place(s, site, 1);
    expect(legalIntegratedVertices(taken, 0)).toEqual([]);
    expect(checkIntegratedDeployment(taken, 0)).toEqual({ ok: false, reason: 'No open site on your network.' });
    expect(() => applyAction(taken, { type: 'BUILD_INTEGRATED_FACTORY', vertex: site })).toThrow(GameError);
  });

  it('needs a free AI Factory piece', () => {
    let { s } = deployable();
    const busy = new Set(legalClusterVertices(s, 0).flatMap((v) => [v, ...s.board.vertices[v].neighborIds]));
    let placed = 0;
    for (const v of s.board.vertices) {
      if (placed === PIECE_LIMITS.factory) break;
      if (busy.has(v.id) || !isVertexOpen(s, v.id)) continue;
      s = place(s, v.id, 0, 'factory');
      placed++;
    }
    expect(piecesLeft(s, 0).factory).toBe(0);
    expect(checkIntegratedDeployment(s, 0)).toEqual({ ok: false, reason: 'All 4 AI Factories are built.' });
    expect(() => applyAction(s, { type: 'BUILD_INTEGRATED_FACTORY', vertex: legalClusterVertices(s, 0)[0] })).toThrow(GameError);
  });

  it("only in the main phase of the company's own turn", () => {
    const { s, site } = deployable();
    const cases: [GameState, string][] = [
      [{ ...s, phase: 'preRoll' }, 'Roll the dice first.'],
      [{ ...s, currentPlayer: 1 }, "It isn't your turn."],
      [{ ...s, pendingTrade: { from: 0, to: 1, give: bundle({ power: 1 }), get: bundle({ land: 1 }) } }, 'Waiting for a trade response.'],
      [{ ...s, phase: 'moveDisruption' }, 'Move the Grid Disruption first.'],
    ];
    for (const [st, reason] of cases) {
      expect(checkIntegratedDeployment(st, 0)).toEqual({ ok: false, reason });
    }
    // Out of turn the reducer acts for the current player, who has not unlocked anything.
    expect(() => applyAction({ ...s, currentPlayer: 1 }, { type: 'BUILD_INTEGRATED_FACTORY', vertex: site })).toThrow(GameError);
    expect(() => applyAction({ ...s, phase: 'preRoll' }, { type: 'BUILD_INTEGRATED_FACTORY', vertex: site })).toThrow('Roll the dice first.');
  });

  it("recomputes Longest Network: deploying into a rival's trail cuts it", () => {
    const base = deployable().s;
    // Player 1 holds the Longest Network with a 5-connection trail; player 0 reaches its middle corner.
    let s: GameState = { ...game(), players: base.players, bank: base.bank };
    const trail = pathWithSpur(s, 5);
    const mid = trail.vertices[2];
    s = roads(s, trail.edges, 1);
    s = road(s, trail.spur, 0);
    s = { ...s, longestRoadHolder: 1 };
    expect(longestNetwork(s, 1)).toBe(5);
    expect(legalIntegratedVertices(s, 0)).toContain(mid);
    const after = applyAction(s, { type: 'BUILD_INTEGRATED_FACTORY', vertex: mid });
    expect(longestNetwork(after, 1)).toBeLessThan(5);
    expect(after.longestRoadHolder).toBeNull();
    expect(after.log.some((l) => l.text === `${after.players[1].name} lost the Longest Network.`)).toBe(true);
    expect(victoryPoints(after, 1)).toBe(0);
  });

  it('never mutates a frozen input state (unlock and deployment)', () => {
    const fx = ready();
    const frozen = deepFreeze(structuredClone(fx.s));
    const snapshot = structuredClone(frozen);
    const unlocked = endTurn(frozen);
    expect(unlocked.players[0].fullStackTurn).toBeDefined();
    expect(frozen).toEqual(snapshot);
    const { s, site } = deployable();
    const frozen2 = deepFreeze(structuredClone(s));
    const snapshot2 = structuredClone(frozen2);
    const after = applyAction(frozen2, { type: 'BUILD_INTEGRATED_FACTORY', vertex: site });
    expect(after.buildings[site]).toEqual({ owner: 0, kind: 'factory' });
    expect(frozen2).toEqual(snapshot2);
  });
});

describe('computer opponents under COMPUTE_RULES', () => {
  // Measured on seeds 1–24 (docs/FULLSTACK_CALIBRATION.md): 74 of 96 companies unlock, 10 Integrated
  // Deployments in 10 games. The floors below are conservative so AI tuning can move them a little.
  it('play legal games to a winner, conserve resources, unlock Full-Stack and use Integrated Deployment', () => {
    let deployments = 0;
    let unlocks = 0;
    for (let seed = 1; seed <= 24; seed++) {
      let s = createGame({ seed, seats: ALL_AI, rules: COMPUTE_RULES });
      let steps = 0;
      while (s.phase !== 'gameOver' && steps < 5000) {
        const action = decideAIAction(s, getActingPlayer(s)!);
        if (action.type === 'BUILD_INTEGRATED_FACTORY') deployments++;
        const before = s;
        s = applyAction(s, action); // throws if the AI ever proposes an illegal move
        steps++;
        // The reducer hook ran: whoever meets all four milestones is unlocked, and nobody unlocks without them.
        for (const p of s.players) {
          if (before.players[p.id].fullStackTurn !== undefined) continue;
          const all = fullStackProgress(s, p.id).done === 4;
          expect(p.fullStackTurn !== undefined, `seed ${seed} step ${steps} seat ${p.id}`).toBe(all);
          if (all) expect(p.fullStackTurn).toBe(s.turn);
        }
      }
      expect(s.phase, `seed ${seed}`).toBe('gameOver');
      expect(victoryPoints(s, s.winner!)).toBeGreaterThanOrEqual(10);
      expect(conservation(s), `seed ${seed}`).toEqual(NINETEEN);
      for (const p of s.players) {
        const logs = milestoneLogs(s, p.id);
        if (p.fullStackTurn === undefined) expect(logs).toHaveLength(0);
        else {
          unlocks++;
          expect(logs.length).toBeLessThanOrEqual(1); // exactly once (older entries may scroll out of the log)
        }
      }
    }
    expect(unlocks).toBeGreaterThanOrEqual(48);
    expect(deployments).toBeGreaterThanOrEqual(3);
  });

  it('Classic games never unlock Full-Stack', () => {
    for (let seed = 1; seed <= 4; seed++) {
      let s = createGame({ seed, seats: ALL_AI });
      while (s.phase !== 'gameOver') s = applyAction(s, decideAIAction(s, getActingPlayer(s)!));
      expect(s.players.every((p) => p.fullStackTurn === undefined)).toBe(true);
      expect(s.log.some((l) => l.kind === 'milestone')).toBe(false);
    }
  });
});
