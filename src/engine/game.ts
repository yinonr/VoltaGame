import { barrenTileId, createBoard } from './board';
import {
  BANK_SUPPLY_PER_RESOURCE,
  CLASSIC_RULES,
  COMPANIES,
  COSTS,
  DEV_CARD_INFO,
  DEV_DECK_COMPOSITION,
  HAND_LIMIT,
  INTEGRATION_COST,
  MAX_COMPANY_NAME,
  RESOURCE_INFO,
  VOLTA_CARD_COMPOSITION,
  VP_TO_WIN,
  bundle,
  companyById,
  describeBundle,
  hasBundle,
  pips,
  resourceLabel,
  sanitizeCompanyName,
  sumBundle,
} from './constants';
import { bestSetupRoad, bestSetupVertex } from './evaluation';
import { applyMarketEvents } from './events';
import { applyFinancedUpgrade, applyRefinance, isFinanced, outputMultiplier } from './financing';
import { applyIntegratedDeployment, updateFullStack } from './fullstack';
import { GameError, addLog, announceLongest, gainFromBank, nameOf, pay } from './mutate';
import { Rng, deriveSeed, randomSeed } from './rng';
import {
  bankRate,
  checkBankTrade,
  checkBuild,
  checkPlayCard,
  checkTradePhase,
  isVertexOpen,
  legalClusterVertices,
  legalFactoryVertices,
  legalRoadEdges,
  piecesLeft,
} from './rules';
import type { PlayableCardType } from './rules';
import { updateLongestNetwork, updatePriorityAccess, victoryPoints } from './scoring';
import type {
  Action,
  Delivery,
  DevCardType,
  GameState,
  Player,
  ProductionReport,
  Resource,
  ResourceBundle,
  RuleOptions,
} from './types';
import { RESOURCES } from './types';

export { GameError, addLog };

export interface SeatConfig {
  companyId: string;
  isAI: boolean;
  /** Custom display name (sanitized; defaults to the company's name). Display-only. */
  name?: string;
}

export interface NewGameOptions {
  seed?: number;
  seats?: SeatConfig[];
  /** Auto-place two clusters + connections per company (default true). */
  quickStart?: boolean;
  /** Shuffle the Volta special cards into the Innovation deck (default false). */
  voltaCards?: boolean;
  /** Rules variant (default: Classic, i.e. CLASSIC_RULES). Pass COMPUTE_RULES for the flagship game. */
  rules?: Partial<RuleOptions>;
}

export const DEFAULT_SEATS: SeatConfig[] = [
  { companyId: COMPANIES[0].id, isAI: false },
  { companyId: COMPANIES[1].id, isAI: true },
  { companyId: COMPANIES[2].id, isAI: true },
  { companyId: COMPANIES[3].id, isAI: true },
];

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

function snakeOrder(n: number): number[] {
  const forward = Array.from({ length: n }, (_, i) => i);
  return [...forward, ...forward.slice().reverse()];
}

function createBaseState(seed: number, seats: SeatConfig[], voltaCards = false, rules: RuleOptions = CLASSIC_RULES): GameState {
  const board = createBoard(seed);
  const rng = new Rng(deriveSeed(seed, 7));
  const deck: DevCardType[] = [];
  (Object.keys(DEV_DECK_COMPOSITION) as DevCardType[]).forEach((t) => {
    const extra = voltaCards ? (VOLTA_CARD_COMPOSITION[t] ?? 0) : 0;
    for (let i = 0; i < DEV_DECK_COMPOSITION[t] + extra; i++) deck.push(t);
  });
  const names = displayNames(seats);
  const players: Player[] = seats.map((seat, i) => ({
    id: i,
    companyId: seat.companyId,
    name: names[i],
    isAI: seat.isAI,
    resources: bundle(),
    devCards: [],
    priorityPlayed: 0,
  }));
  const bank = bundle();
  for (const r of RESOURCES) bank[r] = BANK_SUPPLY_PER_RESOURCE;
  const order = snakeOrder(players.length);
  return {
    version: 1,
    seed,
    rng: 0,
    board,
    players,
    buildings: board.vertices.map(() => null),
    roads: board.edges.map(() => null),
    disruptionTile: barrenTileId(board),
    bank,
    devDeck: rng.shuffle(deck),
    nextCardId: 1,
    currentPlayer: order[0],
    turn: 0,
    phase: 'setup',
    returnPhase: null,
    setup: { order, step: 0, expecting: 'cluster', lastVertex: null },
    pendingDiscards: players.map(() => 0),
    pendingTrade: null,
    freeRoadsLeft: 0,
    lastRoll: null,
    lastProduction: null,
    devCardPlayedThisTurn: false,
    tradesProposedThisTurn: 0,
    turnActionCount: 0,
    longestRoadHolder: null,
    largestArmyHolder: null,
    winner: null,
    log: [],
    nextLogId: 1,
    scenario: null,
    voltaCards,
    rules: { ...rules },
  };
}

/**
 * Sanitized, unique display names. Company default names keep priority; a custom name that
 * collides with another seat's name (case-insensitively) gets a number, so log lines and trade
 * prompts never read "Helixa Bio took 1 resource from Helixa Bio".
 */
function displayNames(seats: SeatConfig[]): string[] {
  const wanted = seats.map((seat) => {
    const fallback = companyById(seat.companyId).name;
    return { name: sanitizeCompanyName(seat.name, fallback), isDefault: sanitizeCompanyName(seat.name, fallback) === fallback };
  });
  const taken = new Set(wanted.filter((w) => w.isDefault).map((w) => w.name.toLowerCase()));
  return wanted.map((w) => {
    if (w.isDefault) return w.name;
    let name = w.name;
    for (let n = 2; taken.has(name.toLowerCase()); n++) {
      const suffix = ` ${n}`;
      name = Array.from(w.name).slice(0, MAX_COMPANY_NAME - suffix.length).join('').trimEnd() + suffix;
    }
    taken.add(name.toLowerCase());
    return name;
  });
}

/** Run the snake-draft opening automatically using the shared placement heuristic. */
export function autoDraft(state: GameState): GameState {
  let s = state;
  while (s.phase === 'setup' && s.setup) {
    const p = s.currentPlayer;
    if (s.setup.expecting === 'cluster') {
      s = applyAction(s, { type: 'SETUP_CLUSTER', vertex: bestSetupVertex(s, p) });
    } else {
      s = applyAction(s, { type: 'SETUP_ROAD', edge: bestSetupRoad(s, p, s.setup.lastVertex!) });
    }
  }
  return s;
}

function openingSpread(s: GameState): number {
  const totals = s.players.map((p) => {
    let n = 0;
    s.buildings.forEach((b, v) => {
      if (!b || b.owner !== p.id) return;
      for (const t of s.board.vertices[v].tileIds) n += pips(s.board.tiles[t].number);
    });
    return n;
  });
  return Math.max(...totals) - Math.min(...totals);
}

export function createGame(options: NewGameOptions = {}): GameState {
  const seats = options.seats ?? DEFAULT_SEATS;
  if (seats.length < 2 || seats.length > 4) throw new GameError('Games need 2–4 companies.');
  const seed = (options.seed ?? randomSeed()) >>> 0;
  const quickStart = options.quickStart ?? true;
  const voltaCards = options.voltaCards ?? false;
  // Explicit booleans: a partial with `undefined` values must not leak into saves.
  const rules: RuleOptions = {
    financing: options.rules?.financing ?? CLASSIC_RULES.financing,
    fullStack: options.rules?.fullStack ?? CLASSIC_RULES.fullStack,
    marketEvents: options.rules?.marketEvents ?? CLASSIC_RULES.marketEvents,
  };

  if (!quickStart) {
    const s = createBaseState(seed, seats, voltaCards, rules);
    s.rng = deriveSeed(seed, 99) | 0;
    addLog(s, 'system', null, 'Opening draft: each company places a Compute Cluster and a Network Connection, then again in reverse order.');
    return s;
  }

  // Quick Start: try a handful of boards derived from the seed and keep the one whose
  // automatic snake draft gives the most even opening production.
  let best: GameState | null = null;
  let bestSpread = Infinity;
  for (let i = 0; i < 8; i++) {
    const boardSeed = i === 0 ? seed : deriveSeed(seed, i);
    const base = createBaseState(boardSeed, seats, voltaCards, rules);
    base.rng = deriveSeed(boardSeed, 99) | 0;
    const drafted = autoDraft(base);
    const spread = openingSpread(drafted);
    if (spread < bestSpread) {
      best = drafted;
      bestSpread = spread;
    }
    if (spread <= 2) break;
  }
  const s = { ...best!, log: [] as GameState['log'], nextLogId: 1 };
  addLog(s, 'system', null, 'Quick Start: every company opens with two Compute Clusters and two Network Connections. Opening resources come from each second cluster.');
  addLog(s, 'turn', s.currentPlayer, `Turn 1 — ${s.players[s.currentPlayer].name}`);
  return s;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cloneState(st: GameState): GameState {
  return {
    ...st,
    players: st.players.map((p) => ({ ...p, resources: { ...p.resources }, devCards: p.devCards.slice() })),
    buildings: st.buildings.slice(),
    roads: st.roads.slice(),
    bank: { ...st.bank },
    devDeck: st.devDeck.slice(),
    setup: st.setup ? { ...st.setup } : null,
    pendingDiscards: st.pendingDiscards.slice(),
    log: st.log.slice(),
  };
}

function isBundleValid(b: ResourceBundle): boolean {
  return RESOURCES.every((r) => Number.isInteger(b[r]) && b[r] >= 0);
}

export function getActingPlayer(s: GameState): number | null {
  if (s.phase === 'gameOver') return null;
  if (s.pendingTrade) return s.pendingTrade.to;
  if (s.phase === 'discard') {
    const idx = s.pendingDiscards.findIndex((n) => n > 0);
    return idx >= 0 ? idx : s.currentPlayer;
  }
  return s.currentPlayer;
}

/** Players who could be targeted by a disruption on `tile`. */
export function disruptionVictims(s: GameState, tile: number, player: number): number[] {
  const out = new Set<number>();
  for (const v of s.board.tiles[tile].vertexIds) {
    const b = s.buildings[v];
    if (b && b.owner !== player && sumBundle(s.players[b.owner].resources) > 0) out.add(b.owner);
  }
  return [...out].sort((a, b) => a - b);
}

function produce(s: GameState, roll: number): ProductionReport {
  const owed: ResourceBundle[] = s.players.map(() => bundle());
  const tileIds: number[] = [];
  let blocked: number | null = null;
  // Infrastructure Financing: a financed factory is owed 1 like a cluster; its would-be bonus unit
  // is a committed unit that never leaves the market (so it never counts toward a shortage).
  const pending: { vertex: number; owner: number; resource: Resource }[] = [];
  for (const tile of s.board.tiles) {
    if (tile.number !== roll) continue;
    tileIds.push(tile.id);
    if (tile.id === s.disruptionTile) {
      blocked = tile.id; // an outage pays nothing, so a commitment there stalls
      continue;
    }
    if (tile.type === 'barren') continue;
    for (const v of tile.vertexIds) {
      const b = s.buildings[v];
      if (!b) continue;
      owed[b.owner][tile.type] += outputMultiplier(b);
      if (isFinanced(b)) pending.push({ vertex: v, owner: b.owner, resource: tile.type });
    }
  }
  const gains: ResourceBundle[] = s.players.map(() => bundle());
  const shortages: Resource[] = [];
  for (const r of RESOURCES) {
    const total = owed.reduce((n, o) => n + o[r], 0);
    if (total === 0) continue;
    if (total <= s.bank[r]) {
      owed.forEach((o, i) => (gains[i][r] = o[r]));
    } else {
      // Familiar shortage rule: if the market can't pay everyone, nobody collects —
      // unless only one company is owed, in which case they take what's left.
      const owedPlayers = owed.map((o, i) => (o[r] > 0 ? i : -1)).filter((i) => i >= 0);
      if (owedPlayers.length === 1) gains[owedPlayers[0]][r] = s.bank[r];
      shortages.push(r);
    }
  }
  gains.forEach((g, i) => gainFromBank(s, i, g));
  // A committed unit is delivered only when its resource paid out in full (any shortage, including
  // the sole-claimant partial payout, delivers nothing). Buildings are shared with earlier states:
  // write a new object, and drop the field entirely once the commitment is complete.
  const deliveries: Delivery[] = [];
  for (const d of pending) {
    if (shortages.includes(d.resource)) continue;
    const b = s.buildings[d.vertex]!;
    if (!isFinanced(b)) continue; // already completed by an earlier payout this roll
    const left = b.financed! - 1;
    s.buildings[d.vertex] = left > 0 ? { owner: b.owner, kind: 'factory', financed: left } : { owner: b.owner, kind: 'factory' };
    deliveries.push({ player: d.owner, vertex: d.vertex, resource: d.resource, left });
  }
  return { roll, tileIds, blockedTileId: blocked, gains, shortages, deliveries };
}

function stealRandom(s: GameState, rng: Rng, thief: number, victim: number): Resource | null {
  const v = s.players[victim];
  const total = sumBundle(v.resources);
  if (total === 0) return null;
  let pick = rng.int(total);
  for (const r of RESOURCES) {
    if (pick < v.resources[r]) {
      v.resources[r]--;
      s.players[thief].resources[r]++;
      return r;
    }
    pick -= v.resources[r];
  }
  return null;
}

function checkVictory(s: GameState): void {
  if (s.phase === 'setup' || s.phase === 'gameOver') return;
  const p = s.currentPlayer;
  const vp = victoryPoints(s, p, true);
  if (vp >= VP_TO_WIN) {
    s.winner = p;
    s.phase = 'gameOver';
    s.pendingTrade = null;
    addLog(s, 'win', p, `${nameOf(s, p)} reaches ${vp} Compute Points and becomes the market leader!`);
  }
}

function assertCardPlayable(s: GameState, player: number, type: PlayableCardType) {
  const check = checkPlayCard(s, player, type);
  if (!check.ok) throw new GameError(check.reason);
  const p = s.players[player];
  const idx = p.devCards.findIndex((c) => c.type === type && c.boughtOnTurn < s.turn);
  p.devCards.splice(idx, 1);
  s.devCardPlayedThisTurn = true;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * Apply an action for the currently acting player and return a new state.
 * The input state is never mutated. Throws GameError for illegal actions.
 */
export function applyAction(state: GameState, action: Action): GameState {
  const actor = getActingPlayer(state);
  if (actor === null) throw new GameError('The game is over.');
  const s = cloneState(state);
  const rng = new Rng(s.rng);
  const me = s.players[actor];

  switch (action.type) {
    case 'SETUP_CLUSTER': {
      if (s.phase !== 'setup' || !s.setup || s.setup.expecting !== 'cluster') throw new GameError('Not placing a cluster now.');
      if (!isVertexOpen(s, action.vertex)) throw new GameError('That site breaks the distance rule.');
      s.buildings[action.vertex] = { owner: actor, kind: 'cluster' };
      const second = s.setup.step >= s.players.length;
      if (second) {
        const gain = bundle();
        for (const t of s.board.vertices[action.vertex].tileIds) {
          const tile = s.board.tiles[t];
          if (tile.type !== 'barren') gain[tile.type]++;
        }
        gainFromBank(s, actor, gain);
        addLog(s, 'build', actor, `${me.name} placed a second cluster and collected ${describeBundle(gain)}.`);
      } else {
        addLog(s, 'build', actor, `${me.name} placed an opening Compute Cluster.`);
      }
      s.setup.expecting = 'road';
      s.setup.lastVertex = action.vertex;
      break;
    }

    case 'SETUP_ROAD': {
      if (s.phase !== 'setup' || !s.setup || s.setup.expecting !== 'road') throw new GameError('Not placing a connection now.');
      const edge = s.board.edges[action.edge];
      if (!edge || s.roads[action.edge] !== null) throw new GameError('That edge is taken.');
      if (edge.a !== s.setup.lastVertex && edge.b !== s.setup.lastVertex) throw new GameError('Connect it to the cluster you just placed.');
      s.roads[action.edge] = actor;
      s.setup.step++;
      s.setup.expecting = 'cluster';
      s.setup.lastVertex = null;
      if (s.setup.step >= s.setup.order.length) {
        s.setup = null;
        s.phase = 'preRoll';
        s.currentPlayer = 0;
        s.turn = 1;
        updateLongestNetwork(s);
        addLog(s, 'turn', 0, `Turn 1 — ${nameOf(s, 0)}`);
      } else {
        s.currentPlayer = s.setup.order[s.setup.step];
      }
      break;
    }

    case 'ROLL': {
      if (s.phase !== 'preRoll') throw new GameError('You already rolled this turn.');
      const d1 = rng.int(6) + 1;
      const d2 = rng.int(6) + 1;
      const total = d1 + d2;
      s.lastRoll = { d1, d2, total };
      addLog(s, 'roll', actor, `${me.name} rolled ${total} (${d1}+${d2}).`);
      if (total === 7) {
        s.lastProduction = null;
        s.pendingDiscards = s.players.map((p) => {
          const n = sumBundle(p.resources);
          return n > HAND_LIMIT ? Math.floor(n / 2) : 0;
        });
        addLog(s, 'disruption', actor, 'Grid Disruption! No production this roll.');
        s.pendingDiscards.forEach((n, i) => {
          if (n > 0) addLog(s, 'disruption', i, `${nameOf(s, i)} holds more than ${HAND_LIMIT} resources and must discard ${n}.`);
        });
        s.phase = s.pendingDiscards.some((n) => n > 0) ? 'discard' : 'moveDisruption';
        s.returnPhase = 'main';
      } else {
        const report = produce(s, total);
        s.lastProduction = report;
        if (report.blockedTileId !== null) {
          const tile = s.board.tiles[report.blockedTileId];
          addLog(s, 'disruption', null, `Outage: the ${tile.type === 'barren' ? 'Dead Zone' : RESOURCE_INFO[tile.type].label} hex is disrupted and produces nothing.`);
        }
        report.gains.forEach((g, i) => {
          if (sumBundle(g) > 0) addLog(s, 'produce', i, `${nameOf(s, i)} collected ${describeBundle(g)}.`);
        });
        for (const r of report.shortages) addLog(s, 'produce', null, `Market shortage: not enough ${RESOURCE_INFO[r].label} for everyone.`);
        if (report.gains.every((g) => sumBundle(g) === 0) && report.blockedTileId === null && report.shortages.length === 0) {
          addLog(s, 'produce', null, 'No infrastructure on that number — nothing produced.');
        }
        for (const d of report.deliveries ?? []) {
          const who = `${nameOf(s, d.player)}'s financed AI Factory`;
          const unit = `1 ${resourceLabel(d.resource, 1)}`;
          if (d.left > 0) {
            addLog(s, 'finance', d.player, `${who} delivered ${unit} of its commitment (${d.left} left).`);
          } else {
            addLog(s, 'finance', d.player, `${who} delivered ${unit}, its last committed unit.`);
            addLog(s, 'finance', d.player, `${who} is fully delivered: now a full AI Factory (+1 CP, double output).`);
          }
        }
        s.phase = 'main';
      }
      break;
    }

    case 'DISCARD': {
      if (s.phase !== 'discard') throw new GameError('No discard is required.');
      const need = s.pendingDiscards[actor];
      if (need <= 0) throw new GameError('You do not need to discard.');
      if (!isBundleValid(action.resources) || sumBundle(action.resources) !== need) throw new GameError(`Discard exactly ${need}.`);
      if (!hasBundle(me.resources, action.resources)) throw new GameError("You don't have those resources.");
      pay(s, actor, action.resources);
      s.pendingDiscards[actor] = 0;
      addLog(s, 'disruption', actor, `${me.name} discarded ${describeBundle(action.resources)}.`);
      if (s.pendingDiscards.every((n) => n === 0)) s.phase = 'moveDisruption';
      break;
    }

    case 'MOVE_DISRUPTION': {
      if (s.phase !== 'moveDisruption') throw new GameError('The disruption marker cannot move now.');
      const tile = s.board.tiles[action.tile];
      if (!tile) throw new GameError('Unknown hex.');
      if (action.tile === s.disruptionTile) throw new GameError('Move the disruption to a different hex.');
      s.disruptionTile = action.tile;
      const victims = disruptionVictims(s, action.tile, actor);
      const label = tile.type === 'barren' ? 'the Dead Zone' : `a ${RESOURCE_INFO[tile.type].label} hex${tile.number ? ` (${tile.number})` : ''}`;
      if (victims.length > 0) {
        if (action.victim === null || !victims.includes(action.victim)) throw new GameError('Choose a rival next to that hex to take from.');
        const stolen = stealRandom(s, rng, actor, action.victim);
        addLog(s, 'disruption', actor, `${me.name} moved the Grid Disruption to ${label} and took 1 resource from ${nameOf(s, action.victim)}.`);
        if (stolen && (!me.isAI || !s.players[action.victim].isAI)) {
          // Detail visible to the human(s) involved; kept generic in AI-vs-AI exchanges.
          addLog(s, 'disruption', actor, `  ↳ It was ${RESOURCE_INFO[stolen].label}.`);
        }
      } else {
        if (action.victim !== null) throw new GameError('Nobody there can be taken from.');
        addLog(s, 'disruption', actor, `${me.name} moved the Grid Disruption to ${label}.`);
      }
      s.phase = s.returnPhase ?? 'main';
      s.returnPhase = null;
      break;
    }

    case 'BUILD_ROAD': {
      const free = s.phase === 'freeRoads';
      if (!free) {
        const check = checkBuild(s, actor, 'road');
        if (!check.ok) throw new GameError(check.reason);
      } else if (piecesLeft(s, actor).road <= 0) {
        throw new GameError('No connections left.');
      }
      if (!legalRoadEdges(s, actor).includes(action.edge)) throw new GameError('That edge does not connect to your network.');
      if (!free) pay(s, actor, COSTS.road);
      s.roads[action.edge] = actor;
      addLog(s, 'build', actor, `${me.name} built a Network Connection${free ? ' (free)' : ''}.`);
      const before = s.longestRoadHolder;
      updateLongestNetwork(s);
      announceLongest(s, before);
      if (free) {
        s.freeRoadsLeft--;
        if (s.freeRoadsLeft <= 0 || piecesLeft(s, actor).road <= 0 || legalRoadEdges(s, actor).length === 0) {
          s.freeRoadsLeft = 0;
          s.phase = 'main';
        }
      }
      break;
    }

    case 'BUILD_CLUSTER': {
      const check = checkBuild(s, actor, 'cluster');
      if (!check.ok) throw new GameError(check.reason);
      if (!legalClusterVertices(s, actor).includes(action.vertex)) throw new GameError('Clusters need an open site on your network, 2+ steps from any building.');
      pay(s, actor, COSTS.cluster);
      s.buildings[action.vertex] = { owner: actor, kind: 'cluster' };
      addLog(s, 'build', actor, `${me.name} built a Compute Cluster (+1 CP).`);
      const before = s.longestRoadHolder;
      updateLongestNetwork(s); // a new cluster can cut a rival's network
      announceLongest(s, before);
      break;
    }

    case 'BUILD_FACTORY': {
      const check = checkBuild(s, actor, 'factory');
      if (!check.ok) throw new GameError(check.reason);
      if (!legalFactoryVertices(s, actor).includes(action.vertex)) throw new GameError('Upgrade one of your own clusters.');
      pay(s, actor, COSTS.factory);
      s.buildings[action.vertex] = { owner: actor, kind: 'factory' };
      addLog(s, 'build', actor, `${me.name} upgraded a cluster into an AI Factory (+1 CP, double output).`);
      break;
    }

    case 'BUY_CARD': {
      const check = checkBuild(s, actor, 'card');
      if (!check.ok) throw new GameError(check.reason);
      pay(s, actor, COSTS.card);
      const type = s.devDeck.pop()!;
      me.devCards.push({ id: s.nextCardId++, type, boughtOnTurn: s.turn });
      addLog(s, 'card', actor, `${me.name} invested in an Innovation Card.`);
      break;
    }

    case 'PLAY_PRIORITY': {
      const from = s.phase as 'preRoll' | 'main';
      assertCardPlayable(s, actor, 'priority');
      me.priorityPlayed++;
      const before = s.largestArmyHolder;
      updatePriorityAccess(s, actor);
      addLog(s, 'card', actor, `${me.name} played ${DEV_CARD_INFO.priority.title}.`);
      if (s.largestArmyHolder !== before && s.largestArmyHolder === actor) {
        addLog(s, 'card', actor, `${me.name} now holds Priority Access (+2 CP).`);
      }
      s.returnPhase = from;
      s.phase = 'moveDisruption';
      break;
    }

    case 'PLAY_EXPANSION': {
      assertCardPlayable(s, actor, 'expansion');
      s.freeRoadsLeft = Math.min(2, piecesLeft(s, actor).road);
      s.phase = 'freeRoads';
      addLog(s, 'card', actor, `${me.name} played ${DEV_CARD_INFO.expansion.title}: ${s.freeRoadsLeft} free connections.`);
      break;
    }

    case 'PLAY_GRANT': {
      const [r1, r2] = action.resources;
      if (!RESOURCES.includes(r1) || !RESOURCES.includes(r2)) throw new GameError('Pick two resources.');
      const want = bundle();
      want[r1]++;
      want[r2]++;
      if (!hasBundle(s.bank, want)) throw new GameError('The market does not have those resources.');
      assertCardPlayable(s, actor, 'grant');
      gainFromBank(s, actor, want);
      addLog(s, 'card', actor, `${me.name} played ${DEV_CARD_INFO.grant.title} and took ${describeBundle(want)}.`);
      break;
    }

    case 'PLAY_CONSOLIDATION': {
      if (!RESOURCES.includes(action.resource)) throw new GameError('Pick a resource.');
      assertCardPlayable(s, actor, 'consolidation');
      let taken = 0;
      for (const p of s.players) {
        if (p.id === actor) continue;
        taken += p.resources[action.resource];
        me.resources[action.resource] += p.resources[action.resource];
        p.resources[action.resource] = 0;
      }
      addLog(s, 'card', actor, `${me.name} played ${DEV_CARD_INFO.consolidation.title} on ${RESOURCE_INFO[action.resource].label} and collected ${taken}.`);
      break;
    }

    case 'BUILD_FINANCED_FACTORY': {
      applyFinancedUpgrade(s, actor, action.vertex); // financing.ts
      break;
    }

    case 'REFINANCE': {
      applyRefinance(s, actor, action.vertex); // financing.ts
      break;
    }

    case 'BUILD_INTEGRATED_FACTORY': {
      applyIntegratedDeployment(s, actor, action.vertex); // fullstack.ts
      break;
    }

    case 'PLAY_INTEGRATION': {
      if (!legalClusterVertices(s, actor).includes(action.vertex)) {
        throw new GameError('Expedited Deployment needs an open site on your network, 2+ steps from any building.');
      }
      assertCardPlayable(s, actor, 'integration');
      pay(s, actor, INTEGRATION_COST);
      s.buildings[action.vertex] = { owner: actor, kind: 'factory' };
      addLog(s, 'card', actor, `${me.name} played ${DEV_CARD_INFO.integration.title}: an AI Factory deployed straight onto a new site (+2 CP).`);
      const before = s.longestRoadHolder;
      updateLongestNetwork(s); // a new building can cut a rival's network
      announceLongest(s, before);
      break;
    }

    case 'BANK_TRADE': {
      const check = checkBankTrade(s, actor, action.give, action.get);
      if (!check.ok) throw new GameError(check.reason);
      const rate = bankRate(s, actor, action.give);
      me.resources[action.give] -= rate;
      s.bank[action.give] += rate;
      me.resources[action.get] += 1;
      s.bank[action.get] -= 1;
      addLog(s, 'trade', actor, `${me.name} traded ${rate} ${RESOURCE_INFO[action.give].label} to the market for 1 ${RESOURCE_INFO[action.get].label}.`);
      break;
    }

    case 'PROPOSE_TRADE': {
      const check = checkTradePhase(s, actor);
      if (!check.ok) throw new GameError(check.reason);
      if (action.to === actor || !s.players[action.to]) throw new GameError('Pick a rival to trade with.');
      if (!isBundleValid(action.give) || !isBundleValid(action.get)) throw new GameError('Invalid trade.');
      if (sumBundle(action.give) === 0 || sumBundle(action.get) === 0) throw new GameError('A trade needs something on both sides.');
      if (RESOURCES.some((r) => action.give[r] > 0 && action.get[r] > 0)) throw new GameError("Don't offer and request the same resource.");
      if (!hasBundle(me.resources, action.give)) throw new GameError("You don't have what you're offering.");
      if (s.tradesProposedThisTurn >= 6) throw new GameError('Your rivals are done negotiating this turn.');
      s.tradesProposedThisTurn++;
      s.pendingTrade = { from: actor, to: action.to, give: { ...action.give }, get: { ...action.get } };
      addLog(s, 'trade', actor, `${me.name} offered ${nameOf(s, action.to)} ${describeBundle(action.give)} for ${describeBundle(action.get)}.`);
      break;
    }

    case 'RESPOND_TRADE': {
      const offer = s.pendingTrade;
      if (!offer) throw new GameError('There is no offer to answer.');
      s.pendingTrade = null;
      if (action.accept) {
        const from = s.players[offer.from];
        const to = s.players[offer.to];
        if (!hasBundle(from.resources, offer.give) || !hasBundle(to.resources, offer.get)) {
          throw new GameError('One side can no longer cover this trade.');
        }
        for (const r of RESOURCES) {
          from.resources[r] += offer.get[r] - offer.give[r];
          to.resources[r] += offer.give[r] - offer.get[r];
        }
        addLog(s, 'trade', offer.to, `${to.name} accepted${action.reason ? ` — ${action.reason}` : '.'}`);
      } else {
        addLog(s, 'trade', offer.to, `${nameOf(s, offer.to)} declined${action.reason ? ` — ${action.reason}` : '.'}`);
      }
      break;
    }

    case 'END_TURN': {
      if (s.phase !== 'main') throw new GameError(s.phase === 'preRoll' ? 'Roll the dice first.' : 'Finish the current step first.');
      if (s.pendingTrade) throw new GameError('Waiting for a trade response.');
      s.currentPlayer = (s.currentPlayer + 1) % s.players.length;
      s.turn++;
      s.phase = 'preRoll';
      s.devCardPlayedThisTurn = false;
      s.tradesProposedThisTurn = 0;
      s.turnActionCount = 0;
      s.lastRoll = null;
      s.lastProduction = null;
      addLog(s, 'turn', s.currentPlayer, `Turn ${s.turn} — ${nameOf(s, s.currentPlayer)}`);
      s.rng = rng.state;
      applyMarketEvents(s); // events.ts — no-op unless rules.marketEvents
      updateFullStack(s);
      checkVictory(s); // a player can only win on their own turn
      return s;
    }

    default: {
      const never: never = action;
      throw new GameError(`Unknown action ${(never as Action).type}`);
    }
  }

  s.rng = rng.state;
  s.turnActionCount++;
  updateFullStack(s); // fullstack.ts — unlocks are permanent; no-op unless rules.fullStack
  checkVictory(s);
  return s;
}

/** Convenience for tests and tools: apply a sequence of actions. */
export function applyActions(state: GameState, actions: Action[]): GameState {
  return actions.reduce((s, a) => applyAction(s, a), state);
}
