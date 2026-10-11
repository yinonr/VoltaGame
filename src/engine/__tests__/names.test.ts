import { afterEach, describe, expect, it, vi } from 'vitest';
import { decideAIAction } from '../ai';
import { CLASSIC_RULES, COMPUTE_RULES, MAX_COMPANY_NAME, sanitizeCompanyName, rulesOf } from '../constants';
import type { SeatConfig } from '../game';
import { applyAction, createGame, getActingPlayer } from '../game';
import type { GameState } from '../types';
import {
  choiceOf,
  cleanCompanyName,
  leaderOf,
  loadLastCompanyName,
  newGameSeats,
  rememberCompanyName,
  rivalNamed,
  rulesFor,
  withCleanNames,
} from '../../ui/companies';
import { blankGame, place } from './helpers';

// Custom company names: the engine sanitizer, the UI's stricter cleaning, and proof that a
// name is display-only (same seed, same game).

/** Build strings from code points, so invisible characters stay explicit in the source. */
const u = (...cps: number[]) => String.fromCodePoint(...cps);
const FALLBACK = 'Parallax Labs';
const clean = (raw: string | null | undefined) => sanitizeCompanyName(raw, FALLBACK);
const codePoints = (s: string) => Array.from(s).length;

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

const ROCKET = u(0x1f680);
const BIDI_CONTROLS = [0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069];

describe('sanitizeCompanyName', () => {
  it('falls back to the default for empty or whitespace-only names', () => {
    for (const raw of [null, undefined, '', ' ', '     ', u(9, 10, 13), u(0xa0, 0x3000), u(0x200b, 0xfeff)]) {
      expect(clean(raw)).toBe(FALLBACK);
    }
  });

  it('collapses runs of whitespace and trims the ends', () => {
    expect(clean('  Deep    Mind   Co  ')).toBe('Deep Mind Co');
    expect(clean('Neo' + u(0xa0, 0xa0) + 'Labs' + u(0x3000) + 'One' + u(0x2003))).toBe('Neo Labs One');
  });

  it('removes control and zero-width characters', () => {
    expect(clean('Ne' + u(0) + 'o' + u(7, 0x1b, 0x7f, 0x85) + ' Labs')).toBe('Neo Labs');
    expect(clean('Pa' + u(0x200b) + 'ral' + u(0x200c) + 'lax' + u(0x200d, 0x2060, 0xfeff))).toBe('Parallax');
  });

  it('removes markup characters: < > { } [ ] backslash and backticks', () => {
    expect(clean('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
    expect(clean('a{b}[c]`d`\\e')).toBe('abcde');
    expect(clean('<>{}[]`')).toBe(FALLBACK);
  });

  it('caps names at MAX_COMPANY_NAME code points, never splitting a character', () => {
    expect(MAX_COMPANY_NAME).toBe(24);
    expect(clean('x'.repeat(40))).toBe('x'.repeat(24));
    const rockets = clean(ROCKET.repeat(30));
    expect(codePoints(rockets)).toBe(24);
    expect(rockets.length).toBe(48); // UTF-16 units: the cap counts code points, not units
    expect(hasLoneSurrogate(rockets)).toBe(false);
    const mixed = clean('A' + ROCKET.repeat(30));
    expect(codePoints(mixed)).toBe(24);
    expect(hasLoneSurrogate(mixed)).toBe(false);
    // A cut that lands after a space leaves no trailing space.
    expect(clean('a'.repeat(23) + ' b')).toBe('a'.repeat(23));
  });

  it('keeps emoji and accented names, composing combining marks', () => {
    expect(clean(ROCKET + ' Labs')).toBe(ROCKET + ' Labs');
    expect(clean('Cafe' + u(0x301))).toBe('Caf' + u(0xe9)); // NFC: e + combining acute -> é
    const zalgo = clean('Z' + u(0x336).repeat(100));
    expect(codePoints(zalgo)).toBe(24);
    expect(zalgo.startsWith('Z')).toBe(true);
  });

  it('strips bidirectional override and isolate characters', () => {
    expect(clean(u(0x202e) + 'sbaL' + u(0x202c))).toBe('sbaL');
    expect(clean('Evil' + u(0x202e) + 'gnp.exe')).toBe('Evilgnp.exe');
    expect(clean(u(0x2066) + 'Neo' + u(0x2069) + u(0x200f) + ' Labs' + u(0x200e))).toBe('Neo Labs');
    const all = clean('A' + BIDI_CONTROLS.map((c) => u(c)).join('') + 'B');
    expect(all).toBe('AB');
  });

  it('is idempotent', () => {
    for (const raw of ['  Neo   Labs ', ROCKET.repeat(30), 'Z' + u(0x336).repeat(100), '<b>x</b>', 'a'.repeat(23) + ' b', 'Cafe' + u(0x301)]) {
      expect(clean(clean(raw))).toBe(clean(raw));
    }
  });
});

describe('UI name cleaning', () => {
  it('rejects names with nothing visible left', () => {
    for (const raw of [u(0x301, 0x301), u(0x3164), u(0x2800), u(0x115f, 0x1160), u(0xad), u(0x34f), u(0x180e)]) {
      expect(cleanCompanyName(raw, FALLBACK)).toBe(FALLBACK);
    }
  });

  it('treats pasted tabs and line breaks as spaces (the engine would delete them as control characters)', () => {
    expect(cleanCompanyName('Deep' + u(9) + 'Mind' + u(10) + 'Co' + u(13, 10) + 'Two', FALLBACK)).toBe('Deep Mind Co Two');
    expect(cleanCompanyName('Neo' + u(0x2028) + 'Labs' + u(0x85), FALLBACK)).toBe('Neo Labs');
  });

  it('drops stray leading marks and invisible fillers but keeps real names', () => {
    expect(cleanCompanyName(u(0x301) + 'Neo', FALLBACK)).toBe('Neo');
    expect(cleanCompanyName('a' + u(0x61c) + 'b', FALLBACK)).toBe('ab');
    expect(cleanCompanyName('x' + u(0xad) + 'y', FALLBACK)).toBe('xy');
    expect(cleanCompanyName('Neo ' + u(0x3164) + ' Labs', FALLBACK)).toBe('Neo Labs');
    expect(cleanCompanyName(ROCKET, FALLBACK)).toBe(ROCKET);
    expect(cleanCompanyName('Cafe' + u(0x301) + ' AI', FALLBACK)).toBe('Caf' + u(0xe9) + ' AI');
  });

  it('agrees with the engine sanitizer on ordinary names, stays capped and idempotent', () => {
    for (const raw of ['Neo Labs', '  Deep   Mind ', '<x>', 'x'.repeat(50), ROCKET.repeat(30), '']) {
      const once = cleanCompanyName(raw, FALLBACK);
      expect(once).toBe(clean(raw));
      expect(cleanCompanyName(once, FALLBACK)).toBe(once);
      expect(codePoints(once)).toBeLessThanOrEqual(MAX_COMPANY_NAME);
    }
  });

  it('spots a name that duplicates a rival, ignoring case and spacing', () => {
    expect(rivalNamed('  helixa   BIO ')).toBe('Helixa Bio');
    expect(rivalNamed('Stacksmith')).toBe('Stacksmith');
    expect(rivalNamed('Parallax Labs')).toBe(null);
    expect(rivalNamed('Helixa')).toBe(null);
    expect(rivalNamed('')).toBe(null);
  });

  describe('remembered name', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('round-trips through storage, cleaned', () => {
      const store = new Map<string, string>();
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      });
      expect(loadLastCompanyName()).toBe(null);
      rememberCompanyName('  Neo   Labs <3 ');
      expect(loadLastCompanyName()).toBe('Neo Labs 3');
    });

    it('never throws when storage is unavailable', () => {
      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
      });
      expect(() => rememberCompanyName('Neo Labs')).not.toThrow();
      expect(loadLastCompanyName()).toBe(null);
    });
  });
});

describe('createGame with custom names', () => {
  it('sanitizes every seat name and defaults the rest to the company name', () => {
    const s = createGame({
      seed: 7,
      seats: [
        { companyId: 'parallax', isAI: false, name: '  <Neo>   Labs' + u(0x202e) + ' ' },
        { companyId: 'helixa', isAI: true },
        { companyId: 'ambulo', isAI: true, name: '   ' },
        { companyId: 'stacksmith', isAI: true, name: 'x'.repeat(50) },
      ],
    });
    expect(s.players.map((p) => p.name)).toEqual(['Neo Labs', 'Helixa Bio', 'Ambulo Robotics', 'x'.repeat(24)]);
    expect(s.log.some((l) => l.text === 'Turn 1 — Neo Labs')).toBe(true);
  });

  it('builds the standard New Game: a named human against the three rivals', () => {
    const s = createGame({ seed: 3, seats: newGameSeats('  Quokka   Quanta '), rules: rulesFor('compute') });
    expect(s.players.map((p) => [p.companyId, p.name, p.isAI])).toEqual([
      ['parallax', 'Quokka Quanta', false],
      ['helixa', 'Helixa Bio', true],
      ['ambulo', 'Ambulo Robotics', true],
      ['stacksmith', 'Stacksmith', true],
    ]);
    expect(rulesOf(s)).toEqual(COMPUTE_RULES);
    expect(createGame({ seed: 3, seats: newGameSeats(u(0x3164)) }).players[0].name).toBe('Parallax Labs');
  });

  it('supports pass-and-play with two named humans', () => {
    const s = createGame({
      seed: 11,
      seats: [
        { companyId: 'parallax', isAI: false, name: 'Alpha Compute' },
        { companyId: 'helixa', isAI: false, name: 'Beta Bio' },
        { companyId: 'ambulo', isAI: true },
      ],
    });
    expect(s.players.map((p) => [p.name, p.isAI])).toEqual([
      ['Alpha Compute', false],
      ['Beta Bio', false],
      ['Ambulo Robotics', true],
    ]);
  });
});

describe('names never change the mechanics', () => {
  const NAMED: SeatConfig[] = [
    { companyId: 'parallax', isAI: false, name: 'Quokka Quanta' },
    { companyId: 'helixa', isAI: true, name: 'Zebra Genomics 9' },
    { companyId: 'ambulo', isAI: true },
    { companyId: 'stacksmith', isAI: true, name: 'Yak Shaving Inc' },
  ];
  const PLAIN: SeatConfig[] = NAMED.map(({ companyId, isAI }) => ({ companyId, isAI }));
  const SWAPS: [string, string][] = [
    ['Quokka Quanta', 'Parallax Labs'],
    ['Zebra Genomics 9', 'Helixa Bio'],
    ['Yak Shaving Inc', 'Stacksmith'],
  ];

  /** Every seat (the human's too) driven by the computer heuristic. */
  function play(s: GameState, steps: number): GameState {
    for (let i = 0; i < steps && s.phase !== 'gameOver'; i++) s = applyAction(s, decideAIAction(s, getActingPlayer(s)!));
    return s;
  }
  /** The state with every custom name swapped back for the company name, in players and log. */
  function unnamed(s: GameState): GameState {
    const swap = (t: string) => SWAPS.reduce((acc, [from, to]) => acc.split(from).join(to), t);
    return { ...s, players: s.players.map((p) => ({ ...p, name: swap(p.name) })), log: s.log.map((l) => ({ ...l, text: swap(l.text) })) };
  }

  for (const [label, rules] of [
    ['Classic', CLASSIC_RULES],
    ['Settlers of Compute', COMPUTE_RULES],
  ] as const) {
    it(`same seed, same game (${label}, 400 AI steps)`, () => {
      for (const seed of [5, 2026]) {
        const a = createGame({ seed, seats: NAMED, rules });
        const b = createGame({ seed, seats: PLAIN, rules });
        expect(a.players.map((p) => p.name)).toEqual(['Quokka Quanta', 'Zebra Genomics 9', 'Ambulo Robotics', 'Yak Shaving Inc']);
        expect(unnamed(a)).toEqual(b);
        const a2 = play(a, 400);
        const b2 = play(b, 400);
        expect(a2.turn).toBeGreaterThan(8);
        expect(a2.log.some((l) => l.text.includes('Zebra Genomics 9'))).toBe(true);
        expect(unnamed(a2)).toEqual(b2);
      }
    });
  }
});

describe('saves and standings', () => {
  it('old saves keep loading: clean names pass through untouched', () => {
    const s = createGame({ seed: 9 });
    const old = JSON.parse(JSON.stringify(s)) as GameState;
    delete old.rules; // a pre-Session-2 save
    expect(withCleanNames(old)).toBe(old);
    expect(rulesOf(old)).toEqual(CLASSIC_RULES);
    expect(choiceOf(old.rules)).toBe('classic');
    expect(() => applyAction(old, { type: 'ROLL' })).not.toThrow();
  });

  it('re-cleans tampered save names without touching anything else', () => {
    const s = createGame({ seed: 9 });
    const players = s.players.map((p, i) => (i === 1 ? { ...p, name: '<b>' + 'y'.repeat(80) } : i === 2 ? { ...p, name: 42 as unknown as string } : p));
    const tampered = { ...s, players };
    const fixed = withCleanNames(tampered);
    expect(fixed.players.map((p) => p.name)).toEqual(['Parallax Labs', 'b' + 'y'.repeat(23), 'Ambulo Robotics', 'Stacksmith']);
    expect(fixed.players[0]).toBe(tampered.players[0]);
    expect({ ...fixed, players: [] }).toEqual({ ...tampered, players: [] });
  });

  it('maps rules choices both ways', () => {
    expect(rulesFor('compute')).toEqual(COMPUTE_RULES);
    expect(rulesFor('compute')).not.toBe(COMPUTE_RULES);
    expect(rulesFor('classic')).toEqual(CLASSIC_RULES);
    expect(choiceOf(COMPUTE_RULES)).toBe('compute');
    expect(choiceOf(undefined)).toBe('classic');
  });

  it('names a leader only when one company is strictly ahead on public points', () => {
    let s = blankGame();
    expect(leaderOf(s)).toBe(null);
    s = place(s, 0, 1);
    expect(leaderOf(s)).toBe(1);
    s = place(s, 20, 2);
    expect(leaderOf(s)).toBe(null); // tie
    // A secret AI Breakthrough does not count until the game is over.
    s = place(s, 40, 0);
    s = { ...s, players: s.players.map((p) => (p.id === 0 ? { ...p, devCards: [{ id: 1, type: 'breakthrough', boughtOnTurn: 0 }] } : p)) };
    expect(leaderOf(s)).toBe(null);
    expect(leaderOf({ ...s, phase: 'gameOver' })).toBe(0);
  });
});
