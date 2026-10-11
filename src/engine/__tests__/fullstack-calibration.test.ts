import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decideAIAction } from '../ai';
import { COMPANIES, COMPUTE_RULES, bundle } from '../constants';
import { isFinanced } from '../financing';
import {
  FULLSTACK_MIN_FACTORIES,
  FULLSTACK_MIN_NETWORK,
  FULLSTACK_MIN_RESOURCE_TYPES,
  FULLSTACK_MIN_SITES,
  largestConnectedNetwork,
  touchedResourceTypes,
} from '../fullstack';
import type { MilestoneId } from '../fullstack';
import { applyAction, createGame, getActingPlayer } from '../game';
import { victoryPoints } from '../scoring';
import type { ActionType, GameState, RuleOptions } from '../types';
import { ALL_AI, conservation } from './helpers';

// Full-Stack calibration (dev tool, skipped by default). Results: docs/FULLSTACK_CALIBRATION.md.
//   SIM_FULLSTACK=1 npx vitest run src/engine/__tests__/fullstack-calibration.test.ts
// Optional: SIM_FULLSTACK_GAMES=<n> (default 200), SIM_FULLSTACK_SEED=<first seed> (default 7000),
// SIM_FULLSTACK_OUT=<file.md> to save the report.
//
// All-AI games on the same seeds under three rule sets: Classic (no rules), Financing only, and
// COMPUTE_RULES (Financing + Full-Stack). Measures game length, Full-Stack unlocks (when, at what
// CP, which milestone was reached last), how often each build is used, and who wins. Alternative
// thresholds are evaluated "virtually" on the COMPUTE_RULES trajectories (the AI's light-touch
// milestone chase follows the engine's thresholds, so these are indicative, not exact).

const MILESTONES: MilestoneId[] = ['factory', 'sites', 'resources', 'network'];

interface Thresholds {
  name: string;
  factories: number;
  sites: number;
  types: number;
  network: number;
}

const ENGINE: Thresholds = {
  name: `engine (${FULLSTACK_MIN_FACTORIES}F/${FULLSTACK_MIN_SITES}S/${FULLSTACK_MIN_RESOURCE_TYPES}R/${FULLSTACK_MIN_NETWORK}N)`,
  factories: FULLSTACK_MIN_FACTORIES,
  sites: FULLSTACK_MIN_SITES,
  types: FULLSTACK_MIN_RESOURCE_TYPES,
  network: FULLSTACK_MIN_NETWORK,
};

const VARIANTS: Thresholds[] = [
  ENGINE,
  { name: '1F/3S/4R/3N', factories: 1, sites: 3, types: 4, network: 3 },
  { name: '1F/3S/4R/5N', factories: 1, sites: 3, types: 4, network: 5 },
  { name: '1F/4S/4R/4N', factories: 1, sites: 4, types: 4, network: 4 },
  { name: '1F/3S/5R/4N', factories: 1, sites: 3, types: 5, network: 4 },
];

interface Measure {
  operational: number;
  sites: number;
  types: number;
  network: number;
}

function measure(s: GameState, p: number): Measure {
  let operational = 0;
  let sites = 0;
  for (const b of s.buildings) {
    if (!b || b.owner !== p) continue;
    sites++;
    if (b.kind === 'factory' && !isFinanced(b)) operational++;
  }
  return { operational, sites, types: touchedResourceTypes(s, p).length, network: largestConnectedNetwork(s, p) };
}

function flags(m: Measure, t: Thresholds): Record<MilestoneId, boolean> {
  return { factory: m.operational >= t.factories, sites: m.sites >= t.sites, resources: m.types >= t.types, network: m.network >= t.network };
}

const allOf = (f: Record<MilestoneId, boolean>) => MILESTONES.every((id) => f[id]);

function roundOf(s: GameState): number {
  return Math.floor((Math.max(1, s.turn) - 1) / s.players.length) + 1;
}

interface Unlock {
  turn: number;
  round: number;
  cp: number;
  /** Milestones that turned true on the unlocking action (the last one reached). */
  binding: MilestoneId[];
  /** Did it happen on another company's turn (e.g. a financed factory completing on a rival's roll)? */
  offTurn: boolean;
}

const COUNTED: ActionType[] = ['BUILD_INTEGRATED_FACTORY', 'BUILD_FACTORY', 'BUILD_FINANCED_FACTORY', 'REFINANCE', 'BUILD_CLUSTER', 'BUILD_ROAD', 'BUY_CARD'];

interface CompanyRecord {
  seat: number;
  company: string;
  /** Engine unlock (fullStackTurn) with context; null if never unlocked. */
  unlock: Unlock | null;
  /** Virtual unlocks per threshold variant (index-aligned with VARIANTS). */
  virtual: (Unlock | null)[];
  builds: Record<string, number>;
  /** Milestone flags (engine thresholds) right after the opening draft. */
  opening: Record<MilestoneId, boolean>;
  finalCp: number;
  won: boolean;
}

interface GameRecord {
  seed: number;
  turns: number;
  rounds: number;
  finished: boolean;
  winner: number | null;
  companies: CompanyRecord[];
}

function playGame(seed: number, rules: Partial<RuleOptions> | undefined, variants: boolean): GameRecord {
  let s = createGame({ seed, seats: ALL_AI, ...(rules ? { rules } : {}) });
  const n = s.players.length;
  const companies: CompanyRecord[] = s.players.map((pl) => ({
    seat: pl.id,
    company: pl.companyId,
    unlock: null,
    virtual: VARIANTS.map(() => null),
    builds: Object.fromEntries(COUNTED.map((t) => [t, 0])),
    opening: flags(measure(s, pl.id), ENGINE),
    finalCp: 0,
    won: false,
  }));
  const fullStack = !!rules?.fullStack;
  const prev = s.players.map((_, p) => VARIANTS.map((t) => flags(measure(s, p), t)));
  let steps = 0;
  while (s.phase !== 'gameOver' && steps < 6000) {
    const actor = getActingPlayer(s)!;
    const mover = s.currentPlayer;
    const free = s.phase === 'freeRoads'; // Network Expansion card roads are not counted as builds
    const a = decideAIAction(s, actor);
    s = applyAction(s, a);
    steps++;
    if (COUNTED.includes(a.type) && !free) companies[actor].builds[a.type]++;
    if (!fullStack && !variants) continue;
    const round = roundOf(s);
    for (let p = 0; p < n; p++) {
      const rec = companies[p];
      const needEngine = fullStack && rec.unlock === null;
      const needVariants = variants && rec.virtual.some((u) => u === null);
      if (!needEngine && !needVariants) continue;
      const m = measure(s, p);
      VARIANTS.forEach((t, i) => {
        const f = flags(m, t);
        const unlock = (): Unlock => ({
          turn: s.turn,
          round,
          cp: victoryPoints(s, p, true),
          binding: MILESTONES.filter((id) => !prev[p][i][id]),
          offTurn: p !== mover,
        });
        if (i === 0 && needEngine && s.players[p].fullStackTurn !== undefined) {
          rec.unlock = unlock();
          // The engine's own rule and this measurement must agree.
          expect(allOf(f), `seed ${seed} seat ${p}`).toBe(true);
          expect(s.players[p].fullStackTurn).toBe(s.turn);
        }
        if (variants && rec.virtual[i] === null && allOf(f)) rec.virtual[i] = unlock();
        prev[p][i] = f;
      });
    }
  }
  expect(conservation(s)).toEqual(bundle({ power: 19, networking: 19, land: 19, capital: 19, gpu: 19 }));
  for (const rec of companies) {
    rec.finalCp = victoryPoints(s, rec.seat, true);
    rec.won = s.winner === rec.seat;
  }
  return { seed, turns: s.turn, rounds: roundOf(s), finished: s.phase === 'gameOver', winner: s.winner, companies };
}

// ---------------------------------------------------------------------------
// Statistics helpers
// ---------------------------------------------------------------------------

function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const sorted = xs.slice().sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (k: number, total: number) => (total ? `${((100 * k) / total).toFixed(1)}%` : '–');
const f1 = (x: number) => (Number.isNaN(x) ? '–' : x.toFixed(1));
const f2 = (x: number) => (Number.isNaN(x) ? '–' : x.toFixed(2));
const iqr = (xs: number[]) => (xs.length ? `${f1(quantile(xs, 0.5))} (${f1(quantile(xs, 0.25))}–${f1(quantile(xs, 0.75))})` : '–');

function companyName(id: string): string {
  return COMPANIES.find((c) => c.id === id)?.name ?? id;
}

interface Arm {
  name: string;
  rules: Partial<RuleOptions> | undefined;
  games: GameRecord[];
}

function perGame(games: GameRecord[], type: ActionType): number {
  return mean(games.map((g) => g.companies.reduce((n, c) => n + c.builds[type], 0)));
}

function report(arms: Arm[]): string {
  const out: string[] = [];
  const seeds = arms[0].games.map((g) => g.seed);
  out.push(`Seeds ${seeds[0]}–${seeds[seeds.length - 1]} (${seeds.length} games per rule set, 4 AI companies, Quick Start, all seats AI).`);
  out.push('');
  out.push('### Game length and builds per game (all companies together)');
  out.push('');
  out.push('| Rule set | Finished | Turns, mean | Turns, median | Rounds, mean | Rounds, median (IQR) | Clusters | Std factories | Financed upgrades | Refinances | Integrated Deployments | Connections | Cards |');
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const arm of arms) {
    const g = arm.games;
    out.push(
      `| ${arm.name} | ${g.filter((x) => x.finished).length}/${g.length} | ${f1(mean(g.map((x) => x.turns)))} | ${f1(quantile(g.map((x) => x.turns), 0.5))} | ${f1(mean(g.map((x) => x.rounds)))} | ${iqr(g.map((x) => x.rounds))} | ${f2(perGame(g, 'BUILD_CLUSTER'))} | ${f2(perGame(g, 'BUILD_FACTORY'))} | ${f2(perGame(g, 'BUILD_FINANCED_FACTORY'))} | ${f2(perGame(g, 'REFINANCE'))} | ${f2(perGame(g, 'BUILD_INTEGRATED_FACTORY'))} | ${f2(perGame(g, 'BUILD_ROAD'))} | ${f2(perGame(g, 'BUY_CARD'))} |`,
    );
  }
  out.push('');
  out.push('### Win share by company (seat 0–3 = Parallax, Helixa, Ambulo, Stacksmith)');
  out.push('');
  out.push(`| Rule set | ${COMPANIES.map((c) => c.name).join(' | ')} | Winner final CP, mean | Loser final CP, mean |`);
  out.push(`| --- | ${COMPANIES.map(() => '---').join(' | ')} | --- | --- |`);
  for (const arm of arms) {
    const all = arm.games.flatMap((g) => g.companies);
    out.push(
      `| ${arm.name} | ${COMPANIES.map((c) => pct(arm.games.filter((g) => g.winner !== null && g.companies[g.winner].company === c.id).length, arm.games.length)).join(' | ')} | ${f1(mean(all.filter((c) => c.won).map((c) => c.finalCp)))} | ${f1(mean(all.filter((c) => !c.won).map((c) => c.finalCp)))} |`,
    );
  }

  // Counterfactual: the same milestones (engine thresholds) measured in games where Full-Stack is off.
  for (const arm of arms.filter((a) => !a.rules?.fullStack && a.games.some((g) => g.companies.some((c) => c.virtual[0])))) {
    const all = arm.games.flatMap((g) => g.companies);
    const met = all.filter((c) => c.virtual[0]);
    const winners = all.filter((c) => c.won);
    out.push('');
    out.push(`### Counterfactual — ${arm.name} (Full-Stack off; milestones measured, nothing unlocked)`);
    out.push('');
    out.push(`Companies meeting all four milestones at some point: ${pct(met.length, all.length)} (${met.length}/${all.length}); CP at that moment median (IQR) ${iqr(met.map((c) => c.virtual[0]!.cp))}, round median ${f1(quantile(met.map((c) => c.virtual[0]!.round), 0.5))}. Winners who met them: ${pct(winners.filter((c) => c.virtual[0]).length, winners.length)}. Win rate: met ${pct(met.filter((c) => c.won).length, met.length)} vs never met ${pct(all.filter((c) => !c.virtual[0] && c.won).length, all.length - met.length)}.`);
  }

  for (const arm of arms.filter((a) => a.rules?.fullStack)) {
    const games = arm.games;
    const all = games.flatMap((g) => g.companies);
    const unlocked = all.filter((c) => c.unlock);
    const roundsOf = (c: CompanyRecord) => games.find((g) => g.companies.includes(c))!.rounds;
    out.push('');
    out.push(`### Full-Stack unlocks — ${arm.name}`);
    out.push('');
    out.push(`Companies unlocking: **${pct(unlocked.length, all.length)}** (${unlocked.length}/${all.length}). Games with at least one unlock: **${pct(games.filter((g) => g.companies.some((c) => c.unlock)).length, games.length)}**. Unlocks per game: ${[0, 1, 2, 3, 4].map((k) => `${k}: ${games.filter((g) => g.companies.filter((c) => c.unlock).length === k).length}`).join(' · ')}.`);
    out.push('');
    out.push(`CP at unlock (hidden CP included): mean ${f1(mean(unlocked.map((c) => c.unlock!.cp)))}, median (IQR) ${iqr(unlocked.map((c) => c.unlock!.cp))}. Round at unlock: mean ${f1(mean(unlocked.map((c) => c.unlock!.round)))}, median (IQR) ${iqr(unlocked.map((c) => c.unlock!.round))}. Rounds left after the unlock: median ${f1(quantile(unlocked.map((c) => roundsOf(c) - c.unlock!.round), 0.5))}, mean ${f1(mean(unlocked.map((c) => roundsOf(c) - c.unlock!.round)))}.`);
    const hist = new Map<number, number>();
    for (const c of unlocked) hist.set(c.unlock!.cp, (hist.get(c.unlock!.cp) ?? 0) + 1);
    out.push('');
    out.push(`Milestones already met after the opening draft (round 1): ${MILESTONES.map((id) => `${id} ${pct(all.filter((c) => c.opening[id]).length, all.length)}`).join(' · ')}.`);
    out.push('');
    out.push(`CP at unlock: ${[...hist.entries()].sort((a, b) => a[0] - b[0]).map(([cp, k]) => `${cp} CP: ${k} (${pct(k, unlocked.length)})`).join(' · ')}. In the 4–6 CP band: **${pct(unlocked.filter((c) => c.unlock!.cp >= 4 && c.unlock!.cp <= 6).length, unlocked.length)}**. Unlocked on a rival's turn: ${unlocked.filter((c) => c.unlock!.offTurn).length}.`);
    out.push('');
    out.push('| Binding milestone (reached last) | Share of unlocks | Sole binding |');
    out.push('| --- | --- | --- |');
    for (const id of MILESTONES) {
      const k = unlocked.filter((c) => c.unlock!.binding.includes(id)).length;
      const sole = unlocked.filter((c) => c.unlock!.binding.length === 1 && c.unlock!.binding[0] === id).length;
      out.push(`| ${id} | ${pct(k, unlocked.length)} (${k}) | ${pct(sole, unlocked.length)} (${sole}) |`);
    }
    out.push('');
    const deployers = all.filter((c) => c.builds.BUILD_INTEGRATED_FACTORY > 0);
    out.push(`Integrated Deployments: ${f2(perGame(games, 'BUILD_INTEGRATED_FACTORY'))} per game; ${pct(deployers.length, unlocked.length)} of unlockers deploy at least once (${f2(mean(deployers.map((c) => c.builds.BUILD_INTEGRATED_FACTORY)))} per deployer); games with at least one deployment: ${pct(games.filter((g) => g.companies.some((c) => c.builds.BUILD_INTEGRATED_FACTORY > 0)).length, games.length)}.`);
    out.push('');
    out.push('| Group | Company-games | Win rate | Final CP, mean |');
    out.push('| --- | --- | --- | --- |');
    const row = (label: string, cs: CompanyRecord[]) => out.push(`| ${label} | ${cs.length} | ${pct(cs.filter((c) => c.won).length, cs.length)} | ${f1(mean(cs.map((c) => c.finalCp)))} |`);
    row('Unlocked Full-Stack', unlocked);
    row('Never unlocked', all.filter((c) => !c.unlock));
    row('Deployed at least once', deployers);
    row('Unlocked, never deployed', unlocked.filter((c) => c.builds.BUILD_INTEGRATED_FACTORY === 0));
    const winners = all.filter((c) => c.won);
    out.push('');
    out.push(`Winners who had unlocked: ${pct(winners.filter((c) => c.unlock).length, winners.length)} (${winners.filter((c) => c.unlock).length}/${winners.length}); winners who deployed: ${pct(winners.filter((c) => c.builds.BUILD_INTEGRATED_FACTORY > 0).length, winners.length)}.`);
    out.push('');
    out.push('| Company | Unlock rate | CP at unlock, median | Round at unlock, median | Deployments / game | Win share |');
    out.push('| --- | --- | --- | --- | --- | --- |');
    for (const c of COMPANIES) {
      const cs = all.filter((x) => x.company === c.id);
      const us = cs.filter((x) => x.unlock);
      out.push(
        `| ${companyName(c.id)} | ${pct(us.length, cs.length)} | ${f1(quantile(us.map((x) => x.unlock!.cp), 0.5))} | ${f1(quantile(us.map((x) => x.unlock!.round), 0.5))} | ${f2(mean(cs.map((x) => x.builds.BUILD_INTEGRATED_FACTORY)))} | ${pct(cs.filter((x) => x.won).length, games.length)} |`,
      );
    }
    if (games[0].companies[0].virtual.length > 1) {
      out.push('');
      out.push('Alternative thresholds on the same trajectories (virtual; F = operational factories, S = sites, R = resource types, N = connected network):');
      out.push('');
      out.push('| Thresholds | Unlock rate | CP at unlock, median (IQR) | In 4–6 CP | Round, median | Rounds left, median | Binding: factory / sites / resources / network |');
      out.push('| --- | --- | --- | --- | --- | --- | --- |');
      VARIANTS.forEach((t, i) => {
        const us = all.filter((c) => c.virtual[i]);
        const bind = MILESTONES.map((id) => pct(us.filter((c) => c.virtual[i]!.binding.includes(id)).length, us.length)).join(' / ');
        out.push(
          `| ${t.name} | ${pct(us.length, all.length)} | ${iqr(us.map((c) => c.virtual[i]!.cp))} | ${pct(us.filter((c) => c.virtual[i]!.cp >= 4 && c.virtual[i]!.cp <= 6).length, us.length)} | ${f1(quantile(us.map((c) => c.virtual[i]!.round), 0.5))} | ${f1(quantile(us.map((c) => roundsOf(c) - c.virtual[i]!.round), 0.5))} | ${bind} |`,
        );
      });
    }
  }
  return out.join('\n');
}

const GAMES = Number(process.env.SIM_FULLSTACK_GAMES ?? 200);
const FIRST_SEED = Number(process.env.SIM_FULLSTACK_SEED ?? 7000);
const SEEDS = Array.from({ length: GAMES }, (_, i) => FIRST_SEED + i);

describe.runIf(process.env.SIM_FULLSTACK)('Full-Stack calibration (simulation)', () => {
  it('compares Classic, Financing only and COMPUTE_RULES on the same seeds', () => {
    const t0 = performance.now();
    const arms: Arm[] = [
      { name: 'Classic', rules: undefined, games: [] },
      { name: 'Financing only', rules: { financing: true }, games: [] },
      { name: 'COMPUTE_RULES', rules: COMPUTE_RULES, games: [] },
    ];
    // Milestones are tracked in every arm except Classic (the Financing-only arm is the counterfactual).
    for (const arm of arms) arm.games = SEEDS.map((seed) => playGame(seed, arm.rules, !!arm.rules));
    const text = report(arms);
    console.log(text);
    if (process.env.SIM_FULLSTACK_OUT) writeFileSync(process.env.SIM_FULLSTACK_OUT, text);
    console.log(`total: ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    for (const arm of arms) expect(arm.games.every((g) => g.finished), arm.name).toBe(true);
  }, 3_600_000);
});
