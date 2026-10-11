import { useCallback, useEffect, useRef, useState } from 'react';
import { RESOURCE_INFO, VP_TO_WIN, companyById, resourceLabel, sumBundle } from '../engine/constants';
import { isFinanced } from '../engine/financing';
import { hasFullStack } from '../engine/fullstack';
import { scoreBreakdown } from '../engine/scoring';
import type { Building, DiceRoll, GameState, ProductionReport, ResourceBundle } from '../engine/types';
import { RESOURCES } from '../engine/types';
import { ResourceIcon } from './icons';
import type { Speed, Toast } from './useGame';

// Game-feel feedback: what just happened, shown for a moment and then gone. Everything here is
// derived from consecutive game states (never stored in them), animated with CSS only, and
// non-blocking. Timers are UI-only; the engine stays deterministic.

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED_MOTION_QUERY).matches;
}

/** How long a roll's board highlights, payout chips and gain ribbons stay up. */
export const ROLL_FLASH_MS = 3200;
/** How long a build pulse stays mounted. */
const BUILD_PULSE_MS = 1900;

/**
 * Fire-and-forget UI timers. They are deliberately not cancelled on unmount: they only clear
 * transient state (a no-op once unmounted), and StrictMode's rehearsal unmount would otherwise
 * cancel them and leave a highlight on screen.
 */
function later(fn: () => void, ms: number): void {
  window.setTimeout(fn, ms);
}

// ---------------------------------------------------------------------------
// Roll flash: the latest roll and what it produced, kept up for a moment even after
// the turn moves on (an AI often ends its turn well before the payout animation is over).
// ---------------------------------------------------------------------------

export interface RollFlash {
  /** Increments per roll; use it in React keys so CSS animations restart. */
  seq: number;
  roll: DiceRoll;
  /** What the roll produced; null on a 7. */
  report: ProductionReport | null;
  /** Buildings as they stood at the roll (payout amounts are read from these). */
  buildings: (Building | null)[];
}

export function useRollFlash(state: GameState, ms = ROLL_FLASH_MS): RollFlash | null {
  const [flash, setFlash] = useState<RollFlash | null>(null);
  const seen = useRef<DiceRoll | null>(null);
  const seq = useRef(0);
  const roll = state.lastRoll;
  useEffect(() => {
    // lastRoll is a fresh object per ROLL and is shared by reference until END_TURN clears it.
    // Only a new roll matters; the rest of the state is read at that moment on purpose.
    if (!roll || roll === seen.current) return;
    seen.current = roll;
    const id = ++seq.current;
    setFlash({ seq: id, roll, report: state.lastProduction, buildings: state.buildings });
    later(() => setFlash((f) => (f?.seq === id ? null : f)), ms);
  }, [roll]); // eslint-disable-line react-hooks/exhaustive-deps
  return flash;
}

export interface GainFlash {
  seq: number;
  gains: ResourceBundle;
}

/** What `player` collected on the latest roll (anyone's roll), while the roll flash is up. */
export function useGainFlash(state: GameState, player: number): GainFlash | null {
  const flash = useRollFlash(state);
  const gains = flash?.report?.gains[player];
  if (!flash || !gains || sumBundle(gains) === 0) return null;
  return { seq: flash.seq, gains };
}

/** "+2 GPUs  +1 Power": the viewer's haul from the latest roll, next to their hand. */
export function GainRibbon({ gain }: { gain: GainFlash | null }) {
  if (!gain) return null;
  return (
    <div key={gain.seq} className="gain-ribbon" role="status">
      {RESOURCES.filter((r) => gain.gains[r] > 0).map((r) => (
        <span key={r} style={{ ['--res' as string]: RESOURCE_INFO[r].color }}>
          <ResourceIcon type={r} size={13} />+{gain.gains[r]} {resourceLabel(r, gain.gains[r])}
        </span>
      ))}
    </div>
  );
}

/** Per-resource "+N" bubbles laid over a five-column hand bar (the phone layout's hand). */
export function GainBubbles({ state, player }: { state: GameState; player: number }) {
  const gain = useGainFlash(state, player);
  if (!gain) return null;
  const text = RESOURCES.filter((r) => gain.gains[r] > 0)
    .map((r) => `+${gain.gains[r]} ${resourceLabel(r, gain.gains[r])}`)
    .join(', ');
  return (
    <div key={gain.seq} className="gain-bubbles">
      <span className="sr-only" role="status">
        You collected {text}.
      </span>
      {RESOURCES.map((r) => (
        <span key={r} aria-hidden="true" className={gain.gains[r] > 0 ? 'on' : ''} style={{ ['--res' as string]: RESOURCE_INFO[r].color }}>
          {gain.gains[r] > 0 ? <b>+{gain.gains[r]}</b> : null}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Build pulses: which pieces just appeared on the board
// ---------------------------------------------------------------------------

export interface FreshPiece {
  seq: number;
  /** Compute Points the change was worth (0 for a financed upgrade). */
  cp: number;
}

export interface FreshBuilds {
  vertices: Map<number, FreshPiece>;
  edges: Map<number, FreshPiece>;
}

const NO_FRESH: FreshBuilds = { vertices: new Map(), edges: new Map() };

/** CP a building is worth on the board. */
function buildingCp(b: Building | null | undefined): number {
  if (!b) return 0;
  if (b.kind === 'cluster' || isFinanced(b)) return 1;
  return 2;
}

/**
 * Pieces placed or upgraded since the previous state, kept for a short pulse. Nothing pulses
 * on the first render or when a different game is loaded, so only real builds light up.
 */
export function useFreshBuilds(state: GameState): FreshBuilds {
  const [fresh, setFresh] = useState<FreshBuilds>(NO_FRESH);
  const prev = useRef<GameState | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (!before || before === state) return;
    if (!isSameGame(before, state)) {
      setFresh(NO_FRESH);
      return;
    }
    const id = ++seq.current;
    const vertices = new Map<number, FreshPiece>();
    const edges = new Map<number, FreshPiece>();
    state.buildings.forEach((b, v) => {
      const old = before.buildings[v];
      if (!b || b === old) return;
      // Same piece written anew (e.g. a financed factory delivering a unit) is not a build,
      // unless it just became a full factory.
      const gained = buildingCp(b) - (old && old.owner === b.owner ? buildingCp(old) : 0);
      if (old && old.kind === b.kind && gained <= 0) return;
      vertices.set(v, { seq: id, cp: Math.max(0, gained) });
    });
    state.roads.forEach((owner, e) => {
      if (owner !== null && before.roads[e] === null) edges.set(e, { seq: id, cp: 0 });
    });
    if (vertices.size === 0 && edges.size === 0) return;
    setFresh((f) => ({
      vertices: new Map([...f.vertices, ...vertices]),
      edges: new Map([...f.edges, ...edges]),
    }));
    later(() => {
      setFresh((f) => ({
        vertices: new Map([...f.vertices].filter(([, p]) => p.seq !== id)),
        edges: new Map([...f.edges].filter(([, p]) => p.seq !== id)),
      }));
    }, BUILD_PULSE_MS);
  }, [state]);
  return fresh;
}

/** False when `after` is a different game (new game, restarted demo, loaded save). */
function isSameGame(before: GameState, after: GameState): boolean {
  return (
    before.seed === after.seed &&
    before.players.length === after.players.length &&
    before.buildings.length === after.buildings.length &&
    after.nextLogId >= before.nextLogId
  );
}

// ---------------------------------------------------------------------------
// Notable moments: success toasts for the viewer's own milestones, and a rate-limited,
// coalesced ticker of rivals' notable actions. Derived from state diffs plus new log entries.
// ---------------------------------------------------------------------------

interface Moment {
  /** Company the moment is about (null = market-wide). */
  player: number | null;
  text: string;
  /** 0 = filler … 3 = victory threat (the only kind shown at Turbo speed). */
  priority: number;
}

/** Notable things that happened between two states of the same game. Pure. */
export function notableMoments(before: GameState, after: GameState, viewer: number | null): Moment[] {
  const out: Moment[] = [];
  after.buildings.forEach((b, v) => {
    const old = before.buildings[v];
    if (!b || b === old || b.kind !== 'factory') return;
    if (!old) {
      out.push({ player: b.owner, text: 'deployed an AI Factory on a new site (+2 CP)', priority: 2 });
    } else if (old.kind === 'cluster') {
      if (isFinanced(b)) out.push({ player: b.owner, text: `financed an AI Factory (${b.financed} units committed)`, priority: 1 });
      else out.push({ player: b.owner, text: 'opened an AI Factory (+1 CP, double output)', priority: 2 });
    } else if (isFinanced(old) && !isFinanced(b)) {
      out.push({ player: b.owner, text: 'paid off a financed AI Factory: full output (+1 CP)', priority: 2 });
    }
  });
  const holder = (h: number | null, prior: number | null, title: string) => {
    if (h === prior) return;
    const from = prior === null ? '' : prior === viewer ? ' from you' : ` from ${after.players[prior].name}`;
    if (h !== null) out.push({ player: h, text: `took ${title}${from} (+2 CP)`, priority: prior === viewer && prior !== null ? 3 : 2 });
    else if (prior !== null) out.push({ player: prior, text: `lost ${title}`, priority: 1 });
  };
  holder(after.longestRoadHolder, before.longestRoadHolder, 'Longest Network');
  holder(after.largestArmyHolder, before.largestArmyHolder, 'Priority Access');
  after.players.forEach((p) => {
    if (hasFullStack(after, p.id) && !hasFullStack(before, p.id)) {
      out.push({ player: p.id, text: 'unlocked Full-Stack Integration', priority: 2 });
    }
  });
  // Grid Stability: an outage that just expired gets a quiet notice (no dialog, no acknowledgment).
  const restored = after.log.find((e) => e.kind === 'disruption' && e.id >= before.nextLogId && e.text.startsWith('Grid restored'));
  if (restored) out.push({ player: null, text: restored.text.replace(/^Grid restored: /, ''), priority: 1 });
  // Market events speak for themselves: show the first new one.
  const event = after.log.find((e) => e.kind === 'event' && e.id >= before.nextLogId);
  if (event) out.push({ player: null, text: event.text, priority: 2 });
  // Victory threats, from public information only (secret Breakthroughs may make it closer still).
  after.players.forEach((p) => {
    if (after.phase === 'gameOver') return;
    const now = scoreBreakdown(after, p.id).publicTotal;
    const was = scoreBreakdown(before, p.id).publicTotal;
    if (now < VP_TO_WIN - 2 || now <= was) return;
    out.push({
      player: p.id,
      text: now >= VP_TO_WIN ? `reached ${now} CP and wins at the start of its turn` : `is ${VP_TO_WIN - now} CP from winning`,
      priority: 3,
    });
  });
  return out;
}

/** Toast text for the viewer's own moments (null = not worth a toast). */
function ownToast(before: GameState, after: GameState, viewer: number): string[] {
  const out: string[] = [];
  after.buildings.forEach((b, v) => {
    const old = before.buildings[v];
    if (!b || b === old || b.owner !== viewer) return;
    if (!old) out.push(b.kind === 'cluster' ? '+1 CP — Compute Cluster online' : '+2 CP — AI Factory deployed, double output');
    else if (old.kind === 'cluster' && b.kind === 'factory') {
      out.push(isFinanced(b) ? `AI Factory financed — full output once ${b.financed} committed units are delivered` : '+1 CP — AI Factory online, double output');
    } else if (isFinanced(old) && !isFinanced(b)) out.push('+1 CP — financing paid off, AI Factory at full output');
  });
  if (after.longestRoadHolder === viewer && before.longestRoadHolder !== viewer) out.push('+2 CP — Longest Network is yours');
  if (after.largestArmyHolder === viewer && before.largestArmyHolder !== viewer) out.push('+2 CP — Priority Access is yours');
  if (hasFullStack(after, viewer) && !hasFullStack(before, viewer)) out.push('Full-Stack Integration unlocked — Integrated Deployment is open to you');
  return out;
}

interface Notice {
  id: number;
  player: number | null;
  parts: string[];
  priority: number;
}

/** Minimum gap between two rival notices. */
const NOTICE_GAP_MS = 1500;
/** How long a notice stays up. */
const NOTICE_SHOW_MS = 3800;
/** Notices waiting beyond this are dropped, lowest value first. */
const MAX_QUEUED = 3;

/**
 * Mount once per layout, inside a positioned container (the ticker floats in its top-left).
 * Pushes success toasts for the viewer's own milestones and shows a quiet, coalesced ticker
 * of rivals' notable actions: at most one new notice every 1.5 s, at most two on screen,
 * low-value ones dropped when busy, and only victory threats at Turbo speed. Never blocks.
 */
export function FeedbackLayer({
  state,
  viewer,
  speed,
  pushToast,
}: {
  state: GameState;
  viewer: number | null;
  speed: Speed;
  pushToast: (text: string, kind?: Toast['kind']) => void;
}) {
  const prev = useRef<GameState | null>(null);
  const queue = useRef<Notice[]>([]);
  const nextId = useRef(1);
  const lastShown = useRef(-Infinity);
  const pumping = useRef(false);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const [shown, setShown] = useState<Notice[]>([]);

  const pump = useCallback(() => {
    if (pumping.current) return;
    const wait = lastShown.current + NOTICE_GAP_MS - performance.now();
    if (wait > 0) {
      pumping.current = true;
      later(() => {
        pumping.current = false;
        pump();
      }, wait);
      return;
    }
    const next = queue.current.shift();
    if (!next) return;
    lastShown.current = performance.now();
    setShown((s) => [...s.slice(-1), next]);
    later(() => setShown((s) => s.filter((n) => n.id !== next.id)), NOTICE_SHOW_MS);
    if (queue.current.length > 0) pump();
  }, []);

  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (!before || before === state) return;
    if (!isSameGame(before, state)) {
      queue.current = [];
      setShown([]);
      return;
    }
    if (viewer !== null) for (const text of ownToast(before, state, viewer)) pushToast(text, 'success');
    if (state.phase === 'gameOver') {
      queue.current = [];
      return;
    }
    for (const m of notableMoments(before, state, viewer)) {
      if (m.player !== null && m.player === viewer) continue; // the viewer's own moments are toasts
      if (speedRef.current === 'turbo' && m.priority < 3) continue;
      const text = m.text;
      const q = queue.current;
      const same = m.player !== null ? q.find((n) => n.player === m.player) : undefined;
      if (same) {
        if (!same.parts.includes(text)) same.parts.push(text);
        same.priority = Math.max(same.priority, m.priority);
        continue;
      }
      q.push({ id: nextId.current++, player: m.player, parts: [text], priority: m.priority });
      while (q.length > MAX_QUEUED) {
        let drop = 0;
        q.forEach((n, i) => {
          if (n.priority < q[drop].priority) drop = i;
        });
        q.splice(drop, 1);
      }
    }
    pump();
  }, [state, viewer, pushToast, pump]);

  if (shown.length === 0) return null;
  return (
    <div className="rival-feed" aria-live="polite">
      {shown.map((n) => {
        const p = n.player !== null ? state.players[n.player] : null;
        const co = p ? companyById(p.companyId) : null;
        return (
          <div key={n.id} className={`rival-notice${n.priority >= 3 ? ' threat' : ''}`} style={co ? { ['--co' as string]: co.color } : undefined}>
            <i className="rival-notice-mark" aria-hidden="true" />
            <span>
              <b>{p ? p.name : n.parts[0]?.includes('back online') ? 'Grid restored' : 'Market'}</b> {n.parts.join(' · ')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Count-up (victory screen)
// ---------------------------------------------------------------------------

/** Counts from 0 to `target` over `ms` (instantly when the player prefers reduced motion). */
export function useCountUp(target: number, ms = 1100): number {
  const [n, setN] = useState(() => (prefersReducedMotion() ? target : 0));
  useEffect(() => {
    if (prefersReducedMotion()) {
      setN(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      setN(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}
