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
  name: string;
  isAI: boolean;
  resources: ResourceBundle;
  /** Unplayed Innovation Cards (AI Breakthrough cards stay here and score secretly). */
  devCards: DevCard[];
  /** Infrastructure Priority cards played (largest-army analogue). */
  priorityPlayed: number;
}

export type BuildingKind = 'cluster' | 'factory';

export interface Building {
  owner: number;
  kind: BuildingKind;
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
}

export interface ProductionReport {
  roll: number;
  /** Tiles whose number matched the roll (including a blocked one). */
  tileIds: number[];
  blockedTileId: number | null;
  /** Resources gained per player index. */
  gains: ResourceBundle[];
  shortages: Resource[];
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
