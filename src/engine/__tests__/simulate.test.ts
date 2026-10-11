import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decideAIAction } from '../ai';
import { bundle } from '../constants';
import { isFinanced } from '../financing';
import { applyAction, createGame, getActingPlayer } from '../game';
import {
  SIM_CONFIG_NAMES,
  aggregate,
  compareTo,
  formatMarkdown,
  isSimConfigName,
  runBatch,
  runGame,
  simSeats,
} from '../../sim/simulate';
import type { GameMetrics, SimConfigName, SimSummary } from '../../sim/simulate';
import type { Action, GameState } from '../types';
import { ALL_AI, setHand } from './helpers';

// Balance simulation harness (src/sim/simulate.ts).
// - Always on: a fast smoke test so the harness cannot rot.
// - Gated: `SIM=1 npx vitest run src/engine/__tests__/simulate.test.ts` plays full batches and writes
//   JSON + a markdown report. See docs/BALANCE.md for the variables and the reproduction commands.

describe('simulation harness', () => {
  it('plays every config to decided, legal, conserved games and summarizes them', () => {
    for (const name of SIM_CONFIG_NAMES) {
      const games = runBatch({ config: name, games: 3, seed: 31000 });
      for (const g of games) {
        const where = `${name} seed ${g.seed}`;
        expect(g.status, where).toBe('won');
        expect(g.illegal, where).toBeNull();
        expect(g.stalled, where).toBe(false);
        expect(g.invariantViolations, where).toEqual([]); // conservation + input immutability, every action
        expect(g.companies[g.winner!.seat].cp, where).toBeGreaterThanOrEqual(10);
        expect(g.rounds).toBe(Math.ceil(g.turns / 4));
      }
      const sum = aggregate(games);
      expect(sum.config).toBe(name);
      expect(sum.games).toBe(3);
      expect(sum.decided + sum.stalls + sum.aborts).toBe(3);
      expect(sum.winsByCompany.reduce((n, r) => n + r.wins, 0)).toBe(sum.decided);
      expect(sum.winsBySeat).toHaveLength(4);
      expect(sum.length.turns.n).toBe(sum.decided);
      expect(sum.length.turns.p10).toBeLessThanOrEqual(sum.length.turns.p90);
      expect(sum.profile.bySpecialization.reduce((n, r) => n + r.n, 0)).toBe(sum.decided * 4);
      expect(sum.financing.financers.n + sum.financing.nonFinancers.n).toBe(sum.decided * 4);
      expect(sum.fullStack.unlockers.n + sum.fullStack.nonUnlockers.n).toBe(sum.decided * 4);
    }
  });

  it('is deterministic and observes the game without changing it', () => {
    const a = runGame({ seed: 55 });
    const b = runGame({ seed: 55 });
    expect(a).toEqual(b);
    // The same game played by a bare loop (as ai-demo.test.ts does) ends identically.
    let s = createGame({ seed: 55, seats: ALL_AI });
    let steps = 0;
    while (s.phase !== 'gameOver') {
      s = applyAction(s, decideAIAction(s, getActingPlayer(s)!));
      steps++;
    }
    expect(a.steps).toBe(steps);
    expect(a.turns).toBe(s.turn);
    expect(a.winner?.seat).toBe(s.winner);
  });

  it('seats companies in default order, or rotated, for 2–4 players', () => {
    expect(simSeats(4).map((x) => x.companyId)).toEqual(['parallax', 'helixa', 'ambulo', 'stacksmith']);
    expect(simSeats(3, 1).map((x) => x.companyId)).toEqual(['helixa', 'ambulo', 'stacksmith']);
    expect(simSeats(2, 3).map((x) => x.companyId)).toEqual(['stacksmith', 'parallax']);
    expect(simSeats(4).every((x) => x.isAI)).toBe(true);
    const two = runBatch({ config: 'classic', games: 1, seed: 31000, players: 2 })[0];
    expect(two.players).toBe(2);
    expect(two.rounds).toBe(Math.ceil(two.turns / 2));
  });

  it('tracks financed factories and Full-Stack unlocks it is handed', () => {
    // The engine stubs never create these yet, so plant them: a financed factory and an unlock.
    let s = createGame({ seed: 77, seats: ALL_AI });
    const v = s.buildings.findIndex((b) => b?.owner === 2 && b.kind === 'cluster');
    const buildings = s.buildings.slice();
    buildings[v] = { owner: 2, kind: 'factory', financed: 3 };
    s = { ...s, buildings, players: s.players.map((p) => (p.id === 1 ? { ...p, fullStackTurn: 1 } : p)) };
    const m = runGame({ seed: 77, from: s, config: 'planted' });
    expect(m.status).toBe('won');
    expect(m.financing).toHaveLength(1);
    expect(m.financing[0]).toMatchObject({ owner: 2, vertex: v, commitment: 3, turnFinanced: 1, roundFinanced: 1 });
    expect(m.companies[2].maxOutstandingFinancing).toBe(1);
    expect(m.companies[1].fullStack).toMatchObject({ turn: 1, round: 1 });
    const sum = aggregate([m]);
    expect(sum.financing.records).toBe(1);
    expect(sum.fullStack.unlocks).toBe(1);
    expect(formatMarkdown([sum])).toContain('Grid Disruption 7s');
  });

  it('measures commitment completion, refinancing and outage blocks (real financing engine)', () => {
    // Company 2's two opening clusters start as financed factories owing 3 units. The first is left
    // to repay from its output (its 9 hex starts under the outage); the second is refinanced on
    // its owner's first turn.
    const owner = 2;
    let s = createGame({ seed: 77, seats: ALL_AI, rules: { financing: true } });
    s = setHand(s, owner, { ...s.players[owner].resources, capital: s.players[owner].resources.capital + 3 });
    const [early, refi] = s.buildings.map((b, v) => (b?.owner === owner ? v : -1)).filter((v) => v >= 0);
    const buildings = s.buildings.slice();
    for (const v of [early, refi]) buildings[v] = { owner, kind: 'factory', financed: 3 };
    const nine = s.board.vertices[early].tileIds.find((t) => s.board.tiles[t].number === 9)!;
    s = { ...s, buildings, disruptionTile: nine };
    const decide = (st: GameState, p: number): Action => {
      const b = st.buildings[refi];
      if (p === owner && st.currentPlayer === p && st.phase === 'main' && !st.pendingTrade && isFinanced(b) && st.players[p].resources.capital >= b!.financed!) {
        return { type: 'REFINANCE', vertex: refi };
      }
      return decideAIAction(st, p);
    };
    let blocked = 0; // independent count of outage-blocked payouts while a commitment is open
    const apply = (st: GameState, a: Action): GameState => {
      const next = applyAction(st, a);
      const report = next.lastProduction;
      if (a.type === 'ROLL' && report && report.blockedTileId !== null) {
        for (const v of [early, refi]) {
          if (isFinanced(st.buildings[v]) && st.board.vertices[v].tileIds.includes(report.blockedTileId)) blocked++;
        }
      }
      return next;
    };
    const m = runGame({ seed: 77, from: s, decide, apply, config: 'stand-in' });
    expect(m.status).toBe('won');
    expect(m.invariantViolations).toEqual([]);
    const [a, b] = [early, refi].map((v) => m.financing.find((r) => r.vertex === v)!);
    expect(b.status).toBe('refinanced');
    expect(b.unitsRefinanced).toBe(3 - b.deliveries);
    expect(b.refinanceCapital).toBe(b.unitsRefinanced);
    if (a.status === 'completed') {
      expect(a).toMatchObject({ deliveries: 3, refinanceCapital: 0 });
      expect(a.roundsToResolve).toBe((a.turnCompleted! - 1) / 4);
    }
    expect(a.blockedRolls + b.blockedRolls).toBe(blocked);
    expect(m.companies[owner]).toMatchObject({ refinances: m.companies[owner].refinances, refinanceCapital: m.companies[owner].refinanceCapital });
    expect(m.companies[owner].refinances).toBeGreaterThanOrEqual(1);
    const sum = aggregate([m]);
    expect(sum.financing.records).toBeGreaterThanOrEqual(2);
    expect(sum.financing.refinanced).toBeGreaterThanOrEqual(1);
  });

  it('ends a game as aborted, not hidden, when the AI makes an illegal move, and as stalled at a cap', () => {
    // Player 0 offers 3 GPUs it does not hold: the reducer rejects the AI's acceptance.
    let s = createGame({ seed: 12, seats: ALL_AI });
    s = setHand(setHand(s, 0, {}), 1, { land: 2 });
    s = { ...s, phase: 'main', pendingTrade: { from: 0, to: 1, give: bundle({ gpu: 3 }), get: bundle({ land: 1 }) } };
    expect(decideAIAction(s, 1)).toMatchObject({ type: 'RESPOND_TRADE', accept: true });
    const bad = runGame({ seed: 12, from: s, config: 'classic' });
    expect(bad.status).toBe('aborted');
    expect(bad.illegal).toMatchObject({ actionType: 'RESPOND_TRADE', error: 'GameError', companyId: 'helixa' });
    expect(bad.winner).toBeNull();

    const capped = runGame({ seed: 12, maxTurns: 6, config: 'classic' });
    expect(capped).toMatchObject({ status: 'stalled', stalled: true, stallReason: 'maxTurns', winner: null });

    const sum = aggregate([bad, capped, runGame({ seed: 13, config: 'classic' })]);
    expect(sum).toMatchObject({ aborts: 1, stalls: 1, decided: 1 });
    expect(sum.illegal.byKind).toEqual({ 'RESPOND_TRADE: One side can no longer cover this trade.': 1 });
    expect(formatMarkdown([sum])).toContain('One side can no longer cover this trade.');
  });

  it('formats side-by-side reports and baseline comparisons', () => {
    const a = aggregate(runBatch({ config: 'classic', games: 2, seed: 31000 }));
    const b = aggregate(runBatch({ config: 'volta', games: 2, seed: 31000 }));
    const md = formatMarkdown({ classic: a, volta: b }, 'Smoke');
    expect(md).toContain('## Smoke');
    expect(md).toContain('| Length, turns |');
    expect(md).toContain('classic 4p');
    expect(md).toContain('Expedited Deployment');
    const cmp = compareTo(a, b);
    expect(cmp).toContain('volta 4p vs classic 4p');
    expect(cmp).toContain('Length, turns (mean)');
  });
});

// ---------------------------------------------------------------------------
// Gated batch run (SIM=1). Never runs in the normal test suite.
// ---------------------------------------------------------------------------

const DEFAULT_OUT = '/tmp/claude-0/-home-user-VoltaGame/d03e2b9c-8db7-55f9-afb7-3aba694ce90c/scratchpad/sim';

function envList(name: string, fallback: string): string[] {
  return (process.env[name] || fallback)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer, got "${raw}".`);
  return n;
}

describe.runIf(process.env.SIM)('balance simulation (SIM=1)', () => {
  it(
    'plays the requested batches and writes per-config JSON and a markdown report',
    () => {
      const configs = envList('SIM_CONFIGS', 'classic').flatMap((c) => (c === 'all' ? SIM_CONFIG_NAMES : [c]));
      for (const c of configs) if (!isSimConfigName(c)) throw new Error(`Unknown SIM_CONFIGS entry "${c}". Use: ${SIM_CONFIG_NAMES.join(', ')}, all.`);
      const games = envInt('SIM_GAMES', 200);
      const seed = envInt('SIM_SEED', 20000);
      const playerCounts = envList('SIM_PLAYERS', '4').map(Number);
      const rotate = !!process.env.SIM_ROTATE && process.env.SIM_ROTATE !== '0';
      const out = resolve(process.env.SIM_OUT || DEFAULT_OUT);
      if (out === process.cwd() || out.startsWith(process.cwd() + '/')) throw new Error(`SIM_OUT must be outside the repository (${out}).`);
      mkdirSync(out, { recursive: true });

      const summaries: SimSummary[] = [];
      const timing: string[] = [];
      for (const players of playerCounts) {
        for (const name of configs as SimConfigName[]) {
          const t0 = performance.now();
          const metrics: GameMetrics[] = runBatch({ config: name, games, seed, players, rotateSeats: rotate });
          const ms = performance.now() - t0;
          const summary = aggregate(metrics);
          summaries.push(summary);
          const gps = games / (ms / 1000);
          timing.push(`- ${name} ${players}p${rotate ? ' rot' : ''}: ${games} games in ${(ms / 1000).toFixed(1)} s (${gps.toFixed(1)} games/s)`);
          const file = join(out, `${name}-${players}p-${games}g-s${seed}${rotate ? '-rot' : ''}.json`);
          writeFileSync(file, JSON.stringify({ config: name, players, games, seed, rotated: rotate, timing: { ms, gamesPerSecond: gps }, summary, metrics }));
          process.stdout.write(`wrote ${file}\n`);
        }
      }

      const sections = [
        formatMarkdown(summaries, `Simulation: ${configs.join(', ')} · ${playerCounts.join('/')} players · ${games} games from seed ${seed}${rotate ? ' · rotated seats' : ''}`),
        '### Throughput',
        '',
        ...timing,
        '',
      ];
      const baselinePath = process.env.SIM_BASELINE;
      const baseline: SimSummary | undefined = baselinePath ? (JSON.parse(readFileSync(baselinePath, 'utf8')) as { summary: SimSummary }).summary : undefined;
      const comparisons = summaries.flatMap((s) => {
        const base = baseline ?? summaries.find((x) => x.config === 'classic' && x.players === s.players);
        return base && base !== s ? [compareTo(base, s)] : [];
      });
      if (comparisons.length > 0) sections.push('### Comparisons', '', ...comparisons);
      const report = sections.join('\n');
      const reportFile = join(out, `report-${configs.join('_')}-${playerCounts.join('_')}p-${games}g-s${seed}${rotate ? '-rot' : ''}.md`);
      writeFileSync(reportFile, report);
      // process.stdout (not console.log) so the report shows without --silent=false.
      process.stdout.write(`${report}\nwrote ${reportFile}\n`);
      expect(summaries.every((s) => s.games === games)).toBe(true);
    },
    30 * 60 * 1000,
  );
});
