import { appendFileSync } from 'node:fs';
import { it } from 'vitest';
import { decideAIAction } from '../ai';
import { applyAction, createGame, getActingPlayer } from '../game';
import { FINANCING_COMMITMENT, FINANCING_COST, FINANCING_MAX_OUTSTANDING, describeBundle } from '../constants';
import { ALL_AI } from './helpers';

// Balance probe for Infrastructure Financing (opt-in; appends one summary line to $FIN_BALANCE):
//   FIN_BALANCE=/tmp/fin.txt N=300 S0=12000 npx vitest run financing-balance
// One seat per game (rotating) decides as if financing were off. If financing is fair, that
// debt-free seat still wins about 25% of games; at 2 GPUs / 3 units it won ~10%.
const OUT = process.env.FIN_BALANCE ?? '';

it.runIf(OUT)('financing balance probe', () => {
  const N = Number(process.env.N ?? 200);
  let turns = 0, fin = 0, refi = 0, restrictedWins = 0, finWins = 0, finCompanies = 0, unrestricted = 0;
  const S0 = Number(process.env.S0 ?? 9300);
  for (let seed = S0; seed < S0 + N; seed++) {
    let s = createGame({ seed, seats: ALL_AI, rules: { financing: true } });
    const restricted = seed % 4;
    const financers = new Set<number>();
    let steps = 0;
    while (s.phase !== 'gameOver' && steps < 8000) {
      const p = getActingPlayer(s)!;
      const view = p === restricted ? { ...s, rules: { financing: false, fullStack: false, marketEvents: false } } : s;
      const a = decideAIAction(view, p);
      if (a.type === 'BUILD_FINANCED_FACTORY') { fin++; financers.add(p); }
      if (a.type === 'REFINANCE') refi++;
      s = applyAction(s, a);
      steps++;
    }
    turns += s.turn;
    if (s.winner === restricted) restrictedWins++;
    if (s.winner !== null && financers.has(s.winner)) finWins++;
    finCompanies += financers.size;
    unrestricted += 3;
  }
  appendFileSync(OUT, `${describeBundle(FINANCING_COST)} commit=${FINANCING_COMMITMENT} cap=${FINANCING_MAX_OUTSTANDING} | games=${N}@${process.env.S0 ?? 9300} rounds=${(turns / N / 4).toFixed(2)} financed/game=${(fin / N).toFixed(2)} refi/game=${(refi / N).toFixed(2)} financers=${finCompanies}/${unrestricted} financerWins=${finWins} debtFreeSeatWin%=${((100 * restrictedWins) / N).toFixed(1)}\n`);
}, 900000);
