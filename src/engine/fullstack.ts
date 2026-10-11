import { INTEGRATED_DEPLOYMENT_COST, RESOURCE_INFO, describeBundle, hasBundle, missingFor, rulesOf } from './constants';
import { isFinanced } from './financing';
import { GameError, addLog, announceLongest, nameOf, pay } from './mutate';
import { legalClusterVertices, piecesLeft, turnCheck } from './rules';
import type { Check } from './rules';
import { updateLongestNetwork } from './scoring';
import type { GameState, Resource } from './types';
import { RESOURCES } from './types';

// Full-Stack Integration — an earned, permanent company status (rules.fullStack). A company that
// has built across the whole stack (operational factory, several sites, broad resource access,
// a connected network) unlocks Integrated Deployment: an AI Factory straight onto an open site.
// Thresholds are calibrated by simulation: docs/FULLSTACK_CALIBRATION.md (COMPUTE_RULES, 200 all-AI
// games: 77% of companies unlock, median 5 CP in round 10 of 14; the network milestone binds most).

/** Unfinanced (operational) AI Factories needed. */
export const FULLSTACK_MIN_FACTORIES = 1;
/** Infrastructure sites needed: clusters + factories, financed ones included. */
export const FULLSTACK_MIN_SITES = 3;
/** Distinct resource types the company's buildings must touch (numbered hexes, adjacency). */
export const FULLSTACK_MIN_RESOURCE_TYPES = 4;
/** Network Connections needed in one connected group (rival buildings cut it). */
export const FULLSTACK_MIN_NETWORK = 4;

export type MilestoneId = 'factory' | 'sites' | 'resources' | 'network';

export interface Milestone {
  id: MilestoneId;
  /** Short label, e.g. "Operational AI Factory". */
  label: string;
  done: boolean;
  /** Progress text, e.g. "2 / 3 sites". */
  detail: string;
}

export interface FullStackProgress {
  milestones: Milestone[];
  done: number;
  total: number;
  unlocked: boolean;
}

/** Has `player` unlocked Full-Stack Integration? (Permanent once unlocked.) */
export function hasFullStack(state: GameState, player: number): boolean {
  return state.players[player].fullStackTurn !== undefined;
}

// ---------------------------------------------------------------------------
// Measurements (each one O(buildings) or O(roads); cheap enough to run after every action)
// ---------------------------------------------------------------------------

/** Resource types (in RESOURCES order) of numbered hexes touching `player`'s buildings. The outage is ignored. */
export function touchedResourceTypes(state: GameState, player: number): Resource[] {
  const seen = new Set<Resource>();
  state.buildings.forEach((b, v) => {
    if (!b || b.owner !== player) return;
    for (const t of state.board.vertices[v].tileIds) {
      const tile = state.board.tiles[t];
      if (tile.type !== 'barren' && tile.number !== null) seen.add(tile.type);
    }
  });
  return RESOURCES.filter((r) => seen.has(r));
}

/**
 * Size (in connections) of `player`'s largest connected group of Network Connections. Two of the
 * player's connections are joined through a shared corner unless a rival building sits on it,
 * the same cut rule as Longest Network. Unlike Longest Network this counts the whole group
 * (branches included), not the longest single trail.
 */
export function largestConnectedNetwork(state: GameState, player: number): number {
  const { board, roads, buildings } = state;
  const seen = new Uint8Array(roads.length);
  let best = 0;
  for (let start = 0; start < roads.length; start++) {
    if (roads[start] !== player || seen[start]) continue;
    seen[start] = 1;
    const stack = [start];
    let size = 0;
    while (stack.length > 0) {
      const e = stack.pop()!;
      size++;
      for (const v of [board.edges[e].a, board.edges[e].b]) {
        const b = buildings[v];
        if (b && b.owner !== player) continue; // a rival building cuts the network here
        for (const next of board.vertices[v].edgeIds) {
          if (roads[next] === player && !seen[next]) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    if (size > best) best = size;
  }
  return best;
}

interface SiteCounts {
  /** Unfinanced AI Factories. */
  operational: number;
  /** Financed AI Factories still owing committed units. */
  financed: number;
  /** Clusters + factories (financed included). */
  sites: number;
}

function siteCounts(state: GameState, player: number): SiteCounts {
  let operational = 0;
  let financed = 0;
  let sites = 0;
  for (const b of state.buildings) {
    if (!b || b.owner !== player) continue;
    sites++;
    if (b.kind !== 'factory') continue;
    if (isFinanced(b)) financed++;
    else operational++;
  }
  return { operational, financed, sites };
}

const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

function countWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** "2 / 3": progress capped at the target, so a finished milestone reads "3 / 3". */
function ratio(have: number, need: number): string {
  return `${Math.min(have, need)} / ${need}`;
}

/** Milestone progress toward Full-Stack Integration, in display order. */
export function fullStackProgress(state: GameState, player: number): FullStackProgress {
  const counts = siteCounts(state, player);
  const types = touchedResourceTypes(state, player);
  const network = largestConnectedNetwork(state, player);
  const pending = counts.operational < FULLSTACK_MIN_FACTORIES && counts.financed > 0;
  const milestones: Milestone[] = [
    {
      id: 'factory',
      label: FULLSTACK_MIN_FACTORIES === 1 ? 'Operational AI Factory' : `${countWord(FULLSTACK_MIN_FACTORIES)} operational AI Factories`,
      done: counts.operational >= FULLSTACK_MIN_FACTORIES,
      detail: `${ratio(counts.operational, FULLSTACK_MIN_FACTORIES)}${pending ? ' · financed one still delivering' : ''}`,
    },
    {
      id: 'sites',
      label: `${countWord(FULLSTACK_MIN_SITES)} infrastructure sites`,
      done: counts.sites >= FULLSTACK_MIN_SITES,
      detail: `${ratio(counts.sites, FULLSTACK_MIN_SITES)} sites`,
    },
    {
      id: 'resources',
      label: `${countWord(FULLSTACK_MIN_RESOURCE_TYPES)} resource types`,
      done: types.length >= FULLSTACK_MIN_RESOURCE_TYPES,
      detail: `${ratio(types.length, FULLSTACK_MIN_RESOURCE_TYPES)}${types.length ? ` · ${types.map((r) => RESOURCE_INFO[r].label).join(', ')}` : ''}`,
    },
    {
      id: 'network',
      label: 'Connected network',
      done: network >= FULLSTACK_MIN_NETWORK,
      detail: `${ratio(network, FULLSTACK_MIN_NETWORK)} connections`,
    },
  ];
  return {
    milestones,
    done: milestones.filter((m) => m.done).length,
    total: milestones.length,
    unlocked: hasFullStack(state, player),
  };
}

/** All four milestones met right now? Cheapest tests first; the network walk runs last. */
function meetsAllMilestones(state: GameState, player: number): boolean {
  const counts = siteCounts(state, player);
  if (counts.sites < FULLSTACK_MIN_SITES || counts.operational < FULLSTACK_MIN_FACTORIES) return false;
  if (touchedResourceTypes(state, player).length < FULLSTACK_MIN_RESOURCE_TYPES) return false;
  return largestConnectedNetwork(state, player) >= FULLSTACK_MIN_NETWORK;
}

/**
 * Reducer tail hook (after every action, and on END_TURN): unlock Full-Stack for every company
 * that now meets all milestones, whoever's turn it is (a financed factory can complete on a
 * rival's roll). `s` is already cloned, and its players are fresh objects. The unlock is permanent:
 * losing a milestone later (e.g. a rival cluster cutting the network) never re-locks it.
 */
export function updateFullStack(s: GameState): void {
  if (!rulesOf(s).fullStack || s.phase === 'setup') return;
  for (const p of s.players) {
    if (p.fullStackTurn !== undefined || !meetsAllMilestones(s, p.id)) continue;
    p.fullStackTurn = s.turn;
    addLog(s, 'milestone', p.id, `${nameOf(s, p.id)} achieved Full-Stack Integration — Integrated Deployment unlocked.`);
  }
}

// ---------------------------------------------------------------------------
// Integrated Deployment (the reward; repeatable, not a card play)
// ---------------------------------------------------------------------------

/** Open network sites where `player` may use Integrated Deployment (same sites as a new cluster). */
export function legalIntegratedVertices(state: GameState, player: number): number[] {
  if (!rulesOf(state).fullStack || !hasFullStack(state, player)) return [];
  return legalClusterVertices(state, player);
}

/** Can `player` use Integrated Deployment right now (ignoring which vertex)? */
export function checkIntegratedDeployment(state: GameState, player: number): Check {
  const rules = rulesOf(state);
  if (!rules.fullStack) {
    const classic = !rules.financing && !rules.marketEvents; // every variant off = Classic Mode
    return { ok: false, reason: classic ? 'Full-Stack Integration is off in Classic Mode.' : 'Full-Stack Integration is off in this game.' };
  }
  if (!hasFullStack(state, player)) {
    const progress = fullStackProgress(state, player);
    return { ok: false, reason: `Unlock Full-Stack Integration first (${progress.done}/${progress.total} milestones).` };
  }
  const t = turnCheck(state, player);
  if (!t.ok) return t;
  if (piecesLeft(state, player).factory <= 0) return { ok: false, reason: 'All 4 AI Factories are built.' };
  if (legalClusterVertices(state, player).length === 0) return { ok: false, reason: 'No open site on your network.' };
  const hand = state.players[player].resources;
  if (!hasBundle(hand, INTEGRATED_DEPLOYMENT_COST)) {
    return { ok: false, reason: `Need ${describeBundle(missingFor(hand, INTEGRATED_DEPLOYMENT_COST))} more.` };
  }
  return { ok: true };
}

/** Reducer body for BUILD_INTEGRATED_FACTORY. `s` is already cloned. */
export function applyIntegratedDeployment(s: GameState, actor: number, vertex: number): void {
  const check = checkIntegratedDeployment(s, actor);
  if (!check.ok) throw new GameError(check.reason);
  if (!legalIntegratedVertices(s, actor).includes(vertex)) {
    throw new GameError('Integrated Deployment needs an open site on your network, 2+ steps from any building.');
  }
  pay(s, actor, INTEGRATED_DEPLOYMENT_COST);
  s.buildings[vertex] = { owner: actor, kind: 'factory' }; // a new, unfinanced factory: no cluster piece used
  addLog(s, 'build', actor, `${nameOf(s, actor)} used Integrated Deployment: an AI Factory deployed straight onto a new site (+2 CP).`);
  const before = s.longestRoadHolder;
  updateLongestNetwork(s); // a new building can cut a rival's network
  announceLongest(s, before);
}
