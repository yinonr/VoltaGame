import type { BuildingKind, DevCardType, GameState, PortType, Resource, ResourceBundle, RuleOptions, TileType } from './types';
import { RESOURCES } from './types';

export const VP_TO_WIN = 10;
export const HAND_LIMIT = 7;
export const BANK_SUPPLY_PER_RESOURCE = 19;
export const LONGEST_NETWORK_MIN = 5;
export const LARGEST_PRIORITY_MIN = 3;

export const PIECE_LIMITS: Record<'road' | BuildingKind, number> = {
  road: 15,
  cluster: 5,
  factory: 4,
};

export function bundle(partial: Partial<ResourceBundle> = {}): ResourceBundle {
  return {
    power: partial.power ?? 0,
    networking: partial.networking ?? 0,
    land: partial.land ?? 0,
    capital: partial.capital ?? 0,
    gpu: partial.gpu ?? 0,
  };
}

export type BuildType = 'road' | 'cluster' | 'factory' | 'card';

export const COSTS: Record<BuildType, ResourceBundle> = {
  road: bundle({ power: 1, networking: 1 }),
  cluster: bundle({ power: 1, networking: 1, land: 1, capital: 1 }),
  factory: bundle({ capital: 3, gpu: 2 }),
  card: bundle({ land: 1, capital: 1, gpu: 1 }),
};

export const BUILD_LABELS: Record<BuildType, string> = {
  road: 'Network Connection',
  cluster: 'Compute Cluster',
  factory: 'AI Factory',
  card: 'Innovation Card',
};

/** 4 Power, 3 Networking, 4 Land, 4 Capital, 3 GPUs, 1 barren. */
export const TILE_DISTRIBUTION: TileType[] = [
  'power', 'power', 'power', 'power',
  'networking', 'networking', 'networking',
  'land', 'land', 'land', 'land',
  'capital', 'capital', 'capital', 'capital',
  'gpu', 'gpu', 'gpu',
  'barren',
];

/** 2 and 12 once; 3–6 and 8–11 twice. No 7. */
export const NUMBER_TOKENS: number[] = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

export const PORT_TYPES: PortType[] = ['any', 'any', 'any', 'any', 'power', 'networking', 'land', 'capital', 'gpu'];

export const DEV_DECK_COMPOSITION: Record<DevCardType, number> = {
  priority: 14,
  expansion: 2,
  grant: 2,
  consolidation: 2,
  breakthrough: 5,
  integration: 0, // Volta special card: only shuffled in when the game enables Volta cards
};

/** Extra cards added to the deck when a game enables Volta special cards. */
export const VOLTA_CARD_COMPOSITION: Partial<Record<DevCardType, number>> = {
  integration: 2,
};

/** Expedited Deployment (legacy Volta beta card, id 'integration'): an AI Factory straight onto a new site. */
export const INTEGRATION_COST: ResourceBundle = bundle({ land: 1, capital: 3, gpu: 2 });

// ---------------------------------------------------------------------------
// Rules variants
// ---------------------------------------------------------------------------

/** Classic Mode: the original Catan-inspired rules. Also what old saves (no `rules` field) play. */
export const CLASSIC_RULES: RuleOptions = { financing: false, fullStack: false, marketEvents: false };

/** The flagship Settlers of Compute rules: intentional Financing + earnable Full-Stack Integration. */
export const COMPUTE_RULES: RuleOptions = { financing: true, fullStack: true, marketEvents: false };

/** The rules a game is played under. Old saves without the field play Classic. */
export function rulesOf(state: Pick<GameState, 'rules'>): RuleOptions {
  return state.rules ?? CLASSIC_RULES;
}

// ---------------------------------------------------------------------------
// Infrastructure Financing (intentional upgrade path, rules.financing)
// ---------------------------------------------------------------------------

/** Upfront cost of a financed AI Factory upgrade (vs. COSTS.factory = 3 Capital + 2 GPUs). */
export const FINANCING_COST: ResourceBundle = bundle({ gpu: 2 });
/** Committed bonus units a new financed factory owes before it becomes a full AI Factory. */
export const FINANCING_COMMITMENT = 3;
/** Most financed factories one company may have outstanding at once (experimental cap). */
export const FINANCING_MAX_OUTSTANDING = 2;
/** Hard ceiling on any one commitment, even after market events extend it. */
export const FINANCING_MAX_COMMITMENT = 5;

// ---------------------------------------------------------------------------
// Full-Stack Integration (earned status, rules.fullStack)
// ---------------------------------------------------------------------------

/** Integrated Deployment: an AI Factory directly on an open network site (8 resources vs. 9 the long way). */
export const INTEGRATED_DEPLOYMENT_COST: ResourceBundle = bundle({ power: 1, land: 1, capital: 3, gpu: 2 });

// ---------------------------------------------------------------------------
// Company names
// ---------------------------------------------------------------------------

export const MAX_COMPANY_NAME = 24;

/**
 * Clean a player-entered company name: strip control and markup characters, collapse
 * whitespace, cap the length. Falls back to `fallback` when nothing usable is left.
 * Names are display-only: they never affect the rules, the RNG or the AI.
 */
export function sanitizeCompanyName(raw: string | null | undefined, fallback: string): string {
  const cleaned = (raw ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/[<>{}\[\]\\`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(cleaned);
  const capped = chars.length > MAX_COMPANY_NAME ? chars.slice(0, MAX_COMPANY_NAME).join('').trim() : cleaned;
  return capped.length > 0 ? capped : fallback;
}

/** Probability "pips" for a production number (ways to roll it out of 36). */
export function pips(n: number | null): number {
  if (n === null || n === 7) return 0;
  return 6 - Math.abs(7 - n);
}

export interface ResourceInfo {
  label: string;
  color: string;
  /** Darker tone used for hex fills. */
  deep: string;
  analog: string;
  blurb: string;
}

export const RESOURCE_INFO: Record<Resource, ResourceInfo> = {
  power: {
    label: 'Power',
    color: '#fbbf24',
    deep: '#7a4a07',
    analog: 'Wood',
    blurb: 'Megawatts on the grid. Every connection and cluster needs it.',
  },
  networking: {
    label: 'Networking',
    color: '#22d3ee',
    deep: '#0b5263',
    analog: 'Brick',
    blurb: 'Fiber, switches and interconnect that tie infrastructure together.',
  },
  land: {
    label: 'Land',
    color: '#a3e635',
    deep: '#3f5a12',
    analog: 'Sheep',
    blurb: 'Permitted, powered sites where infrastructure can actually go.',
  },
  capital: {
    label: 'Capital',
    color: '#f472b6',
    deep: '#6e1d4a',
    analog: 'Wheat',
    blurb: 'Funding to commit to long-term capacity. A game abstraction — no finance modeled.',
  },
  gpu: {
    label: 'GPUs',
    color: '#a78bfa',
    deep: '#3b2580',
    analog: 'Ore',
    blurb: 'Scarce accelerators. The hardest input to secure and the key to AI Factories.',
  },
};

export const BARREN_INFO = {
  label: 'Dead Zone',
  color: '#94a3b8',
  deep: '#1e293b',
  blurb: 'No grid access yet. The Grid Disruption marker starts here.',
};

export const DEV_CARD_INFO: Record<DevCardType, { title: string; analog: string; text: string; short: string; flavor?: string }> = {
  priority: {
    title: 'Infrastructure Priority',
    analog: 'Knight',
    text: 'Move the Grid Disruption marker and take 1 random resource from a rival next to it. Counts toward the Priority Access bonus.',
    short: 'Move the outage, take 1 resource. Counts toward Priority Access.',
  },
  expansion: {
    title: 'Network Expansion',
    analog: 'Road Building',
    text: 'Place 2 Network Connections for free.',
    short: 'Place 2 free connections.',
  },
  grant: {
    title: 'Resource Grant',
    analog: 'Year of Plenty',
    text: 'Take any 2 resources from the market supply.',
    short: 'Take any 2 resources from the market.',
  },
  consolidation: {
    title: 'Market Consolidation',
    analog: 'Monopoly',
    text: 'Name a resource. Every rival gives you all of theirs.',
    short: 'Name a resource; rivals hand over all of it.',
  },
  integration: {
    // Legacy Volta beta card (id kept as 'integration' for save compatibility). Renamed so it is
    // never confused with the earnable Full-Stack Integration status of the Compute rules.
    title: 'Expedited Deployment',
    analog: 'Volta special',
    text: 'Deploy an AI Factory directly onto an open site on your network, skipping the cluster stage. Pay 1 Land + 3 Capital + 2 GPUs; power and connectivity come integrated. +2 CP at once.',
    short: 'Drop a full AI Factory on a new site for 1 Land + 3 Capital + 2 GPUs.',
    flavor: 'One platform. Every layer.',
  },
  breakthrough: {
    title: 'AI Breakthrough',
    analog: 'Victory Point',
    text: 'A secret +1 Compute Point. Revealed when you win.',
    short: 'Secret +1 Compute Point.',
  },
};

export interface CompanyInfo {
  id: string;
  name: string;
  short: string;
  sector: string;
  tagline: string;
  color: string;
  /** Darker/contrast stroke for pieces. */
  stroke: string;
  /** Strategy weights for computer play. No special powers — only preferences. */
  style: {
    expansion: number; // appetite for roads/new clusters
    factories: number; // appetite for AI Factory upgrades
    cards: number; // appetite for Innovation Cards
    trading: number; // willingness to deal
  };
}

export const COMPANIES: CompanyInfo[] = [
  {
    id: 'parallax',
    name: 'Parallax Labs',
    short: 'Parallax',
    sector: 'Frontier AI lab',
    tagline: 'Training the next frontier model on a startup budget.',
    color: '#3b82f6',
    stroke: '#0b1f4d',
    style: { expansion: 1, factories: 1, cards: 1, trading: 1 },
  },
  {
    id: 'helixa',
    name: 'Helixa Bio',
    short: 'Helixa',
    sector: 'AI biotech',
    tagline: 'Folding proteins and designing molecules at GPU speed.',
    color: '#ef4444',
    stroke: '#4a0d0d',
    style: { expansion: 0.9, factories: 1.0, cards: 1.4, trading: 1.1 },
  },
  {
    id: 'ambulo',
    name: 'Ambulo Robotics',
    short: 'Ambulo',
    sector: 'Robotics',
    tagline: 'Embodied AI for warehouses, farms and homes.',
    color: '#fb923c',
    stroke: '#4a2207',
    style: { expansion: 1.4, factories: 0.85, cards: 0.8, trading: 1.0 },
  },
  {
    id: 'stacksmith',
    name: 'Stacksmith',
    short: 'Stacksmith',
    sector: 'Developer tools',
    tagline: 'Coding agents for every developer on Earth.',
    color: '#f1f5f9',
    stroke: '#1e293b',
    style: { expansion: 0.95, factories: 1.35, cards: 0.9, trading: 0.9 },
  },
];

export function companyById(id: string): CompanyInfo {
  return COMPANIES.find((c) => c.id === id) ?? COMPANIES[0];
}

export function sumBundle(b: ResourceBundle): number {
  let n = 0;
  for (const r of RESOURCES) n += b[r];
  return n;
}

export function hasBundle(have: ResourceBundle, need: ResourceBundle): boolean {
  return RESOURCES.every((r) => have[r] >= need[r]);
}

export function addBundle(a: ResourceBundle, b: ResourceBundle): ResourceBundle {
  const out = bundle();
  for (const r of RESOURCES) out[r] = a[r] + b[r];
  return out;
}

export function subBundle(a: ResourceBundle, b: ResourceBundle): ResourceBundle {
  const out = bundle();
  for (const r of RESOURCES) out[r] = a[r] - b[r];
  return out;
}

/** Resources still missing to afford `cost`. */
export function missingFor(have: ResourceBundle, cost: ResourceBundle): ResourceBundle {
  const out = bundle();
  for (const r of RESOURCES) out[r] = Math.max(0, cost[r] - have[r]);
  return out;
}

export function resourceLabel(r: Resource, n = 2): string {
  return r === 'gpu' && n === 1 ? 'GPU' : RESOURCE_INFO[r].label;
}

export function describeBundle(b: ResourceBundle): string {
  const parts: string[] = [];
  for (const r of RESOURCES) if (b[r] > 0) parts.push(`${b[r]} ${resourceLabel(r, b[r])}`);
  return parts.length ? parts.join(', ') : 'nothing';
}
