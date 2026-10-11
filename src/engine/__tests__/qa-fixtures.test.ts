import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createGame, applyAction } from '../game';
import { buildDemoGame } from '../demo';
import { COMPUTE_RULES, COSTS, INTEGRATION_COST } from '../constants';
import { legalClusterVertices } from '../rules';
import { victoryPoints } from '../scoring';
import { setHand, withNextRoll, place } from './helpers';
import type { GameState } from '../types';

// Dev tool: `QA_GEN=/some/dir npx vitest run qa-fixtures` writes saved-game JSON fixtures
// for browser QA (load them into localStorage key settlers-of-compute:save:v1). Skipped otherwise.
const OUT = process.env.QA_GEN ?? '';
it.runIf(process.env.QA_GEN)('generate QA states', () => {
  // A: human to roll a 7 while holding 9 cards
  let a = createGame({ seed: 4242 });
  a = setHand(a, 0, { power: 3, networking: 2, land: 2, capital: 1, gpu: 1 });
  a = withNextRoll(a, 7);
  writeFileSync(OUT + '/qa-seven.json', JSON.stringify(a));

  // B: human main phase holding one of each playable card (bought earlier)
  let b = createGame({ seed: 777 });
  b = applyAction(withNextRoll(b, 8), { type: 'ROLL' });
  b = { ...b, players: b.players.map((p) => p.id === 0 ? { ...p, devCards: [
    { id: 501, type: 'priority', boughtOnTurn: 0 }, { id: 502, type: 'expansion', boughtOnTurn: 0 },
    { id: 503, type: 'grant', boughtOnTurn: 0 }, { id: 504, type: 'consolidation', boughtOnTurn: 0 }, { id: 505, type: 'breakthrough', boughtOnTurn: 0 } ] } : p) };
  writeFileSync(OUT + '/qa-cards.json', JSON.stringify(b));

  // C: human at 9 CP, can afford a cluster on a legal site
  let c: GameState = buildDemoGame();
  let guard = 0;
  while (victoryPoints(c, 0) < 9 && guard++ < 10) {
    const v = c.buildings.findIndex((b) => b?.owner === 0 && b.kind === 'cluster');
    c = place(c, v, 0, 'factory');
  }
  c = setHand(c, 0, COSTS.cluster);
  writeFileSync(OUT + '/qa-win.json', JSON.stringify(c));

  // D: human holds an old Full-Stack Integration card and can afford it, with a legal site
  let d: GameState = { ...buildDemoGame(), voltaCards: true };
  d = setHand(d, 0, INTEGRATION_COST);
  d = { ...d, players: d.players.map((p) => (p.id === 0 ? { ...p, devCards: [...p.devCards, { id: 777, type: 'integration' as const, boughtOnTurn: 0 }] } : p)) };
  writeFileSync(OUT + '/qa-integration.json', JSON.stringify(d));

  // E: Compute rules, human main phase: one financed factory owing 2 units, one plain cluster,
  // and a hand that can finance the cluster (1 Capital + 2 GPUs) and then refinance (2 Capital).
  let e = createGame({ seed: 777, rules: COMPUTE_RULES });
  e = applyAction(withNextRoll(e, 8), { type: 'ROLL' });
  const own = e.buildings.map((b, v) => (b?.owner === 0 ? v : -1)).filter((v) => v >= 0);
  const buildings = e.buildings.slice();
  buildings[own[0]] = { owner: 0, kind: 'factory', financed: 2 };
  e = setHand({ ...e, buildings }, 0, { capital: 3, gpu: 2, power: 1 });
  writeFileSync(OUT + '/qa-financing.json', JSON.stringify(e));
  console.log('C vp', victoryPoints(c, 0), 'sites', legalClusterVertices(c, 0).length);
});
