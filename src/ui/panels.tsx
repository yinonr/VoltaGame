import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { BuildType } from '../engine/constants';
import { BUILD_LABELS, COSTS, DEV_CARD_INFO, RESOURCE_INFO, VP_TO_WIN, companyById, sumBundle } from '../engine/constants';
import { getActingPlayer } from '../engine/game';
import { checkBuild, checkPlayCard, piecesLeft } from '../engine/rules';
import { longestNetwork, scoreBreakdown } from '../engine/scoring';
import type { DevCardType, GameState, LogEntry } from '../engine/types';
import { RESOURCES } from '../engine/types';
import { ClusterShape, FactoryShape } from './Board';
import { DieFace, ResourceChip, ResourceIcon } from './icons';

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

export function Scoreboard({ state, viewer }: { state: GameState; viewer: number | null }) {
  const acting = getActingPlayer(state);
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
        return (
          <article key={p.id} className={`company${isTurn ? ' active' : ''}${isViewer ? ' viewer' : ''}${state.winner === p.id ? ' winner' : ''}`} style={{ ['--co' as string]: c.color }}>
            <div className="company-top">
              <CompanyDot companyId={p.companyId} size={14} />
              <div className="company-name">
                <strong>{p.name}</strong>
                <span className="muted small">
                  {c.sector}
                  {p.isAI ? ' · AI' : isViewer ? ' · You' : ' · Human'}
                </span>
              </div>
              <div className="vp" title={isViewer && sb.breakthroughs ? `Includes ${sb.breakthroughs} secret AI Breakthrough point(s)` : 'Public Compute Points'}>
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
              {state.longestRoadHolder === p.id && <span className="badge">Longest Network +2</span>}
              {state.largestArmyHolder === p.id && <span className="badge">Priority Access +2</span>}
              {thinking && <span className="badge thinking">{state.pendingTrade?.to === p.id ? 'Considering offer…' : 'Thinking…'}</span>}
              {isTurn && !thinking && !p.isAI && <span className="badge turn">{isViewer ? 'Your turn' : 'Their turn'}</span>}
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

export function DiceDisplay({ state }: { state: GameState }) {
  const roll = state.lastRoll;
  const [rolling, setRolling] = useState(false);
  const lastKey = useRef<string>('');
  const key = roll ? `${state.turn}-${roll.d1}-${roll.d2}` : '';
  useEffect(() => {
    if (key && key !== lastKey.current) {
      lastKey.current = key;
      setRolling(true);
      const t = window.setTimeout(() => setRolling(false), 550);
      return () => window.clearTimeout(t);
    }
  }, [key]);
  return (
    <div className={`dice${roll?.total === 7 ? ' seven' : ''}`}>
      <DieFace value={roll?.d1 ?? 6} rolling={rolling} idle={!roll} />
      <DieFace value={roll?.d2 ?? 6} rolling={rolling} idle={!roll} />
      <div className="dice-total">{roll ? <b className={rolling ? 'pop' : ''}>{roll.total}</b> : <span className="muted">—</span>}</div>
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
  return (
    <section className="panel hand" aria-label="Your resources">
      <header className="panel-head">
        <h2>Resources</h2>
        <span className={`muted small${total > 7 ? ' warn' : ''}`}>{total} in hand{total > 7 ? ' · over limit on a 7' : ''}</span>
      </header>
      <div className="hand-grid">
        {RESOURCES.map((r) => (
          <div key={r} className={`hand-card${p.resources[r] === 0 ? ' empty' : ''}`} style={{ ['--res' as string]: RESOURCE_INFO[r].color }} title={RESOURCE_INFO[r].blurb}>
            <ResourceIcon type={r} size={26} />
            <FlashCount value={p.resources[r]} />
            <span className="hand-label">{RESOURCE_INFO[r].label}</span>
          </div>
        ))}
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

function BuildGlyph({ type, color, stroke }: { type: BuildType; color: string; stroke: string }) {
  return (
    <svg width="34" height="34" viewBox="-20 -20 40 40" aria-hidden="true">
      {type === 'road' && <line x1={-13} y1={9} x2={13} y2={-9} stroke={color} strokeWidth={7} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 0 ${stroke})` }} />}
      {type === 'cluster' && <ClusterShape x={0} y={0} color={color} stroke={stroke} />}
      {type === 'factory' && <FactoryShape x={0} y={2} color={color} stroke={stroke} scale={0.9} />}
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

export function BuildPanel({
  state,
  player,
  mode,
  onSelect,
}: {
  state: GameState;
  player: number;
  mode: BuildType | null;
  onSelect: (t: BuildType) => void;
}) {
  const p = state.players[player];
  const company = companyById(p.companyId);
  const left = piecesLeft(state, player);
  return (
    <section className="panel build" aria-label="Build">
      <header className="panel-head">
        <h2>Build</h2>
        <span className="muted small">Click, then pick a glowing spot</span>
      </header>
      {BUILD_ORDER.map((t) => {
        const check = checkBuild(state, player, t);
        const active = mode === t;
        const piecesInfo = t === 'road' ? left.road : t === 'cluster' ? left.cluster : t === 'factory' ? left.factory : state.devDeck.length;
        return (
          <div key={t} className={`build-row${active ? ' active' : ''}${check.ok ? '' : ' disabled'}`}>
            <button
              className="build-btn"
              onClick={() => onSelect(t)}
              disabled={!check.ok && !active}
              aria-pressed={active}
              title={check.ok ? `Build ${BUILD_LABELS[t]} — ${BUILD_VALUE[t]}` : check.reason}
            >
              <BuildGlyph type={t} color={company.color} stroke={company.stroke} />
              <span className="build-text">
                <strong>
                  {BUILD_LABELS[t]} <span className="left-count">{t === 'card' ? `${piecesInfo} in deck` : `${piecesInfo} left`}</span>
                </strong>
                {active ? (
                  <span className="small hint">Pick a glowing spot · Esc to cancel</span>
                ) : check.ok ? (
                  <span className="small muted">{BUILD_VALUE[t]}</span>
                ) : (
                  <span className="small why">{check.reason}</span>
                )}
              </span>
              <span className="cost">
                {RESOURCES.filter((r) => COSTS[t][r] > 0).map((r) => (
                  <ResourceChip key={r} type={r} count={COSTS[t][r]} dim={p.resources[r] < COSTS[t][r]} title={`${COSTS[t][r]} ${RESOURCE_INFO[r].label} (you have ${p.resources[r]})`} />
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
