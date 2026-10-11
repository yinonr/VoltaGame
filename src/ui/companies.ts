import { CLASSIC_RULES, COMPANIES, COMPUTE_RULES, companyById, sanitizeCompanyName } from '../engine/constants';
import type { SeatConfig } from '../engine/game';
import { DEFAULT_SEATS } from '../engine/game';
import { scoreBreakdown } from '../engine/scoring';
import type { GameState, Player, RuleOptions } from '../engine/types';

// Company identity for the UI: who you are, who the rivals are and how they like to play.
// Pure data and helpers (no React), so the engine tests can exercise them too.

export interface CompanyProfile {
  /** One or two words for the scoreboard: how this company likes to play. */
  strategy: string;
  /** One line for the New Game screen. */
  plan: string;
  /** Plain color name, so a player can match the swatch to their pieces on the board. */
  colorName: string;
}

// Mirrors the computer players' style weights in COMPANIES (cards / expansion / factories).
const PROFILES: Record<string, CompanyProfile> = {
  parallax: { strategy: 'Balanced', plan: 'Frontier AI lab on a startup budget. A balanced builder.', colorName: 'blue' },
  helixa: { strategy: 'Innovation', plan: 'Innovation-focused: invests in Innovation Cards.', colorName: 'red' },
  ambulo: { strategy: 'Expansion', plan: 'Aggressive territorial expansion: grabs new sites and long networks.', colorName: 'orange' },
  stacksmith: { strategy: 'Factories', plan: 'Factory-focused builder: upgrades to AI Factories early.', colorName: 'white' },
};

export function profileOf(companyId: string): CompanyProfile {
  return PROFILES[companyId] ?? PROFILES.parallax;
}

/** The human's company in a standard New Game, and its default name. */
export const HUMAN_COMPANY = COMPANIES[0];
export const DEFAULT_COMPANY_NAME = HUMAN_COMPANY.name;

/** The three computer rivals of a standard New Game. */
export const RIVALS = DEFAULT_SEATS.filter((s) => s.isAI).map((s) => companyById(s.companyId));

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

// Characters that render as nothing (or reorder text) but survive the engine's sanitizer:
// soft hyphen, combining grapheme joiner, Arabic letter mark, Hangul/Khmer/Mongolian fillers,
// blank braille, interlinear annotation marks. Variation selectors stay (emoji need them).
const INVISIBLE = /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u2800\u3164\uffa0\ufff9-\ufffb]/gu;

// Tabs and line breaks in a pasted name separate words; the engine would delete them outright.
const BREAKS = /[\t\n\v\f\r\u0085\u2028\u2029]/g;

/**
 * A company name as the UI accepts it: the engine's `sanitizeCompanyName`, minus invisible
 * filler characters and stray leading combining marks, falling back when nothing visible is left.
 * Idempotent, and never longer than the engine's cap.
 */
export function cleanCompanyName(raw: string | null | undefined, fallback: string): string {
  const base = sanitizeCompanyName((raw ?? '').replace(BREAKS, ' '), '');
  const visible = base.replace(INVISIBLE, '').replace(/^[\p{M}\s]+/u, '');
  return sanitizeCompanyName(/[\p{L}\p{N}\p{S}\p{P}]/u.test(visible) ? visible : '', fallback);
}

/** Case- and spacing-insensitive key for spotting two companies with the same name. */
export function nameKey(name: string): string {
  return cleanCompanyName(name, '').toLocaleLowerCase();
}

/** The rival whose name `name` would duplicate, if any (only computer seats are checked). */
export function rivalNamed(name: string): string | null {
  const key = nameKey(name);
  if (!key) return null;
  return RIVALS.find((c) => nameKey(c.name) === key)?.name ?? null;
}

/** Short label for tight spaces (mobile chips): the company's short name unless renamed. */
export function shortName(p: Player): string {
  const c = companyById(p.companyId);
  return p.name === c.name ? c.short : p.name;
}

const NAME_KEY = 'settlers-of-compute:company-name:v1';

/** The company name the player used last time, if storage has one. */
export function loadLastCompanyName(): string | null {
  try {
    const raw = localStorage.getItem(NAME_KEY);
    return raw ? cleanCompanyName(raw, DEFAULT_COMPANY_NAME) : null;
  } catch {
    return null;
  }
}

export function rememberCompanyName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, cleanCompanyName(name, DEFAULT_COMPANY_NAME));
  } catch {
    /* storage unavailable: the name is only a convenience */
  }
}

/** Re-clean player names from a saved game (old saves simply carry the company names). */
export function withCleanNames(s: GameState): GameState {
  if (!Array.isArray(s.players)) return s;
  const players = s.players.map((p) => {
    const name = cleanCompanyName(typeof p.name === 'string' ? p.name : '', companyById(p.companyId).name);
    return name === p.name ? p : { ...p, name };
  });
  return players.every((p, i) => p === s.players[i]) ? s : { ...s, players };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export type RulesChoice = 'compute' | 'classic';

export function rulesFor(choice: RulesChoice): RuleOptions {
  return choice === 'classic' ? { ...CLASSIC_RULES } : { ...COMPUTE_RULES };
}

/** Which New Game option a game's rules correspond to (old saves read as Classic). */
export function choiceOf(rules: RuleOptions | undefined): RulesChoice {
  return rules && (rules.financing || rules.fullStack) ? 'compute' : 'classic';
}

/** Seats for a standard New Game: you (seat 0) against the three computer rivals. */
export function newGameSeats(name: string): SeatConfig[] {
  return DEFAULT_SEATS.map((s, i) => (i === 0 ? { ...s, name: cleanCompanyName(name, DEFAULT_COMPANY_NAME) } : { ...s }));
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

/**
 * The company strictly ahead on public Compute Points (all points once the game is over), or
 * null on a tie or before anyone scores. Secret AI Breakthroughs never leak into it.
 */
export function leaderOf(state: GameState): number | null {
  const over = state.phase === 'gameOver';
  let best = -1;
  let leader: number | null = null;
  for (const p of state.players) {
    const sb = scoreBreakdown(state, p.id);
    const cp = over ? sb.total : sb.publicTotal;
    if (cp > best) {
      best = cp;
      leader = p.id;
    } else if (cp === best) {
      leader = null;
    }
  }
  return best > 0 ? leader : null;
}
