import { appendFileSync } from 'node:fs';
import { it } from 'vitest';
import { decideAIAction } from '../ai';
import { CLASSIC_RULES, COMPUTE_RULES } from '../constants';
import { isFinanced } from '../financing';
import { applyAction, createGame, getActingPlayer } from '../game';
import type { GameState, RuleOptions } from '../types';
import { ALL_AI } from './helpers';

// Grid Stability balance probe (opt-in; appends a markdown table to $GRID_BALANCE):
//   GRID_BALANCE=/tmp/grid.md N=300 S0=30000 npx vitest run grid-balance
// Compares Classic, Compute rules without Grid Stability and Compute rules with it, measured
// from the action stream, plus the debt-free Financing probe (one rotating seat never finances).
const OUT = process.env.GRID_BALANCE ?? '';

const CONFIGS: [string, RuleOptions][] = [
  ['Classic', CLASSIC_RULES],
  ['Compute, no Grid Stability', { ...COMPUTE_RULES, gridStability: false }],
  ['Compute + Grid Stability', COMPUTE_RULES],
];

const outageOn = (s: GameState) => s.board.tiles[s.disruptionTile].type !== 'barren';

function play(seed: number, rules: RuleOptions, barred: number | null) {
  let s = createGame({ seed, seats: ALL_AI, rules });
  const m = { natural: 0, suppressed: 0, cards: 0, discards: 0, thefts: 0, rolls: 0, outageRolls: 0, outages: 0, financed: 0, refinanced: 0, integrated: 0, repaid: [] as number[], stalled: false };
  const financedAt = new Map<number, number>();
  let steps = 0;
  while (s.phase !== 'gameOver') {
    if (steps++ > 9000) {
      m.stalled = true;
      break;
    }
    const p = getActingPlayer(s)!;
    const view = p === barred ? { ...s, rules: { ...rules, financing: false } } : s;
    const a = decideAIAction(view, p);
    if (a.type === 'ROLL' && outageOn(s)) m.outageRolls++;
    const before = s;
    s = applyAction(s, a);
    if (a.type === 'ROLL') {
      m.rolls++;
      if (s.lastRoll!.total === 7) s.lastRoll!.stabilized ? m.suppressed++ : m.natural++;
    }
    if (a.type === 'PLAY_PRIORITY') m.cards++;
    if (a.type === 'DISCARD') m.discards++;
    if (a.type === 'MOVE_DISRUPTION') {
      if (a.victim !== null) m.thefts++;
      if (s.board.tiles[a.tile].type !== 'barren') m.outages++;
    }
    if (a.type === 'BUILD_FINANCED_FACTORY') {
      m.financed++;
      financedAt.set(a.vertex, s.turn);
    }
    if (a.type === 'REFINANCE') {
      m.refinanced++;
      financedAt.delete(a.vertex);
    }
    if (a.type === 'BUILD_INTEGRATED_FACTORY') m.integrated++;
    for (const [v, turn] of financedAt) {
      if (isFinanced(before.buildings[v]) && !isFinanced(s.buildings[v])) {
        m.repaid.push((s.turn - turn) / s.players.length);
        financedAt.delete(v);
      }
    }
  }
  return { s, m };
}

it.runIf(OUT)('Grid Stability balance probe', () => {
  const N = Number(process.env.N ?? 300);
  const S0 = Number(process.env.S0 ?? 30000);
  const rows: string[] = [];
  for (const [label, rules] of CONFIGS) {
    const t = { games: 0, rounds: 0, natural: 0, suppressed: 0, cards: 0, discards: 0, thefts: 0, rolls: 0, outageRolls: 0, outages: 0, financed: 0, refinanced: 0, integrated: 0, repaid: [] as number[], stalled: 0, unlocks: 0, wins: [0, 0, 0, 0] };
    for (let seed = S0; seed < S0 + N; seed++) {
      const { s, m } = play(seed, rules, null);
      t.games++;
      t.rounds += Math.ceil(s.turn / 4);
      for (const k of ['natural', 'suppressed', 'cards', 'discards', 'thefts', 'rolls', 'outageRolls', 'outages', 'financed', 'refinanced', 'integrated'] as const) t[k] += m[k];
      t.repaid.push(...m.repaid);
      if (m.stalled) t.stalled++;
      t.unlocks += s.players.filter((p) => p.fullStackTurn !== undefined).length;
      if (s.winner !== null) t.wins[s.winner]++;
    }
    const per = (n: number) => (n / t.games).toFixed(2);
    const mean = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '—');
    rows.push(
      `| ${label} | ${(t.rounds / t.games).toFixed(1)} | ${per(t.natural)} | ${per(t.suppressed)} | ${per(t.cards)} | ${(t.outageRolls / Math.max(1, t.outages)).toFixed(1)} | ${((100 * t.outageRolls) / t.rolls).toFixed(0)}% | ${per(t.discards)} | ${per(t.thefts)} | ${per(t.financed)} | ${per(t.refinanced)} | ${mean(t.repaid)} | ${((100 * t.unlocks) / (4 * t.games)).toFixed(0)}% | ${per(t.integrated)} | ${t.wins.map((w) => ((100 * w) / t.games).toFixed(0)).join(' / ')} | ${t.stalled} |`,
    );
  }
  // Debt-free probe under the new rules.
  let barredWins = 0;
  for (let seed = S0; seed < S0 + N; seed++) {
    const { s } = play(seed, COMPUTE_RULES, seed % 4);
    if (s.winner === seed % 4) barredWins++;
  }
  appendFileSync(
    OUT,
    [
      `\n### Seeds ${S0}–${S0 + N - 1} (${N} games per row, 4 AI companies)\n`,
      '| Rules | Rounds | Natural disruptions / game | Suppressed 7s / game | Priority cards / game | Outage length (rolls) | Rolls with an outage | Discards / game | Thefts / game | Financed / game | Refinanced / game | Rounds to repay | Full-Stack unlock | Integrated / game | Wins P/H/A/S % | Stalls |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...rows,
      `\nDebt-free seat (never finances) under Compute + Grid Stability: ${((100 * barredWins) / N).toFixed(1)}% (${barredWins}/${N}; fair 25%).\n`,
    ].join('\n'),
  );
}, 1800000);
