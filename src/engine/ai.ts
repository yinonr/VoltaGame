import { COSTS, INTEGRATION_COST, RESOURCE_INFO, bundle, companyById, describeBundle, hasBundle, missingFor, pips, sumBundle } from './constants';
import type { BuildType } from './constants';
import { bestSetupRoad, bestSetupVertex, productionPips, totalPips, vertexValue } from './evaluation';
import { outputMultiplier } from './financing';
import { disruptionVictims } from './game';
import {
  bankRate,
  checkBankTrade,
  checkBuild,
  checkPlayCard,
  isVertexOpen,
  legalClusterVertices,
  legalFactoryVertices,
  legalRoadEdges,
  piecesLeft,
} from './rules';
import { longestNetwork, victoryPoints } from './scoring';
import type { Action, GameState, Resource, ResourceBundle, TradeOffer } from './types';
import { RESOURCES } from './types';

// Deterministic, rule-abiding heuristics for computer-controlled companies.
// Every decision is a pure function of the visible game state, so AI turns are
// reproducible and testable. The AI never reads rivals' hidden hands or cards.

interface Goal {
  /** 'integration' = save up for a held Full-Stack Integration card. */
  kind: BuildType | 'integration';
  cost: ResourceBundle;
  /** Rough priority score used to rank goals. */
  score: number;
}

function style(state: GameState, player: number) {
  return companyById(state.players[player].companyId).style;
}

function bestFactoryVertex(state: GameState, player: number): number {
  let best = -1;
  let bestScore = -Infinity;
  for (const v of legalFactoryVertices(state, player)) {
    let score = 0;
    for (const t of state.board.vertices[v].tileIds) {
      const tile = state.board.tiles[t];
      if (tile.type === 'barren') continue;
      score += pips(tile.number) * (t === state.disruptionTile ? 0.4 : 1) * (tile.type === 'capital' || tile.type === 'gpu' ? 1.15 : 1);
    }
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

function bestClusterVertex(state: GameState, player: number): { vertex: number; value: number } {
  let best = -1;
  let bestScore = -Infinity;
  const prod = productionPips(state, player, true);
  for (const v of legalClusterVertices(state, player)) {
    const score = vertexValue(state, v, player, prod);
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return { vertex: best, value: bestScore };
}

/** Value of building a road on `edge`: how good a future site it opens up, plus network length. */
function roadValue(state: GameState, player: number, edge: number, currentLongest: number): number {
  const e = state.board.edges[edge];
  const prod = productionPips(state, player, true);
  let best = 0;
  for (const u of [e.a, e.b]) {
    const b = state.buildings[u];
    if (b && b.owner !== player) continue;
    if (isVertexOpen(state, u)) best = Math.max(best, vertexValue(state, u, player, prod));
    for (const n of state.board.vertices[u].neighborIds) {
      if (n === e.a || n === e.b) continue;
      if (isVertexOpen(state, n)) best = Math.max(best, 0.7 * vertexValue(state, n, player, prod));
    }
  }
  // Longest Network race: reward roads that extend our trail.
  const roads = state.roads.slice();
  roads[edge] = player;
  const extended = longestNetwork({ ...state, roads }, player);
  if (extended > currentLongest && extended >= 4) {
    const holder = state.longestRoadHolder;
    const holderLen = holder !== null && holder !== player ? longestNetwork(state, holder) : 4;
    if (extended >= holderLen) best += 2.5;
    else best += 0.8;
  }
  return best;
}

function bestRoadEdge(state: GameState, player: number): { edge: number; value: number } {
  const current = longestNetwork(state, player);
  let best = -1;
  let bestScore = -Infinity;
  for (const e of legalRoadEdges(state, player)) {
    const score = roadValue(state, player, e, current);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return { edge: best, value: bestScore };
}

function goals(state: GameState, player: number): Goal[] {
  const st = style(state, player);
  const left = piecesLeft(state, player);
  const out: Goal[] = [];
  const hasClusterSite = legalClusterVertices(state, player).length > 0;
  const holdsIntegration = state.players[player].devCards.some((c) => c.type === 'integration');
  // Holding Full-Stack Integration: save toward its cost so the card isn't a dead draw.
  if (holdsIntegration && left.factory > 0 && hasClusterSite) {
    out.push({ kind: 'integration', cost: INTEGRATION_COST, score: 4.2 * st.factories });
  }
  if (left.factory > 0 && legalFactoryVertices(state, player).length > 0) {
    out.push({ kind: 'factory', cost: COSTS.factory, score: 3.4 * st.factories });
  }
  if (left.cluster > 0 && hasClusterSite) {
    out.push({ kind: 'cluster', cost: COSTS.cluster, score: 3.6 * st.expansion });
  }
  if ((left.cluster > 0 || (holdsIntegration && left.factory > 0)) && !hasClusterSite && left.road > 0 && legalRoadEdges(state, player).length > 0) {
    out.push({ kind: 'road', cost: COSTS.road, score: 2.6 * st.expansion });
  }
  if (state.devDeck.length > 0) {
    out.push({ kind: 'card', cost: COSTS.card, score: 1.6 * st.cards });
  }
  if (out.length === 0 && left.road > 0 && legalRoadEdges(state, player).length > 0) {
    out.push({ kind: 'road', cost: COSTS.road, score: 1 });
  }
  return out;
}

/** The goal the AI is currently working towards (best score after accounting for what's missing). */
export function currentGoal(state: GameState, player: number): Goal | null {
  const have = state.players[player].resources;
  let best: Goal | null = null;
  let bestScore = -Infinity;
  for (const g of goals(state, player)) {
    const missing = sumBundle(missingFor(have, g.cost));
    const score = g.score - 0.85 * missing;
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
  }
  return best;
}

function surplusFor(have: ResourceBundle, cost: ResourceBundle): ResourceBundle {
  const out = bundle();
  for (const r of RESOURCES) out[r] = Math.max(0, have[r] - cost[r]);
  return out;
}

// ---------------------------------------------------------------------------
// Trade evaluation (also used to explain AI responses to the human)
// ---------------------------------------------------------------------------

export interface TradeVerdict {
  accept: boolean;
  reason: string;
}

export function evaluateOffer(state: GameState, player: number, offer: TradeOffer): TradeVerdict {
  const me = state.players[player];
  // From this player's perspective: receive offer.give, pay offer.get.
  const receive = offer.give;
  const pay = offer.get;
  if (!hasBundle(me.resources, pay)) {
    return { accept: false, reason: `doesn't have ${describeBundle(pay)} to give.` };
  }
  if (victoryPoints(state, offer.from, false) >= 8) {
    return { accept: false, reason: "won't help the market leader close the gap." };
  }
  if (sumBundle(pay) > 3) return { accept: false, reason: 'not willing to give up that much at once.' };

  const goal = currentGoal(state, player);
  const goalCost = goal ? goal.cost : bundle();
  const missing = missingFor(me.resources, goalCost);
  const prod = productionPips(state, player);

  const gainValue = (r: Resource) => {
    let v = 1;
    if (missing[r] > 0) v += 1.3;
    if (prod[r] === 0) v += 0.4;
    if (me.resources[r] - goalCost[r] >= 2) v -= 0.4;
    return v;
  };
  const lossValue = (r: Resource, n: number) => {
    let v = 1;
    if (me.resources[r] - n < goalCost[r]) v += 1.2;
    if (prod[r] === 0) v += 0.3;
    if (me.resources[r] - goalCost[r] >= 3) v -= 0.3;
    return v;
  };

  let gain = 0;
  let loss = 0;
  for (const r of RESOURCES) {
    gain += receive[r] * gainValue(r);
    loss += pay[r] * lossValue(r, pay[r]);
  }
  const threshold = 0.35 / style(state, player).trading;
  const needed = RESOURCES.find((r) => receive[r] > 0 && missing[r] > 0);
  const precious = RESOURCES.find((r) => pay[r] > 0 && me.resources[r] - pay[r] < goalCost[r]);

  if (gain - loss >= threshold) {
    const what = goal
      ? `${goal.kind === 'card' ? 'an Innovation Card' : goal.kind === 'factory' || goal.kind === 'integration' ? 'an AI Factory' : goal.kind === 'cluster' ? 'a new cluster' : 'a new connection'}`
      : 'its plans';
    return {
      accept: true,
      reason: needed ? `needs ${RESOURCE_INFO[needed].label} for ${what}.` : 'a fair deal for both sides.',
    };
  }
  if (precious) return { accept: false, reason: `can't spare ${RESOURCE_INFO[precious].label} right now.` };
  return { accept: false, reason: 'not a good enough deal for them.' };
}

// ---------------------------------------------------------------------------
// Phase decisions
// ---------------------------------------------------------------------------

function chooseDiscard(state: GameState, player: number): ResourceBundle {
  const need = state.pendingDiscards[player];
  const have = { ...state.players[player].resources };
  const goal = currentGoal(state, player);
  const reserved = goal ? goal.cost : bundle();
  const out = bundle();
  for (let i = 0; i < need; i++) {
    let pick: Resource | null = null;
    let bestExcess = -Infinity;
    for (const r of RESOURCES) {
      if (have[r] <= 0) continue;
      const excess = have[r] - reserved[r] + (r === 'land' ? 0.1 : 0);
      if (excess > bestExcess) {
        bestExcess = excess;
        pick = r;
      }
    }
    if (!pick) break;
    have[pick]--;
    out[pick]++;
  }
  return out;
}

function chooseDisruption(state: GameState, player: number): Action {
  let bestTile = -1;
  let bestScore = -Infinity;
  const vps = state.players.map((p) => victoryPoints(state, p.id, false));
  const leaderVp = Math.max(...vps.filter((_, i) => i !== player));
  for (const tile of state.board.tiles) {
    if (tile.id === state.disruptionTile) continue;
    let score = tile.type === 'barren' ? -1 : 0;
    const p = pips(tile.number);
    for (const v of tile.vertexIds) {
      const b = state.buildings[v];
      if (!b) continue;
      const mult = outputMultiplier(b);
      if (b.owner === player) score -= p * mult * 3;
      else score += p * mult * (1 + 0.25 * vps[b.owner]) + (vps[b.owner] === leaderVp ? 1.5 : 0);
    }
    if (disruptionVictims(state, tile.id, player).length > 0) score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestTile = tile.id;
    }
  }
  const victims = disruptionVictims(state, bestTile, player);
  let victim: number | null = null;
  if (victims.length > 0) {
    victim = victims.slice().sort((a, b) => {
      const dv = vps[b] - vps[a];
      if (dv !== 0) return dv;
      return sumBundle(state.players[b].resources) - sumBundle(state.players[a].resources);
    })[0];
  }
  return { type: 'MOVE_DISRUPTION', tile: bestTile, victim };
}

function disruptionHurtsMe(state: GameState, player: number): boolean {
  const tile = state.board.tiles[state.disruptionTile];
  if (tile.type === 'barren') return false;
  let hurt = 0;
  for (const v of tile.vertexIds) {
    const b = state.buildings[v];
    if (b && b.owner === player) hurt += pips(tile.number) * outputMultiplier(b);
  }
  return hurt >= 3;
}

function wantsPriority(state: GameState, player: number): boolean {
  if (!checkPlayCard(state, player, 'priority').ok) return false;
  if (disruptionHurtsMe(state, player)) return true;
  const mine = state.players[player].priorityPlayed + 1;
  const holder = state.largestArmyHolder;
  if (holder === player) return false;
  const holderCount = holder === null ? 2 : state.players[holder].priorityPlayed;
  return mine >= 3 && mine > holderCount;
}

/** Estimate (from public info only) how much of `r` rivals are holding. */
function estimateRivalHoldings(state: GameState, player: number, r: Resource): number {
  let est = 0;
  for (const p of state.players) {
    if (p.id === player) continue;
    const prod = productionPips(state, p.id, true);
    const total = totalPips(prod);
    if (total === 0) continue;
    est += sumBundle(p.resources) * (prod[r] / total);
  }
  return est;
}

function cardAction(state: GameState, player: number, goal: Goal | null): Action | null {
  if (state.devCardPlayedThisTurn) return null;
  const have = state.players[player].resources;
  const missing = goal ? missingFor(have, goal.cost) : bundle();

  // Full-Stack Integration: +2 CP and a doubled-output site in one move — always worth it when legal.
  if (checkPlayCard(state, player, 'integration').ok) {
    const { vertex } = bestClusterVertex(state, player);
    if (vertex >= 0) return { type: 'PLAY_INTEGRATION', vertex };
  }

  if (wantsPriority(state, player)) return { type: 'PLAY_PRIORITY' };

  if (checkPlayCard(state, player, 'consolidation').ok) {
    let bestR: Resource = 'gpu';
    let bestEst = -1;
    for (const r of RESOURCES) {
      const est = estimateRivalHoldings(state, player, r) * (missing[r] > 0 ? 1.4 : 1);
      if (est > bestEst) {
        bestEst = est;
        bestR = r;
      }
    }
    if (bestEst >= 3) return { type: 'PLAY_CONSOLIDATION', resource: bestR };
  }

  if (checkPlayCard(state, player, 'grant').ok && goal && sumBundle(missing) > 0) {
    const picks: Resource[] = [];
    const m = { ...missing };
    const bank = { ...state.bank };
    for (let i = 0; i < 2; i++) {
      let r = RESOURCES.find((x) => m[x] > 0 && bank[x] > 0);
      if (!r) r = RESOURCES.slice().sort((a, b) => bank[b] - bank[a])[0];
      picks.push(r);
      m[r] = Math.max(0, m[r] - 1);
      bank[r]--;
    }
    if (bank[picks[0]] >= 0 && bank[picks[1]] >= 0) return { type: 'PLAY_GRANT', resources: [picks[0], picks[1]] };
  }

  if (checkPlayCard(state, player, 'expansion').ok) {
    const { value } = bestRoadEdge(state, player);
    if (value > 2 && (legalClusterVertices(state, player).length === 0 || goal?.kind === 'road')) {
      return { type: 'PLAY_EXPANSION' };
    }
  }
  return null;
}

function tradeTowards(state: GameState, player: number, goal: Goal): Action | null {
  const have = state.players[player].resources;
  const missing = missingFor(have, goal.cost);
  if (sumBundle(missing) === 0) return null;
  const surplus = surplusFor(have, goal.cost);

  // 1) Market / port trades using resources the goal doesn't need.
  for (const m of RESOURCES) {
    if (missing[m] === 0 || state.bank[m] === 0) continue;
    let bestGive: Resource | null = null;
    let bestRate = Infinity;
    for (const r of RESOURCES) {
      if (r === m) continue;
      const rate = bankRate(state, player, r);
      if (surplus[r] >= rate && rate < bestRate && checkBankTrade(state, player, r, m).ok) {
        bestRate = rate;
        bestGive = r;
      }
    }
    if (bestGive) return { type: 'BANK_TRADE', give: bestGive, get: m };
  }

  // 2) One direct offer per turn when a single resource stands in the way.
  if (state.tradesProposedThisTurn === 0 && sumBundle(missing) === 1) {
    const want = RESOURCES.find((r) => missing[r] > 0)!;
    const giveR = RESOURCES.filter((r) => surplus[r] > 0).sort((a, b) => surplus[b] - surplus[a])[0];
    if (giveR) {
      const candidates = state.players
        .filter((p) => p.id !== player && victoryPoints(state, p.id, false) < 8)
        .map((p) => ({ id: p.id, prod: productionPips(state, p.id, true)[want] }))
        .filter((c) => c.prod > 0)
        .sort((a, b) => b.prod - a.prod || a.id - b.id);
      if (candidates.length > 0) {
        const give = bundle();
        give[giveR] = surplus[giveR] >= 3 && state.players[player].resources[giveR] >= 3 ? 2 : 1;
        const get = bundle();
        get[want] = 1;
        return { type: 'PROPOSE_TRADE', to: candidates[0].id, give, get };
      }
    }
  }
  return null;
}

function mainPhase(state: GameState, player: number): Action {
  const have = state.players[player].resources;
  const goal = currentGoal(state, player);

  const card = cardAction(state, player, goal);
  if (card) return card;

  // Immediate high-value builds — unless we're one resource away from an integrated deployment,
  // which needs the same Capital and GPUs and scores twice as much.
  const savingForIntegration = goal?.kind === 'integration' && sumBundle(missingFor(have, goal.cost)) <= 1;
  if (!savingForIntegration && checkBuild(state, player, 'factory').ok) {
    return { type: 'BUILD_FACTORY', vertex: bestFactoryVertex(state, player) };
  }
  if (checkBuild(state, player, 'cluster').ok) {
    return { type: 'BUILD_CLUSTER', vertex: bestClusterVertex(state, player).vertex };
  }

  if (goal) {
    if (hasBundle(have, goal.cost)) {
      if (goal.kind === 'road' && checkBuild(state, player, 'road').ok) {
        const { edge, value } = bestRoadEdge(state, player);
        if (edge >= 0 && value > 0) return { type: 'BUILD_ROAD', edge };
      }
      if (goal.kind === 'card' && checkBuild(state, player, 'card').ok) return { type: 'BUY_CARD' };
    } else {
      const trade = tradeTowards(state, player, goal);
      if (trade) return trade;
    }
  }

  // Secondary builds that don't eat into the goal's resources.
  const reserved = goal ? goal.cost : bundle();
  const spare = surplusFor(have, reserved);
  const handSize = sumBundle(have);
  if (checkBuild(state, player, 'road').ok) {
    const { edge, value } = bestRoadEdge(state, player);
    const affordableFromSpare = hasBundle(spare, COSTS.road);
    if (edge >= 0 && value > 2.5 && (affordableFromSpare || handSize > 7)) return { type: 'BUILD_ROAD', edge };
  }
  if (checkBuild(state, player, 'card').ok && (hasBundle(spare, COSTS.card) || handSize > 7)) {
    return { type: 'BUY_CARD' };
  }
  return { type: 'END_TURN' };
}

/** The single next action a computer-controlled company takes. */
export function decideAIAction(state: GameState, player: number): Action {
  if (state.pendingTrade && state.pendingTrade.to === player) {
    const verdict = evaluateOffer(state, player, state.pendingTrade);
    return { type: 'RESPOND_TRADE', accept: verdict.accept, reason: verdict.reason };
  }
  switch (state.phase) {
    case 'setup': {
      if (state.setup?.expecting === 'cluster') return { type: 'SETUP_CLUSTER', vertex: bestSetupVertex(state, player) };
      return { type: 'SETUP_ROAD', edge: bestSetupRoad(state, player, state.setup!.lastVertex!) };
    }
    case 'discard':
      return { type: 'DISCARD', resources: chooseDiscard(state, player) };
    case 'preRoll':
      if (wantsPriority(state, player)) return { type: 'PLAY_PRIORITY' };
      return { type: 'ROLL' };
    case 'moveDisruption':
      return chooseDisruption(state, player);
    case 'freeRoads': {
      const { edge } = bestRoadEdge(state, player);
      return { type: 'BUILD_ROAD', edge };
    }
    case 'main':
      if (state.turnActionCount > 60) return { type: 'END_TURN' };
      return mainPhase(state, player);
    default:
      return { type: 'END_TURN' };
  }
}
