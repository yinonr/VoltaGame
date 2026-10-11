import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { BuildType } from '../engine/constants';
import {
  BUILD_LABELS,
  COSTS,
  DEV_CARD_INFO,
  FINANCING_COMMITMENT,
  FINANCING_COST,
  FINANCING_MAX_OUTSTANDING,
  INTEGRATED_DEPLOYMENT_COST,
  RESOURCE_INFO,
  VP_TO_WIN,
  companyById,
  rulesOf,
  sumBundle,
} from '../engine/constants';
import { checkFinancedUpgrade, financedVertices } from '../engine/financing';
import { checkIntegratedDeployment } from '../engine/fullstack';
import { getActingPlayer } from '../engine/game';
import { checkBuild, checkPlayCard, piecesLeft } from '../engine/rules';
import type { Check } from '../engine/rules';
import { longestNetwork, scoreBreakdown } from '../engine/scoring';
import type { DevCardType, DiceRoll, GameState, LogEntry, ResourceBundle } from '../engine/types';
import { RESOURCES } from '../engine/types';
import { ClusterShape, FactoryShape } from './Board';
import { GainRibbon, prefersReducedMotion, useGainFlash } from './feedback';
import { DieFace, ResourceChip, ResourceIcon } from './icons';
import { hasFullStack } from '../engine/fullstack';
import { leaderOf, profileOf } from './companies';

function PieceGlyph({ kind, color, stroke }: { kind: 'cluster' | 'factory'; color: string; stroke: string }) {
  return (
    <svg width="13" height="13" viewBox="-17 -20 34 34" aria-hidden="true" className="piece-glyph">
      {kind === 'cluster' ? <ClusterShape x={0} y={-3} color={color} stroke={stroke} /> : <FactoryShape x={0} y={-2} color={color} stroke={stroke} scale={0.95} />}
    </svg>
  );
}

export function CompanyDot({ companyId, size = 10 }: { companyId: string; size?: number }) {
  const c = companyById(companyId);
  return <span className="company-dot" style={{ width: size, height: size, background: c.color, borderColor: c.stroke }} />;
}

// ---------------------------------------------------------------------------
// Scoreboard
// ---------------------------------------------------------------------------

/** Marks the company the person at the screen controls (follows the viewer in pass-and-play). */
export function YouTag({ mini = false }: { mini?: boolean }) {
  return (
    <span className={`you-tag${mini ? ' mini' : ''}`} title="Your company">
      YOU
    </span>
  );
}

/** Crown for the company strictly ahead on public Compute Points (none on a tie). */
export function LeaderMark({ size = 13 }: { size?: number }) {
  return (
    <svg className="leader-mark" width={size} height={size} viewBox="0 0 16 16" role="img" aria-label="Leader">
      <title>Leader: most public Compute Points</title>
      <path d="M2 12.2 1 4.6l4 3L8 2.4l3 5.2 4-3-1 7.6Z" fill="currentColor" />
      <rect x="2" y="13.3" width="12" height="1.7" rx="0.85" fill="currentColor" />
    </svg>
  );
}

export function Scoreboard({ state, viewer }: { state: GameState; viewer: number | null }) {
  const acting = getActingPlayer(state);
  const leader = leaderOf(state);
  return (
    <section className="panel scoreboard" aria-label="Companies">
      <header className="panel-head">
        <h2>Market</h2>
        <span className="muted">First to {VP_TO_WIN} Compute Points</span>
      </header>
      {state.players.map((p) => {
        const c = companyById(p.companyId);
        const sb = scoreBreakdown(state, p.id);
        const isViewer = viewer === p.id;
        const shown = isViewer || state.phase === 'gameOver' ? sb.total : sb.publicTotal;
        const isTurn = state.currentPlayer === p.id && state.phase !== 'gameOver';
        const thinking = acting === p.id && p.isAI && state.phase !== 'gameOver';
        const cards = sumBundle(p.resources);
        const left = piecesLeft(state, p.id);
        const leveraged = financedVertices(state, p.id).length;
        return (
          <article
            key={p.id}
            className={`company${isTurn ? ' active' : ''}${isViewer ? ' viewer' : ''}${state.winner === p.id ? ' winner' : ''}${leader === p.id ? ' leader' : ''}`}
            style={{ ['--co' as string]: c.color }}
            aria-current={isTurn ? 'step' : undefined}
          >
            <div className="company-top">
              <CompanyDot companyId={p.companyId} size={14} />
              <div className="company-name">
                <span className="company-title">
                  <strong title={p.name}>{p.name}</strong>
                  {isViewer && <YouTag />}
                </span>
                <span className="muted small company-sub">
                  {isViewer ? (
                    <>
                      <span className="your-color">
                        <i aria-hidden="true" />
                        Your color
                      </span>{' '}
                      · {c.sector}
                    </>
                  ) : (
                    <>
                      {c.sector} ·{' '}
                      {p.isAI ? (
                        <span className="strategy-tag" title={profileOf(c.id).plan}>
                          {profileOf(c.id).strategy}
                        </span>
                      ) : (
                        'Human'
                      )}
                    </>
                  )}
                </span>
              </div>
              <div className="vp" title={isViewer && sb.breakthroughs ? `Includes ${sb.breakthroughs} secret AI Breakthrough point(s)` : 'Public Compute Points'}>
                {leader === p.id && <LeaderMark />}
                <b>{shown}</b>
                <span>CP</span>
              </div>
            </div>
            <div className="vp-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (shown / VP_TO_WIN) * 100)}%` }} />
            </div>
            <div className="company-stats">
              <span title="Resources in hand (over 7 risks a discard on a Grid Disruption)" className={cards > 7 ? 'warn' : ''}>
                <i>Hand</i> {cards}
              </span>
              <span title="Unplayed Innovation Cards">
                <i>Cards</i> {p.devCards.length}
              </span>
              <span title="Infrastructure Priority cards played (3+ and most wins Priority Access)">
                <i>Priority</i> {p.priorityPlayed}
              </span>
              <span title="Longest connected network (5+ and longest wins Longest Network)">
                <i>Net</i> {longestNetwork(state, p.id)}
              </span>
              <span className="pieces" title={`${5 - left.cluster} Compute Clusters and ${4 - left.factory} AI Factories on the board`}>
                <PieceGlyph kind="cluster" color={c.color} stroke={c.stroke} /> {5 - left.cluster}
                <PieceGlyph kind="factory" color={c.color} stroke={c.stroke} /> {4 - left.factory}
              </span>
            </div>
            <div className="badges">
              {thinking && (
                <span className="badge thinking">
                  {state.pendingTrade?.to === p.id ? 'Considering offer…' : !isTurn && state.phase === 'discard' ? 'Discarding…' : 'Taking its turn…'}
                </span>
              )}
              {isTurn && !thinking && !p.isAI && <span className="badge turn">{isViewer ? 'Your turn' : 'Their turn'}</span>}
              {state.longestRoadHolder === p.id && <span className="badge">Longest Network +2</span>}
              {state.largestArmyHolder === p.id && <span className="badge">Priority Access +2</span>}
              {hasFullStack(state, p.id) && (
                <span className="badge fullstack" title="Full-Stack Integration unlocked: can deploy AI Factories directly onto open network sites">
                  Full-Stack
                </span>
              )}
              {leveraged > 0 && (
                <span className="badge leveraged" title="Financed AI Factories still paying back their commitment (1 CP each until delivered)">
                  Leveraged ×{leveraged}
                </span>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Event log
// ---------------------------------------------------------------------------

export function EventLog({ state }: { state: GameState }) {
  const entries = state.log.slice(-60).reverse();
  return (
    <section className="panel log" aria-label="Event log" aria-live="polite">
      <header className="panel-head">
        <h2>Activity</h2>
      </header>
      <ol>
        {entries.map((e: LogEntry) => {
          const co = e.player !== null ? companyById(state.players[e.player].companyId) : null;
          return (
            <li key={e.id} className={`log-${e.kind}`} style={co ? { ['--co' as string]: co.color } : undefined}>
              {e.kind === 'turn' ? <span className="log-turn">{e.text}</span> : e.text}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dice + turn
// ---------------------------------------------------------------------------

/** How long the dice tumble before they settle (the board lights up as they land). */
const TUMBLE_MS = 640;
const TUMBLE_STEP_MS = 80;

export function DiceDisplay({ state }: { state: GameState }) {
  // The last roll stays on the table (dimmed) after the turn ends, until the next roll.
  const [shown, setShown] = useState<{ roll: DiceRoll; seq: number } | null>(() => (state.lastRoll ? { roll: state.lastRoll, seq: 0 } : null));
  const [tumble, setTumble] = useState(0); // > 0 while tumbling: the face-shuffle step
  const seen = useRef<DiceRoll | null>(state.lastRoll);
  const seq = useRef(0);
  const live = state.lastRoll;
  useEffect(() => {
    if (!live || live === seen.current) return;
    seen.current = live;
    const id = ++seq.current;
    setShown({ roll: live, seq: id });
    if (prefersReducedMotion()) return;
    // Shuffle the faces while the dice tumble, then settle on the real roll. UI-only timers.
    let step = 1;
    setTumble(step);
    const timer = window.setInterval(() => {
      step++;
      if (step * TUMBLE_STEP_MS >= TUMBLE_MS || seq.current !== id) {
        window.clearInterval(timer);
        if (seq.current === id) setTumble(0);
        return;
      }
      setTumble(step);
    }, TUMBLE_STEP_MS);
  }, [live]);
  const roll = shown?.roll ?? null;
  const rolling = tumble > 0;
  const stale = !!roll && live === null;
  // A 7 is a Grid Disruption unless Grid Stability absorbed it.
  const seven = roll?.total === 7 && !roll.stabilized;
  const calm = roll?.total === 7 && !!roll.stabilized;
  const fresh = !!shown && shown.seq > 0 && !stale;
  const face = (d: number, k: number) => (rolling ? ((d + tumble * k) % 6) + 1 : d);
  return (
    <div
      className={`dice${seven ? ' seven' : ''}${rolling ? ' tumbling' : ''}${stale ? ' stale' : ''}${fresh && !rolling ? ' landed' : ''}`}
      title={stale ? `Last roll: ${roll!.total}` : undefined}
      aria-label={roll ? `${stale ? 'Last roll' : 'Rolled'} ${roll.total} (${roll.d1} + ${roll.d2})${seven ? ': Grid Disruption' : ''}` : 'Dice not rolled yet'}
      role="img"
    >
      <DieFace value={roll ? face(roll.d1, 5) : 6} rolling={rolling} idle={!roll} />
      <DieFace value={roll ? face(roll.d2, 3) : 6} rolling={rolling} idle={!roll} />
      <div className="dice-total">
        {roll ? (
          <b key={`${shown!.seq}-${rolling}`} className={rolling ? 'pending' : fresh ? 'pop' : ''}>
            {rolling ? '·' : roll.total}
          </b>
        ) : (
          <span className="muted">—</span>
        )}
      </div>
      {seven && !rolling && !stale && (
        <span key={shown!.seq} className="dice-alert">
          Grid Disruption
        </span>
      )}
      {calm && !rolling && !stale && (
        <span key={shown!.seq} className="dice-alert stable">
          Grid stable · no disruption
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hand
// ---------------------------------------------------------------------------

export function FlashCount({ value }: { value: number }) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    if (value !== prev.current) {
      setFlash(value > prev.current ? 'up' : 'down');
      prev.current = value;
      const t = window.setTimeout(() => setFlash(null), 700);
      return () => window.clearTimeout(t);
    }
  }, [value]);
  return <b className={flash ? `flash-${flash}` : ''}>{value}</b>;
}

export function HandPanel({ state, player }: { state: GameState; player: number }) {
  const p = state.players[player];
  const total = sumBundle(p.resources);
  // What the latest roll (anyone's) paid this company: a ribbon plus a "+N" on each card.
  const gain = useGainFlash(state, player);
  return (
    <section className="panel hand" aria-label="Your resources">
      <header className="panel-head">
        <h2>Resources</h2>
        <span className={`muted small${total > 7 ? ' warn' : ''}`}>{total} in hand{total > 7 ? ' · over limit on a 7' : ''}</span>
        <GainRibbon gain={gain} />
      </header>
      <div className="hand-grid">
        {RESOURCES.map((r) => {
          const got = gain?.gains[r] ?? 0;
          return (
            <div
              key={r}
              className={`hand-card${p.resources[r] === 0 ? ' empty' : ''}`}
              style={{ ['--res' as string]: RESOURCE_INFO[r].color }}
              title={RESOURCE_INFO[r].blurb}
            >
              {got > 0 && (
                <span key={gain!.seq} className="hand-gain" aria-hidden="true">
                  +{got}
                </span>
              )}
              <ResourceIcon type={r} size={26} />
              <FlashCount value={p.resources[r]} />
              <span className="hand-label">{RESOURCE_INFO[r].label}</span>
            </div>
          );
        })}
      </div>
      <div className="supply muted small" title="Market supply left for each resource">
        Market supply:{' '}
        {RESOURCES.map((r) => (
          <span key={r} className={state.bank[r] <= 3 ? 'warn' : ''}>
            <ResourceIcon type={r} size={11} /> {state.bank[r]}{' '}
          </span>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Build menu
// ---------------------------------------------------------------------------

const BUILD_ORDER: BuildType[] = ['road', 'cluster', 'factory', 'card'];

/** What the Build menu can start: a plain build, or one of the Compute-rules factory paths. */
export type BuildChoice = BuildType | 'financing' | 'integrated';

function BuildGlyph({ type, color, stroke }: { type: BuildChoice; color: string; stroke: string }) {
  return (
    <svg width="34" height="34" viewBox="-20 -20 40 40" aria-hidden="true">
      {type === 'road' && <line x1={-13} y1={9} x2={13} y2={-9} stroke={color} strokeWidth={7} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 0 ${stroke})` }} />}
      {type === 'cluster' && <ClusterShape x={0} y={0} color={color} stroke={stroke} />}
      {type === 'factory' && <FactoryShape x={0} y={2} color={color} stroke={stroke} scale={0.9} />}
      {type === 'financing' && (
        <g>
          <circle r={18} fill="none" stroke="#fbbf24" strokeWidth={2} strokeDasharray="4 3" />
          <FactoryShape x={0} y={2} color={color} stroke={stroke} scale={0.78} />
        </g>
      )}
      {type === 'integrated' && (
        <g>
          <FactoryShape x={-1} y={3} color={color} stroke={stroke} scale={0.8} />
          <path d="M12 -18 L7 -8 H12 L9 0 L17 -11 H12 Z" fill="#fde68a" stroke="#0b1020" strokeWidth={1} />
        </g>
      )}
      {type === 'card' && (
        <g>
          <rect x={-10} y={-14} width={20} height={28} rx={3} fill="#1e1b4b" stroke="#a78bfa" strokeWidth={2} />
          <path d="M0 -6 L5 0 L0 6 L-5 0 Z" fill="#a78bfa" />
        </g>
      )}
    </svg>
  );
}

const BUILD_VALUE: Record<BuildType, string> = {
  road: 'Extends your network · 0 CP',
  cluster: '+1 CP · produces 1 per hex',
  factory: '+1 CP (2 total) · double output',
  card: 'Draw a secret Innovation Card',
};

interface BuildRow {
  key: BuildChoice;
  label: string;
  left: string;
  value: string;
  cost: ResourceBundle;
  check: Check;
}

/** Build menu rows. Under the Compute rules an upgrade is an explicit choice: standard or financed. */
function buildRows(state: GameState, player: number): BuildRow[] {
  const rules = rulesOf(state);
  const left = piecesLeft(state, player);
  const rows: BuildRow[] = [];
  for (const t of BUILD_ORDER) {
    const standard = t === 'factory' && rules.financing;
    rows.push({
      key: t,
      label: standard ? 'AI Factory · standard' : BUILD_LABELS[t],
      left: t === 'card' ? `${state.devDeck.length} in deck` : `${left[t]} left`,
      value: standard ? '+1 CP and double output now. No strings attached.' : BUILD_VALUE[t],
      cost: COSTS[t],
      check: checkBuild(state, player, t),
    });
    if (t === 'factory' && rules.financing) {
      rows.push({
        key: 'financing',
        label: 'AI Factory · financed',
        left: `${FINANCING_MAX_OUTSTANDING - financedVertices(state, player).length} of ${FINANCING_MAX_OUTSTANDING} open`,
        value: `Upgrade now; it repays ${FINANCING_COMMITMENT} units of its own output, then +1 CP and double output.`,
        cost: FINANCING_COST,
        check: checkFinancedUpgrade(state, player),
      });
    }
    if (t === 'factory' && rules.fullStack) {
      rows.push({
        key: 'integrated',
        label: 'Integrated Deployment',
        left: `${left.factory} left`,
        value: '+2 CP: a full AI Factory straight onto an open site.',
        cost: INTEGRATED_DEPLOYMENT_COST,
        check: checkIntegratedDeployment(state, player),
      });
    }
  }
  return rows;
}

export function BuildPanel({
  state,
  player,
  mode,
  onSelect,
}: {
  state: GameState;
  player: number;
  mode: BuildChoice | null;
  onSelect: (t: BuildChoice) => void;
}) {
  const p = state.players[player];
  const company = companyById(p.companyId);
  return (
    <section className="panel build" aria-label="Build">
      <header className="panel-head">
        <h2>Build</h2>
        <span className="muted small">Click, then pick a glowing spot</span>
      </header>
      {buildRows(state, player).map(({ key, label, left, value, cost, check }) => {
        const active = mode === key;
        return (
          <div key={key} className={`build-row build-${key}${active ? ' active' : ''}${check.ok ? '' : ' disabled'}`}>
            <button
              className="build-btn"
              onClick={() => onSelect(key)}
              disabled={!check.ok && !active}
              aria-pressed={active}
              title={check.ok ? `${label}: ${value}` : check.reason}
            >
              <BuildGlyph type={key} color={company.color} stroke={company.stroke} />
              <span className="build-text">
                <strong>
                  {label} <span className="left-count">{left}</span>
                </strong>
                {active ? (
                  <span className="small hint">Pick a glowing spot · Esc to cancel</span>
                ) : check.ok ? (
                  <span className="small muted">{value}</span>
                ) : (
                  <span className="small why">{check.reason}</span>
                )}
              </span>
              <span className="cost">
                {RESOURCES.filter((r) => cost[r] > 0).map((r) => (
                  <ResourceChip key={r} type={r} count={cost[r]} dim={p.resources[r] < cost[r]} title={`${cost[r]} ${RESOURCE_INFO[r].label} (you have ${p.resources[r]})`} />
                ))}
              </span>
            </button>
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Innovation cards
// ---------------------------------------------------------------------------

export function CardsPanel({ state, player, onPlay }: { state: GameState; player: number; onPlay: (t: Exclude<DevCardType, 'breakthrough'>) => void }) {
  const p = state.players[player];
  if (p.devCards.length === 0) {
    return (
      <section className="panel cards" aria-label="Innovation Cards">
        <header className="panel-head">
          <h2>Innovation Cards</h2>
        </header>
        <p className="muted small empty-note">None yet. Buy one for 1 Land + 1 Capital + 1 GPU.</p>
      </section>
    );
  }
  const groups = new Map<DevCardType, { count: number; fresh: number }>();
  for (const c of p.devCards) {
    const g = groups.get(c.type) ?? { count: 0, fresh: 0 };
    g.count++;
    if (c.boughtOnTurn >= state.turn) g.fresh++;
    groups.set(c.type, g);
  }
  return (
    <section className="panel cards" aria-label="Innovation Cards">
      <header className="panel-head">
        <h2>Innovation Cards</h2>
        <span className="muted small">One per turn</span>
      </header>
      <ul>
        {[...groups.entries()].map(([type, g]) => {
          const info = DEV_CARD_INFO[type];
          const check = type === 'breakthrough' ? null : checkPlayCard(state, player, type);
          return (
            <li key={type} className={`card-item card-${type}`} title={info.text}>
              <div className="card-head">
                <strong>
                  {info.title}
                  {g.count > 1 ? ` ×${g.count}` : ''}
                </strong>
                {type === 'breakthrough' ? (
                  <span className="badge">+1 CP secret</span>
                ) : (
                  <button className="btn small" disabled={!check?.ok} onClick={() => onPlay(type)} title={check?.ok ? `Play ${info.title}` : check?.reason}>
                    Play
                  </button>
                )}
              </div>
              <p className="small muted">{info.short}</p>
              {info.flavor && <p className="small card-flavor">“{info.flavor}”</p>}
              {g.fresh > 0 && type !== 'breakthrough' && <p className="small hint">New — playable next turn.</p>}
              {check && !check.ok && g.fresh === 0 && <p className="small why">{check.reason}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}
