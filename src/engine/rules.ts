import { COSTS, INTEGRATION_COST, PIECE_LIMITS, hasBundle, missingFor, describeBundle, sumBundle, BUILD_LABELS } from './constants';
import type { BuildType } from './constants';
import type { GameState, Resource } from './types';

// Pure legality queries. The reducer and the UI both use these, so the rules
// (and the explanations shown on disabled buttons) live in exactly one place.

export function piecesUsed(state: GameState, player: number) {
  let road = 0;
  let cluster = 0;
  let factory = 0;
  for (const r of state.roads) if (r === player) road++;
  for (const b of state.buildings) {
    if (b && b.owner === player) {
      if (b.kind === 'cluster') cluster++;
      else factory++;
    }
  }
  return { road, cluster, factory };
}

export function piecesLeft(state: GameState, player: number) {
  const used = piecesUsed(state, player);
  return {
    road: PIECE_LIMITS.road - used.road,
    cluster: PIECE_LIMITS.cluster - used.cluster,
    factory: PIECE_LIMITS.factory - used.factory,
  };
}

/** Distance rule: the vertex and all adjacent vertices must be empty. */
export function isVertexOpen(state: GameState, vertex: number): boolean {
  if (state.buildings[vertex]) return false;
  return state.board.vertices[vertex].neighborIds.every((n) => !state.buildings[n]);
}

function playerHasRoadAt(state: GameState, player: number, vertex: number): boolean {
  return state.board.vertices[vertex].edgeIds.some((e) => state.roads[e] === player);
}

export function legalSetupClusterVertices(state: GameState): number[] {
  return state.board.vertices.filter((v) => isVertexOpen(state, v.id)).map((v) => v.id);
}

export function legalSetupRoadEdges(state: GameState, vertex: number): number[] {
  return state.board.vertices[vertex].edgeIds.filter((e) => state.roads[e] === null);
}

export function legalClusterVertices(state: GameState, player: number): number[] {
  return state.board.vertices
    .filter((v) => isVertexOpen(state, v.id) && playerHasRoadAt(state, player, v.id))
    .map((v) => v.id);
}

/** A connection must touch the player's own building, or extend their network
 *  through a vertex that is not occupied by a rival. */
export function legalRoadEdges(state: GameState, player: number): number[] {
  const out: number[] = [];
  for (const e of state.board.edges) {
    if (state.roads[e.id] !== null) continue;
    for (const v of [e.a, e.b]) {
      const b = state.buildings[v];
      if (b && b.owner === player) {
        out.push(e.id);
        break;
      }
      if (!b && playerHasRoadAt(state, player, v)) {
        out.push(e.id);
        break;
      }
    }
  }
  return out;
}

export function legalFactoryVertices(state: GameState, player: number): number[] {
  const out: number[] = [];
  state.buildings.forEach((b, v) => {
    if (b && b.owner === player && b.kind === 'cluster') out.push(v);
  });
  return out;
}

export interface Check {
  ok: boolean;
  reason?: string;
}

const OK: Check = { ok: true };

function turnCheck(state: GameState, player: number): Check {
  if (state.phase === 'gameOver') return { ok: false, reason: 'The game is over.' };
  if (state.currentPlayer !== player) return { ok: false, reason: "It isn't your turn." };
  if (state.pendingTrade) return { ok: false, reason: 'Waiting for a trade response.' };
  if (state.phase === 'preRoll') return { ok: false, reason: 'Roll the dice first.' };
  if (state.phase === 'discard') return { ok: false, reason: 'Waiting for discards.' };
  if (state.phase === 'moveDisruption') return { ok: false, reason: 'Move the Grid Disruption first.' };
  if (state.phase === 'freeRoads') return { ok: false, reason: 'Place your free connections first.' };
  if (state.phase === 'setup') return { ok: false, reason: 'Finish the opening placement.' };
  return OK;
}

/** Can `player` build `type` right now? Returns a human-readable reason when not. */
export function checkBuild(state: GameState, player: number, type: BuildType): Check {
  const t = turnCheck(state, player);
  if (!t.ok) return t;
  const p = state.players[player];
  const left = piecesLeft(state, player);
  if (type === 'road' && left.road <= 0) return { ok: false, reason: 'All 15 connections are built.' };
  if (type === 'cluster' && left.cluster <= 0) return { ok: false, reason: 'All 5 clusters are on the board — upgrade one to a factory.' };
  if (type === 'factory' && left.factory <= 0) return { ok: false, reason: 'All 4 AI Factories are built.' };
  if (type === 'card' && state.devDeck.length === 0) return { ok: false, reason: 'No Innovation Cards left.' };
  if (!hasBundle(p.resources, COSTS[type])) {
    return { ok: false, reason: `Need ${describeBundle(missingFor(p.resources, COSTS[type]))} more.` };
  }
  if (type === 'road' && legalRoadEdges(state, player).length === 0) return { ok: false, reason: 'No open edge connects to your network.' };
  if (type === 'cluster' && legalClusterVertices(state, player).length === 0) {
    return { ok: false, reason: 'No legal site: extend a connection to an open corner 2+ steps from any building.' };
  }
  if (type === 'factory' && legalFactoryVertices(state, player).length === 0) return { ok: false, reason: 'Build a cluster to upgrade first.' };
  return OK;
}

export function bankRate(state: GameState, player: number, resource: Resource): number {
  let rate = 4;
  state.buildings.forEach((b, v) => {
    if (!b || b.owner !== player) return;
    const port = state.board.vertices[v].port;
    if (port === resource) rate = Math.min(rate, 2);
    else if (port === 'any') rate = Math.min(rate, 3);
  });
  return rate;
}

export function checkBankTrade(state: GameState, player: number, give: Resource, get: Resource): Check {
  const t = turnCheck(state, player);
  if (!t.ok) return t;
  if (give === get) return { ok: false, reason: 'Pick two different resources.' };
  const rate = bankRate(state, player, give);
  if (state.players[player].resources[give] < rate) return { ok: false, reason: `Need ${rate} to trade at ${rate}:1.` };
  if (state.bank[get] <= 0) return { ok: false, reason: 'The market is out of that resource.' };
  return OK;
}

export function checkTradePhase(state: GameState, player: number): Check {
  return turnCheck(state, player);
}

export function playableCards(state: GameState, player: number) {
  const p = state.players[player];
  return p.devCards.filter((c) => c.type !== 'breakthrough' && c.boughtOnTurn < state.turn);
}

export type PlayableCardType = 'priority' | 'expansion' | 'grant' | 'consolidation' | 'integration';

export function checkPlayCard(state: GameState, player: number, type: PlayableCardType): Check {
  if (state.phase === 'gameOver') return { ok: false, reason: 'The game is over.' };
  if (state.currentPlayer !== player) return { ok: false, reason: "It isn't your turn." };
  if (state.pendingTrade) return { ok: false, reason: 'Waiting for a trade response.' };
  const allowedPhase = type === 'priority' ? state.phase === 'preRoll' || state.phase === 'main' : state.phase === 'main';
  if (!allowedPhase) {
    return { ok: false, reason: type === 'priority' ? 'Play it before rolling or during your build phase.' : 'Roll the dice first.' };
  }
  if (state.devCardPlayedThisTurn) return { ok: false, reason: 'Only one Innovation Card per turn.' };
  const p = state.players[player];
  const owned = p.devCards.filter((c) => c.type === type);
  if (owned.length === 0) return { ok: false, reason: "You don't hold that card." };
  if (!owned.some((c) => c.boughtOnTurn < state.turn)) return { ok: false, reason: 'Cards bought this turn can be played next turn.' };
  if (type === 'expansion' && (piecesLeft(state, player).road <= 0 || legalRoadEdges(state, player).length === 0)) {
    return { ok: false, reason: 'No room for new connections.' };
  }
  if (type === 'grant' && sumBundle(state.bank) === 0) return { ok: false, reason: 'The market is empty.' };
  if (type === 'integration') {
    if (piecesLeft(state, player).factory <= 0) return { ok: false, reason: 'All 4 AI Factories are built.' };
    if (legalClusterVertices(state, player).length === 0) return { ok: false, reason: 'No open site on your network.' };
    if (!hasBundle(p.resources, INTEGRATION_COST)) {
      return { ok: false, reason: `Need ${describeBundle(missingFor(p.resources, INTEGRATION_COST))} more.` };
    }
  }
  return OK;
}

export { BUILD_LABELS };
