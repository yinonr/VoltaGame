// Core data types for the Settlers of Compute engine.
// Everything in GameState is plain, serializable data so games can be saved,
// replayed from a seed, and (later) synchronized over a network.

export const RESOURCES = ['power', 'networking', 'land', 'capital', 'gpu'] as const;
export type Resource = (typeof RESOURCES)[number];
export type ResourceBundle = Record<Resource, number>;

export type TileType = Resource | 'barren';
export type PortType = Resource | 'any';

export interface Tile {
  id: number;
  q: number;
  r: number;
  /** Center in unit hex coordinates (hex size = 1). */
  x: number;
  y: number;
  type: TileType;
  /** Production number (2–12, never 7); null for the barren tile. */
  number: number | null;
  vertexIds: number[];
  neighborIds: number[];
}

export interface Vertex {
  id: number;
  x: number;
  y: number;
  tileIds: number[];
  edgeIds: number[];
  neighborIds: number[];
  port: PortType | null;
}

export interface Edge {
  id: number;
  a: number;
  b: number;
  tileIds: number[];
}

export interface Port {
  id: number;
  type: PortType;
  edgeId: number;
  vertexIds: [number, number];
  /** Marker position (unit coordinates), pushed out from the coast. */
  x: number;
  y: number;
}

export interface Board {
  seed: number;
  tiles: Tile[];
  vertices: Vertex[];
  edges: Edge[];
  ports: Port[];
}

export type DevCardType = 'priority' | 'expansion' | 'grant' | 'consolidation' | 'breakthrough' | 'integration';

export interface DevCard {
  id: number;
  type: DevCardType;
  boughtOnTurn: number;
}

export interface Player {
  id: number;
  companyId: string;
  /** Display name. Defaults to the company's name; a human may rename their company. */
  name: string;
  isAI: boolean;
  resources: ResourceBundle;
  /** Unplayed Innovation Cards (AI Breakthrough cards stay here and score secretly). */
  devCards: DevCard[];
  /** Infrastructure Priority cards played (largest-army analogue). */
  priorityPlayed: number;
  /** Turn on which this company unlocked Full-Stack Integration (permanent). Absent = locked. */
  fullStackTurn?: number;
}

export type BuildingKind = 'cluster' | 'factory';

export interface Building {
  owner: number;
  kind: BuildingKind;
  /**
   * Infrastructure Financing: committed bonus units still owed by a financed AI Factory.
   * Only meaningful on factories. Every reader must test `(b.financed ?? 0) > 0`; the field is
   * ABSENT (never 0) on unfinanced factories, so old saves read as unfinanced.
   * Buildings are shared between states (cloneState copies the array shallowly):
   * NEVER mutate a Building in place, always write a new object.
   */
  financed?: number;
}

export type Phase =
  | 'setup' // manual snake-draft opening
  | 'preRoll'
  | 'discard' // a 7 was rolled; players over the hand limit discard
  | 'moveDisruption'
  | 'main'
  | 'freeRoads' // Network Expansion card
  | 'gameOver';

export interface SetupState {
  order: number[];
  step: number;
  expecting: 'cluster' | 'road';
  lastVertex: number | null;
}

export interface TradeOffer {
  from: number;
  to: number;
  /** What the proposer gives. */
  give: ResourceBundle;
  /** What the proposer receives. */
  get: ResourceBundle;
}

export type LogKind =
  | 'roll'
  | 'produce'
  | 'build'
  | 'trade'
  | 'disruption'
  | 'card'
  | 'turn'
  | 'system'
  | 'finance' // Infrastructure Financing: financed upgrades, deliveries, completions, refinancing
  | 'milestone' // Full-Stack Integration unlocks
  | 'event' // market events
  | 'win';

export interface LogEntry {
  id: number;
  turn: number;
  player: number | null;
  kind: LogKind;
  text: string;
}

export interface DiceRoll {
  d1: number;
  d2: number;
  total: number;
  /** Grid Stability: a 7 rolled while the grid was stabilizing, so it caused no disruption. */
  stabilized?: boolean;
}

/**
 * Grid Stability timers (rules.gridStability only). Counted in player dice rolls, 7s included.
 * The outage itself is still `GameState.disruptionTile`; "no outage" = the marker rests on the
 * Dead Zone. Absent in Classic games and in saves made before Grid Stability.
 */
export interface GridState {
  /** Protected rolls left: while > 0 a natural 7 causes no discard, theft or outage move. */
  stableRolls: number;
  /** Rolls left before the current outage expires (0 = no timed outage). */
  outageRolls: number;
}

export interface ProductionReport {
  roll: number;
  /** Tiles whose number matched the roll (including a blocked one). */
  tileIds: number[];
  blockedTileId: number | null;
  /** Resources gained per player index. */
  gains: ResourceBundle[];
  shortages: Resource[];
  /** Committed units delivered by financed factories this roll (optional: absent in old saves). */
  deliveries?: Delivery[];
}

/** One committed unit delivered by a financed AI Factory. `left` = units still owed afterwards. */
export interface Delivery {
  player: number;
  vertex: number;
  resource: Resource;
  left: number;
}

/**
 * Rules variant. Absent on a GameState (old saves) means CLASSIC_RULES (everything off).
 * Classic Mode = all false; the flagship "Settlers of Compute" rules = COMPUTE_RULES.
 */
export interface RuleOptions {
  /** Intentional Infrastructure Financing: upgrade a cluster for 2 GPUs plus a production commitment. */
  financing: boolean;
  /** Earnable Full-Stack Integration status, which unlocks Integrated Deployment. */
  fullStack: boolean;
  /** Experimental market events (Credit Crunch and friends). Off by default. */
  marketEvents: boolean;
  /**
   * Grid Stability: after a disruption the next 6 rolls are protected and an outage lasts 4 rolls.
   * Absent in saves made before it existed, which keep the persistent-outage rules they started with.
   */
  gridStability?: boolean;
}

export type MarketEventType = 'creditCrunch' | 'computeBoom';

export interface MarketEvent {
  type: MarketEventType;
  /** Global turn on which it fired. */
  turn: number;
  /** One-line, player-facing summary. */
  text: string;
}

export interface MarketState {
  /** Global turn on which the next event fires (deterministic from the seed). */
  nextEventTurn: number;
  last: MarketEvent | null;
}

export interface GameState {
  version: 1;
  seed: number;
  /** Internal PRNG state; advanced by dice, steals and card draws. */
  rng: number;
  board: Board;
  players: Player[];
  /** Indexed by vertex id. */
  buildings: (Building | null)[];
  /** Indexed by edge id; value is the owning player. */
  roads: (number | null)[];
  disruptionTile: number;
  bank: ResourceBundle;
  devDeck: DevCardType[];
  nextCardId: number;
  currentPlayer: number;
  /** Global turn counter, starting at 1 once regular play begins. */
  turn: number;
  phase: Phase;
  /** Phase to return to after a disruption move triggered by a card. */
  returnPhase: 'preRoll' | 'main' | null;
  setup: SetupState | null;
  pendingDiscards: number[];
  pendingTrade: TradeOffer | null;
  freeRoadsLeft: number;
  lastRoll: DiceRoll | null;
  lastProduction: ProductionReport | null;
  devCardPlayedThisTurn: boolean;
  tradesProposedThisTurn: number;
  turnActionCount: number;
  longestRoadHolder: number | null;
  largestArmyHolder: number | null;
  winner: number | null;
  log: LogEntry[];
  nextLogId: number;
  /** Optional scenario label (e.g. "Quick Demo"). */
  scenario: string | null;
  /** Volta special cards shuffled into the Innovation deck (optional for older saves). */
  voltaCards?: boolean;
  /** Rules variant (optional for older saves: absent = Classic). Read it through `rulesOf(state)`. */
  rules?: RuleOptions;
  /** Market events state (only when rules.marketEvents is on). */
  market?: MarketState;
  /** Grid Stability timers (only when rules.gridStability is on; see grid.ts). */
  grid?: GridState;
}

export type Action =
  | { type: 'SETUP_CLUSTER'; vertex: number }
  | { type: 'SETUP_ROAD'; edge: number }
  | { type: 'ROLL' }
  | { type: 'DISCARD'; resources: ResourceBundle }
  | { type: 'MOVE_DISRUPTION'; tile: number; victim: number | null }
  | { type: 'BUILD_ROAD'; edge: number }
  | { type: 'BUILD_CLUSTER'; vertex: number }
  | { type: 'BUILD_FACTORY'; vertex: number }
  /** Infrastructure Financing: upgrade an own cluster for FINANCING_COST plus a commitment. */
  | { type: 'BUILD_FINANCED_FACTORY'; vertex: number }
  /** Pay off a financed factory's remaining commitment with Capital (not a card play). */
  | { type: 'REFINANCE'; vertex: number }
  /** Full-Stack Integration reward: deploy an AI Factory straight onto an open network site. */
  | { type: 'BUILD_INTEGRATED_FACTORY'; vertex: number }
  | { type: 'BUY_CARD' }
  | { type: 'PLAY_PRIORITY' }
  | { type: 'PLAY_EXPANSION' }
  | { type: 'PLAY_GRANT'; resources: [Resource, Resource] }
  | { type: 'PLAY_CONSOLIDATION'; resource: Resource }
  | { type: 'PLAY_INTEGRATION'; vertex: number }
  | { type: 'BANK_TRADE'; give: Resource; get: Resource }
  | { type: 'PROPOSE_TRADE'; to: number; give: ResourceBundle; get: ResourceBundle }
  | { type: 'RESPOND_TRADE'; accept: boolean; reason?: string }
  | { type: 'END_TURN' };

export type ActionType = Action['type'];
