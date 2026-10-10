import { decideAIAction, evaluateOffer } from './ai';
import { bundle, hasBundle, sumBundle } from './constants';
import { addLog, applyAction, createGame, DEFAULT_SEATS, getActingPlayer } from './game';
import { deriveSeed } from './rng';
import { checkBuild, legalClusterVertices, legalFactoryVertices } from './rules';
import { victoryPoints } from './scoring';
import type { GameState, ResourceBundle } from './types';
import { RESOURCES } from './types';

// Quick Demo: a deterministic midgame position reached by playing the real engine
// (all four seats driven by the computer heuristics from a fixed seed), then handing
// seat 0 to the human right after their roll, with a curated hand that creates a
// meaningful choice: build a cluster now, or trade for a GPU and build an AI Factory.

export const DEMO_SEED = 20261012;

/** The human's hand at the start of the demo. */
export const DEMO_HAND: ResourceBundle = bundle({ power: 1, networking: 1, land: 1, capital: 3, gpu: 1 });

function setHand(s: GameState, player: number, hand: ResourceBundle): boolean {
  const p = s.players[player];
  const bank = { ...s.bank };
  for (const r of RESOURCES) bank[r] += p.resources[r];
  if (!hasBundle(bank, hand)) return false;
  for (const r of RESOURCES) bank[r] -= hand[r];
  s.bank = bank;
  s.players = s.players.map((q) => (q.id === player ? { ...q, resources: { ...hand } } : q));
  return true;
}

function simulateToHumanTurn(seed: number): GameState | null {
  const seats = DEFAULT_SEATS.map((seat) => ({ ...seat, isAI: true }));
  let s = createGame({ seed, seats });
  let steps = 0;
  while (s.phase !== 'gameOver' && steps < 4000) {
    if (s.currentPlayer === 0 && s.phase === 'main' && !s.pendingTrade && s.turn >= 25 && s.lastRoll && s.lastRoll.total !== 7) {
      return s;
    }
    if (s.turn > 64) return null;
    const actor = getActingPlayer(s)!;
    s = applyAction(s, decideAIAction(s, actor));
    steps++;
  }
  return null;
}

function meetsCriteria(s: GameState): boolean {
  const vps = s.players.map((p) => victoryPoints(s, p.id, true));
  const pub = s.players.map((p) => victoryPoints(s, p.id, false));
  if (vps[0] < 4 || vps[0] > 6) return false;
  if (Math.max(...vps) > 7 || Math.min(...pub) < 3) return false;
  if (legalClusterVertices(s, 0).length === 0 || legalFactoryVertices(s, 0).length === 0) return false;
  if (!checkBuild(s, 0, 'cluster').ok || checkBuild(s, 0, 'factory').ok) return false;
  // A rival must be willing to sell the missing GPU, so the deal path is real.
  const willing = s.players.some(
    (p) =>
      p.id !== 0 &&
      (['land', 'power', 'networking'] as const).some((r) => {
        const give = bundle();
        give[r] = 1;
        return evaluateOffer(s, p.id, { from: 0, to: p.id, give, get: bundle({ gpu: 1 }) }).accept;
      }),
  );
  return willing;
}

let cached: GameState | null = null;

export function createDemoGame(): GameState {
  if (cached) return cached;
  for (let i = 0; i < 60; i++) {
    const seed = i === 0 ? DEMO_SEED : deriveSeed(DEMO_SEED, i);
    const sim = simulateToHumanTurn(seed);
    if (!sim) continue;
    const s: GameState = { ...sim, players: sim.players.map((p) => ({ ...p })), log: sim.log.slice(-30) };
    if (!setHand(s, 0, DEMO_HAND)) continue;
    s.players[0] = { ...s.players[0], isAI: false };
    if (!meetsCriteria(s)) continue;
    s.scenario = 'Quick Demo';
    addLog(
      s,
      'system',
      null,
      `Quick Demo: a midgame market reached through real engine play (seed ${seed}). You are Parallax Labs, holding ${sumBundle(DEMO_HAND)} resources. Build a cluster now — or trade for a GPU and open an AI Factory.`,
    );
    cached = s;
    return s;
  }
  throw new Error('No demo scenario satisfied the criteria');
}
