import { describe, expect, it } from 'vitest';
import { decideAIAction } from '../ai';
import { CLASSIC_RULES, COMPUTE_RULES, MAX_COMPANY_NAME, rulesOf, sanitizeCompanyName } from '../constants';
import { applyAction, createGame, GameError, getActingPlayer } from '../game';
import { legalClusterVertices } from '../rules';
import type { GameState } from '../types';
import { ALL_AI, blankGame, place, setHand } from './helpers';
import { QA_CONFIGS, checkState, deepFreeze, newGame, playChecked, roundTrip } from './qa-checks';

// Whole-game invariants under every rules variant and seat count. Each state is deep-frozen
// before the AI and the reducer see it, so any in-place mutation throws; every state and every
// transition is checked (qa-checks.ts). The JSON-safety walk that proves a save/load round trip
// lossless runs on every step of every game; the literal save -> reload -> replay check runs on
// every RT_EVERY-th step, at a different offset per seed so that all residues are covered.
// Runtime budget: about 1 s per config on a loaded 4-core machine.

const SEEDS = [1, 2, 3, 4, 5, 6];
const RT_EVERY = 8;

describe('all-AI games keep every invariant', () => {
  for (const cfg of QA_CONFIGS) {
    it(`${cfg.name}: ${SEEDS.length} seeded games to a winner`, () => {
      const steps: number[] = [];
      SEEDS.forEach((seed, i) => {
        const { final, steps: n } = playChecked(newGame(cfg, seed), `${cfg.name} seed ${seed}`, { roundTripEvery: RT_EVERY, roundTripOffset: i });
        expect(final.phase).toBe('gameOver');
        steps.push(n);
      });
      expect(Math.max(...steps)).toBeLessThan(4000);
    }, 60000);
  }

  it('the same seed and rules replay identically, including from a mid-game save', () => {
    const cfg = QA_CONFIGS.find((c) => c.name === 'compute+events')!;
    const a = playChecked(newGame(cfg, 31), 'replay a');
    const b = playChecked(newGame(cfg, 31), 'replay b');
    expect(b.actions).toEqual(a.actions);
    expect(JSON.stringify(b.final)).toBe(JSON.stringify(a.final));
    // Save half way, reload, finish with the AI: same game.
    let s = newGame(cfg, 31);
    for (let i = 0; i < Math.floor(a.steps / 2); i++) s = applyAction(s, a.actions[i]);
    const resumed = playChecked(roundTrip(s), 'replay resumed');
    expect(resumed.actions).toEqual(a.actions.slice(Math.floor(a.steps / 2)));
    expect(JSON.stringify(resumed.final)).toBe(JSON.stringify(a.final));
  }, 30000);
});

describe('Session 2 contracts (adversarial review)', () => {
  it('createGame stores a private, complete copy of the rules', () => {
    const classic = createGame({ seed: 3, seats: ALL_AI });
    expect(classic.rules).toEqual(CLASSIC_RULES);
    expect(classic.rules).not.toBe(CLASSIC_RULES);
    expect(rulesOf(classic)).toEqual(CLASSIC_RULES);

    const compute = createGame({ seed: 3, seats: ALL_AI, rules: COMPUTE_RULES });
    expect(compute.rules).toEqual(COMPUTE_RULES);
    expect(compute.rules).not.toBe(COMPUTE_RULES);
    const again = createGame({ seed: 3, seats: ALL_AI, rules: COMPUTE_RULES });
    expect(again.rules).not.toBe(compute.rules);

    expect(createGame({ seed: 3, seats: ALL_AI, rules: { financing: true } }).rules).toEqual({ financing: true, fullStack: false, marketEvents: false, gridStability: false });
    expect(createGame({ seed: 3, seats: ALL_AI, rules: {} }).rules).toEqual(CLASSIC_RULES);
    // Rules never touch the dice or the opening: the same seed builds the same board and draft.
    expect(compute.buildings).toEqual(classic.buildings);
    expect(compute.rng).toBe(classic.rng);
  });

  it('rulesOf defaults to Classic for saves without the field (and for a null field)', () => {
    const { rules: _ignored, ...old } = createGame({ seed: 8, seats: ALL_AI, rules: COMPUTE_RULES });
    expect(rulesOf(old as GameState)).toEqual(CLASSIC_RULES);
    expect(rulesOf({ rules: null as unknown as undefined })).toEqual(CLASSIC_RULES);
  });

  it('one state per step: rules objects are shared within a game only, never across games', () => {
    const a = deepFreeze(createGame({ seed: 4, seats: ALL_AI, rules: COMPUTE_RULES }));
    const next = applyAction(a, decideAIAction(a, getActingPlayer(a)!));
    expect(next.rules).toEqual(a.rules);
    const b = createGame({ seed: 4, seats: ALL_AI, rules: COMPUTE_RULES });
    expect(b.rules).not.toBe(a.rules);
  });

  it('custom company names are sanitized and display-only', () => {
    const seats = [{ companyId: 'parallax', isAI: false, name: '  <b>Volta</b>\u0007  Labs  ' }, ...ALL_AI.slice(1)];
    const named = createGame({ seed: 12, seats });
    expect(named.players[0].name).toBe('bVolta/b Labs');
    const plain = createGame({ seed: 12, seats: [{ companyId: 'parallax', isAI: false }, ...ALL_AI.slice(1)] });
    expect(plain.players[0].name).toBe('Parallax Labs');
    // Names never change the game.
    expect(named.buildings).toEqual(plain.buildings);
    expect(named.rng).toBe(plain.rng);
    checkState(named);
  });

  it('sanitizeCompanyName handles hostile input without breaking text', () => {
    const cp = (...c: number[]) => String.fromCodePoint(...c);
    expect(sanitizeCompanyName(null, 'Fallback')).toBe('Fallback');
    expect(sanitizeCompanyName(undefined, 'Fallback')).toBe('Fallback');
    expect(sanitizeCompanyName(' \t\n ' + cp(0x3000), 'Fallback')).toBe('Fallback');
    expect(sanitizeCompanyName('<<>>{}', 'Fallback')).toBe('Fallback');
    expect(sanitizeCompanyName('A'.repeat(5000), 'F')).toHaveLength(MAX_COMPANY_NAME);
    // Bidi overrides / isolates are stripped (no "evil" text reordering in the log).
    expect(sanitizeCompanyName(cp(0x202e) + 'evil' + cp(0x202c, 0x2066) + ' Labs' + cp(0x2069), 'F')).toBe('evil Labs');
    // The cap counts code points, so an emoji name never ends in half a surrogate pair.
    const rockets = sanitizeCompanyName(cp(0x1f680).repeat(40), 'F');
    expect(Array.from(rockets)).toHaveLength(MAX_COMPANY_NAME);
    expect(Array.from(rockets).every((ch) => ch.codePointAt(0)! < 0xd800 || ch.codePointAt(0)! > 0xdfff)).toBe(true);
    // No control characters survive, and the result is stable under re-sanitizing.
    const samples = ['Helixa\u0000Bio', 'a\r\nb', ' x '.repeat(20), 'e' + cp(0x301) + 'clair', cp(0x1f1fa, 0x1f1f8).repeat(20), 'Z' + cp(0x301).repeat(40)];
    for (const raw of samples) {
      const out = sanitizeCompanyName(raw, 'F');
      expect(out).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
      expect(sanitizeCompanyName(out, 'F')).toBe(out);
      expect(Array.from(out).length).toBeLessThanOrEqual(MAX_COMPANY_NAME);
    }
  });

  // ---- QA findings (fixed in the engine; kept as regression tests) ----

  // FINDING (constants.ts:120-130, sanitizeCompanyName): names made only of invisible, non-space
  // characters pass through instead of falling back, so a company shows up with a blank name in
  // the scoreboard, the log ("  rolled 8") and trade prompts.
  it('FIXED: invisible-only company names fall back to the default name', () => {
    const cp = (...c: number[]) => String.fromCodePoint(...c);
    for (const raw of [cp(0x2800, 0x2800), cp(0x3164), cp(0xad), cp(0x34f), cp(0x180e), cp(0xe0041, 0xe0042), cp(0x301, 0x301), cp(0xfe0f)]) {
      expect(sanitizeCompanyName(raw, 'Fallback')).toBe('Fallback');
    }
  });

  // FINDING (constants.ts:123, sanitizeCompanyName): U+200D (zero-width joiner) and U+200C (ZWNJ)
  // are stripped with the invisible controls. That splits emoji sequences (a technologist emoji
  // turns into a man and a laptop) and breaks Persian / Indic spellings that need ZWNJ.
  it('FIXED: joiners inside emoji / scripts survive sanitizing', () => {
    const cp = (...c: number[]) => String.fromCodePoint(...c);
    const technologist = cp(0x1f468, 0x200d, 0x1f4bb) + ' Labs';
    expect(sanitizeCompanyName(technologist, 'F')).toBe(technologist);
    const persian = cp(0x645, 0x6cc, 0x200c, 0x62e, 0x648, 0x627, 0x647, 0x645);
    expect(sanitizeCompanyName(persian, 'F')).toBe(persian);
  });

  // FINDING (game.ts:98-106 createGame / Stream C new-game flow): display names are not unique.
  // A human may name their company "Helixa Bio" next to the Helixa Bio AI, and every log line,
  // trade prompt and steal toast becomes ambiguous ("Helixa Bio took 1 resource from Helixa Bio").
  it('FIXED: two seats never share a display name', () => {
    const seats = [{ companyId: 'parallax', isAI: false, name: 'Helixa Bio' }, ...ALL_AI.slice(1)];
    const s = createGame({ seed: 5, seats });
    expect(new Set(s.players.map((p) => p.name)).size).toBe(s.players.length);
  });

  // FINDING (game.ts:178, createGame rules merge): Partial<RuleOptions> admits explicit undefined
  // (no exactOptionalPropertyTypes), and the spread copies it, so rules.financing is undefined
  // instead of false. JSON then drops the key: the saved rules are no longer a RuleOptions and
  // equality checks against CLASSIC_RULES / COMPUTE_RULES (e.g. a "mode" badge) fail.
  it('FIXED: rules flags are always booleans', () => {
    const s = createGame({ seed: 5, seats: ALL_AI, rules: { financing: undefined } });
    expect(s.rules).toEqual(CLASSIC_RULES);
    expect(roundTrip(s).rules).toStrictEqual(CLASSIC_RULES);
  });

  // FINDING (game.ts:585): the legacy card was renamed Expedited Deployment so it never collides
  // with the earnable Full-Stack Integration status, but its reducer error still says
  // "Full-Stack Integration ..." (as do GameScreen.tsx:83/186 and TitleScreen.tsx:148).
  it('FIXED: Expedited Deployment errors do not mention Full-Stack Integration', () => {
    let s: GameState = { ...blankGame(), voltaCards: true };
    s = place(s, 0, 0);
    s = setHand(s, 0, { land: 1, capital: 3, gpu: 2 });
    s = { ...s, players: s.players.map((p) => (p.id === 0 ? { ...p, devCards: [{ id: 99, type: 'integration' as const, boughtOnTurn: 0 }] } : p)) };
    expect(legalClusterVertices(s, 0)).not.toContain(30);
    expect(() => applyAction(s, { type: 'PLAY_INTEGRATION', vertex: 30 })).toThrow(GameError);
    expect(() => applyAction(s, { type: 'PLAY_INTEGRATION', vertex: 30 })).not.toThrow(/Full-Stack/);
  });
});
