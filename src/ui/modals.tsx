import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  COMPANIES,
  COSTS,
  DEV_CARD_INFO,
  FINANCING_COMMITMENT,
  FINANCING_COST,
  FINANCING_MAX_OUTSTANDING,
  GRID_OUTAGE_ROLLS,
  GRID_STABILITY_ROLLS,
  INTEGRATED_DEPLOYMENT_COST,
  RESOURCE_INFO,
  bundle,
  companyById,
  describeBundle,
  hasBundle,
  sumBundle,
} from '../engine/constants';
import { bankRate, checkBankTrade, checkTradePhase } from '../engine/rules';
import { scoreBreakdown } from '../engine/scoring';
import type { Action, GameState, Resource, ResourceBundle } from '../engine/types';
import { RESOURCES } from '../engine/types';
import { SHOW_QUICK_DEMO } from './flags';
import { ResourceIcon } from './icons';
import { CompanyDot } from './panels';
import { useCountUp } from './feedback';
import { PUBLIC_DISCLAIMER, VOLTA_BRANDING, VOLTA_SITE_URL, VoltaWordmark } from './brand';
import { choiceOf, profileOf } from './companies';

export function Modal({ title, children, onClose, wide = false, className = '' }: { title: string; children: ReactNode; onClose?: () => void; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('button:not([disabled]), [tabindex]');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} className={`modal${wide ? ' wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function Stepper({ value, onChange, max, label }: { value: ResourceBundle; onChange: (b: ResourceBundle) => void; max?: ResourceBundle; label: string }) {
  return (
    <div className="stepper" aria-label={label}>
      {RESOURCES.map((r) => {
        const limit = max ? max[r] : 9;
        return (
          <div key={r} className="stepper-cell" style={{ ['--res' as string]: RESOURCE_INFO[r].color }}>
            <ResourceIcon type={r} size={20} />
            <span className="small">{RESOURCE_INFO[r].label}</span>
            <div className="stepper-ctrl">
              <button className="icon-btn" disabled={value[r] <= 0} onClick={() => onChange({ ...value, [r]: value[r] - 1 })} aria-label={`Less ${RESOURCE_INFO[r].label}`}>
                −
              </button>
              <b>{value[r]}</b>
              <button className="icon-btn" disabled={value[r] >= limit} onClick={() => onChange({ ...value, [r]: value[r] + 1 })} aria-label={`More ${RESOURCE_INFO[r].label}`}>
                +
              </button>
            </div>
            {max && <span className="tiny muted">of {max[r]}</span>}
          </div>
        );
      })}
    </div>
  );
}

function ResourcePicker({ value, onChange, disabled }: { value: Resource | null; onChange: (r: Resource) => void; disabled?: (r: Resource) => string | null }) {
  return (
    <div className="picker">
      {RESOURCES.map((r) => {
        const why = disabled?.(r) ?? null;
        return (
          <button
            key={r}
            className={`pick${value === r ? ' selected' : ''}`}
            style={{ ['--res' as string]: RESOURCE_INFO[r].color }}
            onClick={() => onChange(r)}
            disabled={!!why}
            title={why ?? RESOURCE_INFO[r].label}
          >
            <ResourceIcon type={r} size={22} />
            <span className="small">{RESOURCE_INFO[r].label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trade
// ---------------------------------------------------------------------------

export function TradeModal({ state, player, dispatch, onClose }: { state: GameState; player: number; dispatch: (a: Action) => boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'market' | 'rivals'>('market');
  const [give, setGive] = useState<Resource | null>(null);
  const [get, setGet] = useState<Resource | null>(null);
  const [offerGive, setOfferGive] = useState<ResourceBundle>(bundle());
  const [offerGet, setOfferGet] = useState<ResourceBundle>(bundle());
  const me = state.players[player];
  const phaseCheck = checkTradePhase(state, player);
  const bankCheck = give && get ? checkBankTrade(state, player, give, get) : { ok: false, reason: 'Pick what to give and what to get.' };

  const recentTrades = state.log.filter((e) => e.kind === 'trade' && e.turn === state.turn).slice(-4).reverse();
  const pending = state.pendingTrade;

  const offerProblem = (() => {
    if (!phaseCheck.ok) return phaseCheck.reason!;
    if (pending) return `Waiting for ${state.players[pending.to].name}…`;
    if (sumBundle(offerGive) === 0) return 'Add something you will give.';
    if (sumBundle(offerGet) === 0) return 'Add something you want.';
    if (RESOURCES.some((r) => offerGive[r] > 0 && offerGet[r] > 0)) return "Don't offer and request the same resource.";
    if (!hasBundle(me.resources, offerGive)) return "You don't have that much.";
    if (state.tradesProposedThisTurn >= 6) return 'Rivals are done negotiating this turn.';
    return null;
  })();

  return (
    <Modal title="Make a deal" onClose={onClose} wide>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'market'} className={tab === 'market' ? 'on' : ''} onClick={() => setTab('market')}>
          Market (bank)
        </button>
        <button role="tab" aria-selected={tab === 'rivals'} className={tab === 'rivals' ? 'on' : ''} onClick={() => setTab('rivals')}>
          Rival companies
        </button>
      </div>

      {!phaseCheck.ok && <p className="why">{phaseCheck.reason}</p>}

      {tab === 'market' ? (
        <div className="trade-market">
          <p className="muted small">
            Trade identical resources to the market at 4:1 — or better through hubs your clusters touch (3:1 any, 2:1 specific).
          </p>
          <h3>You give</h3>
          <ResourcePicker
            value={give}
            onChange={setGive}
            disabled={(r) => {
              const rate = bankRate(state, player, r);
              return me.resources[r] < rate ? `Need ${rate} ${RESOURCE_INFO[r].label} (you have ${me.resources[r]})` : null;
            }}
          />
          <div className="rates small muted">
            {RESOURCES.map((r) => (
              <span key={r}>
                <ResourceIcon type={r} size={11} /> {bankRate(state, player, r)}:1
              </span>
            ))}
          </div>
          <h3>You get</h3>
          <ResourcePicker value={get} onChange={setGet} disabled={(r) => (r === give ? 'Pick a different resource' : state.bank[r] <= 0 ? 'Market is out' : null)} />
          <div className="modal-actions">
            <span className={bankCheck.ok ? 'muted small' : 'why'}>
              {bankCheck.ok && give && get
                ? `Give ${bankRate(state, player, give)} ${RESOURCE_INFO[give].label} → get 1 ${RESOURCE_INFO[get].label}`
                : bankCheck.reason}
            </span>
            <button className="btn primary" disabled={!bankCheck.ok} onClick={() => give && get && dispatch({ type: 'BANK_TRADE', give, get })}>
              Trade with market
            </button>
          </div>
        </div>
      ) : (
        <div className="trade-rivals">
          <p className="muted small">Rivals accept deals that help their plans. They won't feed a company that's close to winning (8+ CP).</p>
          <h3>You give</h3>
          <Stepper value={offerGive} onChange={setOfferGive} max={me.resources} label="You give" />
          <h3>You ask for</h3>
          <Stepper value={offerGet} onChange={setOfferGet} label="You ask for" />
          <div className="rival-row">
            {state.players
              .filter((p) => p.id !== player)
              .map((p) => {
                return (
                  <button
                    key={p.id}
                    className="btn rival"
                    disabled={!!offerProblem}
                    onClick={() => dispatch({ type: 'PROPOSE_TRADE', to: p.id, give: offerGive, get: offerGet })}
                    title={offerProblem ?? `Send this offer to ${p.name}`}
                  >
                    <CompanyDot companyId={p.companyId} />
                    Offer to {companyById(p.companyId).short}
                    <span className="tiny muted">{sumBundle(p.resources)} cards</span>
                  </button>
                );
              })}
          </div>
          <p className={offerProblem ? 'why' : 'muted small'}>{offerProblem ?? `Offer ${describeBundle(offerGive)} for ${describeBundle(offerGet)}.`}</p>
          {recentTrades.length > 0 && (
            <ul className="trade-history">
              {recentTrades.map((e) => (
                <li key={e.id} className="small">
                  {e.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

export function IncomingOfferModal({ state, dispatch }: { state: GameState; dispatch: (a: Action) => boolean }) {
  const offer = state.pendingTrade!;
  const from = state.players[offer.from];
  const me = state.players[offer.to];
  const canAccept = hasBundle(me.resources, offer.get);
  const theirCp = scoreBreakdown(state, from.id).publicTotal;
  const giving = RESOURCES.filter((r) => offer.get[r] > 0);
  return (
    <Modal title={`${from.name} wants to deal`}>
      <p className="muted small offer-context">
        <CompanyDot companyId={from.companyId} /> {companyById(from.companyId).sector} · {theirCp} CP · You hold{' '}
        {giving.map((r) => `${me.resources[r]} ${RESOURCE_INFO[r].label}`).join(', ')}.
        {theirCp >= 7 && <span className="warn"> Careful: they're close to winning.</span>}
      </p>
      <div className="offer">
        <div>
          <h3>You receive</h3>
          <BundleRow b={offer.give} />
        </div>
        <div className="offer-arrow">⇄</div>
        <div>
          <h3>You give</h3>
          <BundleRow b={offer.get} />
        </div>
      </div>
      {!canAccept && <p className="why">You don't have {describeBundle(offer.get)}.</p>}
      <div className="modal-actions">
        <button className="btn" onClick={() => dispatch({ type: 'RESPOND_TRADE', accept: false, reason: 'not this time.' })}>
          Decline
        </button>
        <button className="btn primary" disabled={!canAccept} onClick={() => dispatch({ type: 'RESPOND_TRADE', accept: true, reason: 'deal done.' })}>
          Accept deal
        </button>
      </div>
    </Modal>
  );
}

export function BundleRow({ b }: { b: ResourceBundle }) {
  return (
    <div className="bundle-row">
      {RESOURCES.filter((r) => b[r] > 0).map((r) => (
        <span key={r} className="bundle-item" style={{ ['--res' as string]: RESOURCE_INFO[r].color }}>
          <ResourceIcon type={r} size={22} />
          <b>×{b[r]}</b>
          <span className="small">{RESOURCE_INFO[r].label}</span>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disruption-related
// ---------------------------------------------------------------------------

export function DiscardModal({ state, player, dispatch }: { state: GameState; player: number; dispatch: (a: Action) => boolean }) {
  const need = state.pendingDiscards[player];
  const me = state.players[player];
  const [sel, setSel] = useState<ResourceBundle>(bundle());
  const n = sumBundle(sel);
  return (
    <Modal title="Grid Disruption — over the hand limit">
      <p>
        You hold {sumBundle(me.resources)} resources. Discard <b>{need}</b> back to the market.
      </p>
      <Stepper value={sel} onChange={setSel} max={me.resources} label="Discard" />
      <div className="modal-actions">
        <span className={n === need ? 'muted small' : 'why'}>{n === need ? 'Ready.' : `Selected ${n} of ${need}.`}</span>
        <button className="btn primary" disabled={n !== need} onClick={() => dispatch({ type: 'DISCARD', resources: sel })}>
          Discard {need}
        </button>
      </div>
    </Modal>
  );
}

export function VictimModal({ state, victims, onPick, onCancel }: { state: GameState; victims: number[]; onPick: (v: number) => void; onCancel: () => void }) {
  return (
    <Modal title="Take 1 resource from…" onClose={onCancel}>
      <div className="victims">
        {victims.map((v) => {
          const p = state.players[v];
          return (
            <button key={v} className="btn rival" onClick={() => onPick(v)}>
              <CompanyDot companyId={p.companyId} />
              {p.name}
              <span className="tiny muted">{sumBundle(p.resources)} cards</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Innovation card choices
// ---------------------------------------------------------------------------

export function GrantModal({ state, onConfirm, onCancel }: { state: GameState; onConfirm: (r: [Resource, Resource]) => void; onCancel: () => void }) {
  const [a, setA] = useState<Resource | null>(null);
  const [b, setB] = useState<Resource | null>(null);
  const bankOk = (() => {
    if (!a || !b) return false;
    const want = bundle();
    want[a]++;
    want[b]++;
    return hasBundle(state.bank, want);
  })();
  return (
    <Modal title={DEV_CARD_INFO.grant.title} onClose={onCancel}>
      <p className="muted">{DEV_CARD_INFO.grant.text}</p>
      <h3>First resource</h3>
      <ResourcePicker value={a} onChange={setA} disabled={(r) => (state.bank[r] <= 0 ? 'Market is out' : null)} />
      <h3>Second resource</h3>
      <ResourcePicker value={b} onChange={setB} disabled={(r) => (state.bank[r] <= (a === r ? 1 : 0) ? 'Market is out' : null)} />
      <div className="modal-actions">
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" disabled={!bankOk} onClick={() => a && b && onConfirm([a, b])}>
          Take resources
        </button>
      </div>
    </Modal>
  );
}

export function ConsolidationModal({ onConfirm, onCancel }: { onConfirm: (r: Resource) => void; onCancel: () => void }) {
  const [r, setR] = useState<Resource | null>(null);
  return (
    <Modal title={DEV_CARD_INFO.consolidation.title} onClose={onCancel}>
      <p className="muted">{DEV_CARD_INFO.consolidation.text}</p>
      <ResourcePicker value={r} onChange={setR} />
      <div className="modal-actions">
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" disabled={!r} onClick={() => r && onConfirm(r)}>
          Consolidate {r ? RESOURCE_INFO[r].label : ''}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// End of game
// ---------------------------------------------------------------------------

/** What a company actually achieved, read from the final state only (no invented labels). */
function accomplishments(state: GameState, player: number): string[] {
  const sb = scoreBreakdown(state, player);
  const out: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (sb.factories) out.push(plural(sb.factories, 'AI Factory', 'AI Factories'));
  if (sb.financedFactories) out.push(`${sb.financedFactories} still financed`);
  if (sb.clusters) out.push(plural(sb.clusters, 'Compute Cluster', 'Compute Clusters'));
  if (state.longestRoadHolder === player) out.push('Longest Network');
  if (state.largestArmyHolder === player) out.push('Priority Access');
  const unlocked = state.players[player].fullStackTurn;
  if (unlocked !== undefined) out.push(`Full-Stack Integration · round ${Math.max(1, Math.ceil(unlocked / state.players.length))}`);
  if (sb.breakthroughs) out.push(plural(sb.breakthroughs, 'AI Breakthrough revealed', 'AI Breakthroughs revealed'));
  return out;
}

export function WinnerModal({
  state,
  viewer,
  onNewGame,
  onDemo,
  onTitle,
  onClose,
}: {
  state: GameState;
  viewer: number | null;
  onNewGame: () => void;
  onDemo: () => void;
  onTitle: () => void;
  onClose: () => void;
}) {
  const winner = state.players[state.winner!];
  const c = companyById(winner.companyId);
  const youWon = viewer === winner.id;
  const humans = state.players.filter((p) => !p.isAI).length;
  const standings = state.players
    .map((p) => ({ p, sb: scoreBreakdown(state, p.id) }))
    .sort((x, y) => y.sb.total - x.sb.total);
  const headline = youWon ? 'You built the AI empire.' : humans === 1 && viewer !== null ? `${winner.name} scaled first.` : `${winner.name} wins.`;
  const cp = useCountUp(standings[0].sb.total);
  const rounds = Math.ceil(state.turn / state.players.length);
  const inRounds = `${rounds} round${rounds === 1 ? '' : 's'}`;
  const feats = accomplishments(state, winner.id);
  return (
    <Modal title="Market leader" onClose={onClose} wide className="winner-modal">
      <div className="winner-hero" style={{ ['--co' as string]: c.color }}>
        <div className="winner-glow" />
        <div className="winner-burst" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} style={{ ['--a' as string]: `${i * 30}deg` }} />
          ))}
        </div>
        <CompanyDot companyId={winner.companyId} size={22} />
        <h1>{headline}</h1>
        <div className="winner-cp" aria-label={`${standings[0].sb.total} Compute Points`}>
          <b>{cp}</b> CP
        </div>
        <p className="muted">
          {youWon
            ? `Frontier ambition, startup-sized balance sheet — and you still scaled first. ${standings[0].sb.total} Compute Points in ${inRounds}.`
            : `${winner.name} (${c.sector}) reached ${standings[0].sb.total} Compute Points in ${inRounds}. The market is still young — run it back.`}
        </p>
        {feats.length > 0 && (
          <ul className="accomplishments" aria-label={`${winner.name}'s accomplishments`}>
            {feats.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="standings-wrap">
      <table className="standings">
        <thead>
          <tr>
            <th>Company</th>
            <th title="Compute Clusters">Clusters</th>
            <th title="AI Factories (2 CP each; financed factories score 1 CP until their commitment is delivered)">Factories</th>
            <th>Longest Network</th>
            <th>Priority Access</th>
            <th>Breakthroughs</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {standings.map(({ p, sb }) => (
            <tr key={p.id} className={p.id === winner.id ? 'win' : ''}>
              <td>
                <CompanyDot companyId={p.companyId} /> {p.name}
                {viewer === p.id ? ' (you)' : ''}
              </td>
              <td>{sb.clusters}</td>
              <td>
                {sb.factories}
                {sb.financedFactories ? ` (+${sb.financedFactories} financed)` : ''} ({sb.factories * 2 + sb.financedFactories})
              </td>
              <td>{sb.longestNetwork ? '+2' : '—'}</td>
              <td>{sb.priorityAccess ? '+2' : '—'}</td>
              <td>{sb.breakthroughs ? `+${sb.breakthroughs}` : '—'}</td>
              <td>
                <b>{sb.total}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {VOLTA_BRANDING && (
        <div className="volta-close">
          <p className="volta-close-line">The next generation of AI runs on infrastructure.</p>
          <p className="volta-close-by">
            Brought to you by <VoltaWordmark size={15} />
            {VOLTA_SITE_URL && (
              <a href={VOLTA_SITE_URL} target="_blank" rel="noopener noreferrer">
                Visit Volta →
              </a>
            )}
          </p>
        </div>
      )}
      <div className="modal-actions">
        <button className="btn" onClick={onTitle}>
          Title screen
        </button>
        <button className="btn" onClick={onClose}>
          Inspect board
        </button>
{SHOW_QUICK_DEMO && (
        <button className="btn" onClick={onDemo}>
          Replay Quick Demo
        </button>
)}
        <button className="btn primary" onClick={onNewGame}>
          New game
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Rules / intro / pass-and-play
// ---------------------------------------------------------------------------

export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to play" onClose={onClose} wide>
      <div className="rules">
        <p>
          You run an ambitious AI company. Turn the five inputs of the compute economy into infrastructure, outbuild three rivals, and be first to{' '}
          <b>10 Compute Points (CP)</b>.
        </p>
        <h3>Resources</h3>
        <ul className="res-list">
          {RESOURCES.map((r) => (
            <li key={r}>
              <ResourceIcon type={r} size={16} /> <b>{RESOURCE_INFO[r].label}</b> <span className="muted">({RESOURCE_INFO[r].analog})</span> — {RESOURCE_INFO[r].blurb}
            </li>
          ))}
        </ul>
        <h3>Your turn</h3>
        <ol>
          <li>
            <b>Roll</b> two dice. Every hex showing that number produces: 1 resource per adjacent Compute Cluster, 2 per AI Factory.
          </li>
          <li>
            <b>Trade</b> with the market (4:1, or 3:1 / 2:1 at hubs your clusters touch) or offer deals to rivals.
          </li>
          <li>
            <b>Build</b> anything you can afford, then <b>end your turn</b>.
          </li>
        </ol>
        <h3>Build costs</h3>
        <ul>
          <li>Network Connection — 1 Power + 1 Networking. Must extend your network.</li>
          <li>Compute Cluster (1 CP) — 1 Power + 1 Networking + 1 Land + 1 Capital. On your network, at least two steps from any other building.</li>
          <li>AI Factory (2 CP total) — 3 Capital + 2 GPUs. Upgrades one of your clusters and doubles its output.</li>
          <li>Innovation Card — 1 Land + 1 Capital + 1 GPU. Play one per turn, never on the turn you bought it.</li>
        </ul>
        <h3>Grid Disruption (roll of 7)</h3>
        <p>
          Nothing produces. Anyone holding more than 7 resources discards half (rounded down). The roller moves the outage marker to a new hex — it stops producing until moved
          again — and takes 1 random resource from a rival next to it.
        </p>
        <h3>Bonuses</h3>
        <ul>
          <li>
            <b>Longest Network</b> (+2 CP): first to a 5+ connection trail; a longer trail takes it. Rival buildings cut trails.
          </li>
          <li>
            <b>Priority Access</b> (+2 CP): first to play 3 Infrastructure Priority cards; more cards take it.
          </li>
          <li>
            <b>AI Breakthrough</b> cards are secret +1 CP each.
          </li>
        </ul>
        <h3>Settlers of Compute rules</h3>
        <p className="muted small">On in the default "Settlers of Compute" mode; off in Classic.</p>
        <ul>
          <li>
            <b>Infrastructure Financing</b>: upgrade a cluster to an AI Factory for {describeBundle(FINANCING_COST)} instead of {describeBundle(COSTS.factory)}. The
            financed factory scores and produces like a cluster until it has repaid {FINANCING_COMMITMENT} units of its own output (1 each time its hexes produce;
            the outage stalls it). Then it is a full AI Factory: +1 CP and double output. Up to {FINANCING_MAX_OUTSTANDING} at a time. On your turn you can{' '}
            <b>refinance</b>: pay 1 Capital per unit left to finish it at once. Financing buys speed; building debt-free buys certainty.
          </li>
          <li>
            <b>Grid Stability</b>: after a Grid Disruption the grid stabilizes for {GRID_STABILITY_ROLLS} rolls, so a 7 in that window causes no discards,
            no theft and no outage move (it still produces nothing). An outage keeps its hex offline for the next {GRID_OUTAGE_ROLLS} rolls, then it comes
            back online. Infrastructure Priority cards still move the outage at any time and restart the 6 calm rolls when they knock a hex offline. Every roll counts, 7s included.
          </li>
          <li>
            <b>Full-Stack Integration</b>: run an operational (fully repaid) AI Factory, hold three sites, touch four resource types and connect four
            Network Connections in one network to unlock it for good. Then <b>Integrated Deployment</b> builds a full AI Factory straight onto an open
            site on your network for {describeBundle(INTEGRATED_DEPLOYMENT_COST)} (+2 CP), skipping the cluster stage.
          </li>
        </ul>
        <h3>Shortcuts</h3>
        <p className="muted">R roll · E end turn · T trade · Esc cancel placement</p>
      </div>
    </Modal>
  );
}

export function IntroModal({ onStart, demo, state, viewer = null }: { onStart: () => void; demo: boolean; state?: GameState; viewer?: number | null }) {
  // Who "you" are: the viewer's company (custom name included), or Parallax Labs by default.
  const me = state && viewer !== null ? state.players[viewer] : null;
  const co = me ? companyById(me.companyId) : COMPANIES[0];
  const name = me?.name ?? co.name;
  const rivals = state ? state.players.filter((p) => p.id !== viewer) : [];
  const draft = state?.phase === 'setup';
  return (
    <Modal title={demo ? 'Quick Demo' : 'New game'} onClose={onStart} className="intro-modal">
      <div className="intro">
        <div className="intro-you" style={{ ['--co' as string]: co.color }}>
          <CompanyDot companyId={co.id} size={22} />
          <div>
            <span className="intro-you-label">You are</span>
            <strong className="intro-you-name">{name}</strong>
            <span className="small muted">
              {co.sector} · your pieces are <b className="intro-you-color">{profileOf(co.id).colorName}</b>
            </span>
          </div>
        </div>
        <p className="intro-lede">
          Compute is no longer just for giants. {['Two', 'Three', 'Four'][(state?.players.length ?? 4) - 2] ?? 'Four'} ambitious AI companies. One emerging market. Build your
          infrastructure, make your deals, and become the market leader.
        </p>
        {demo ? (
          <ol className="intro-steps">
            <li>
              You are <b style={{ color: co.color }}>{name}</b>, a frontier lab, a few moves from contention midway through the game.
            </li>
            <li>You've already rolled. Check your resources — you can build right now, or trade for the GPU you need for an AI Factory.</li>
            <li>When you end your turn, three AI rivals play through the real engine. Follow them in the Activity feed.</li>
          </ol>
        ) : (
          <ol className="intro-steps">
            <li>
              {draft
                ? 'Opening draft: each company places a Compute Cluster and a Network Connection, then again in reverse order.'
                : 'Each company starts with two Compute Clusters and two Network Connections.'}
            </li>
            <li>Roll, collect, trade and build. First to 10 Compute Points wins.</li>
            {state && (
              <li>
                {choiceOf(state.rules) === 'compute' ? (
                  <>
                    <b>Settlers of Compute</b> rules: Infrastructure Financing and Full-Stack Integration are on
                    {state?.rules?.gridStability ? ', and Grid Stability keeps disruptions rare (6 calm rolls after each; outages last 4).' : '.'}
                  </>
                ) : (
                  <>
                    <b>Classic</b> rules: no Financing, no Full-Stack Integration.
                  </>
                )}
              </li>
            )}
          </ol>
        )}
        {rivals.length > 0 && (
          <div className="intro-rivals">
            <span className="small muted">{rivals.length === 1 ? 'Your rival' : 'Your rivals'}</span>
            {rivals.map((p) => (
              <span key={p.id} className="intro-rival" style={{ ['--co' as string]: companyById(p.companyId).color }}>
                <CompanyDot companyId={p.companyId} size={10} />
                <span className="intro-rival-name">{p.name}</span>
                <span className="strategy-tag">{p.isAI ? profileOf(p.companyId).strategy : 'Human'}</span>
              </span>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn primary" onClick={onStart}>
            {demo ? 'Take my turn' : 'Play'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function PassScreen({ state, player, onReveal }: { state: GameState; player: number; onReveal: () => void }) {
  const p = state.players[player];
  const c = companyById(p.companyId);
  return (
    <div className="overlay pass" role="dialog" aria-modal="true" aria-label="Pass the device">
      <div className="pass-card" style={{ ['--co' as string]: c.color }}>
        <CompanyDot companyId={p.companyId} size={28} />
        <h1>Pass to {p.name}</h1>
        <p className="pass-color small">
          {c.sector} · plays the <b>{profileOf(c.id).colorName}</b> pieces
        </p>
        <p className="muted">Hands are hidden between players. Only {p.name} should look.</p>
        <button className="btn primary" onClick={onReveal} autoFocus>
          I'm {p.name} — show my hand
        </button>
      </div>
    </div>
  );
}

export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="About this prototype" onClose={onClose} wide>
      <div className="rules about">
        <p className="intro-lede">You don't have to be a hyperscaler to compete in AI anymore. That's the idea this game tries to make you feel.</p>
        <h3>Why compute?</h3>
        <p>
          Scaling laws turned compute into a basic input for building better AI. But capacity hasn't been spread evenly. Companies with the biggest balance sheets can commit years ahead to
          land, power and GPUs, while startups, often funded 18 months at a time, pay more, wait longer, or go without. The board here imagines a market where compute works
          more like a utility, so the scrappy companies get a real shot.
        </p>
        <p className="muted small">
          Framing inspired by the "Little Tech" argument in a16z's August 2026 post announcing its investment in Volta. The game is an abstraction: it does not model any real company's
          products, financing or operations, and you play a fictional startup — not Volta.
        </p>
        <h3>Why a Catan-style game?</h3>
        <p>
          Everyone already knows the loop: roll, collect, trade, build. Swap wood and brick for Power and Networking, and sheep and ore for Land and GPUs, and the rules tell the story by themselves.
          Scarcity is real, geography matters, deals are positive-sum, and there is still only one winner.
        </p>
        <h3>How it's built</h3>
        <ul>
          <li>React + TypeScript + SVG, fully static: no backend, accounts or paid APIs.</li>
          <li>A deterministic rules engine: seeded board, immutable state, 50+ automated tests.</li>
          <li>Three heuristic AI rivals with distinct strategies. They play by the same rules, explain their trade decisions, and use no LLM calls at runtime.</li>
          <li>The Quick Demo is a real midgame reached by the engine itself, not a scripted mock-up.</li>
          <li>Designed and built with Claude Code.</li>
        </ul>
        <p className="muted small">{PUBLIC_DISCLAIMER}</p>
      </div>
    </Modal>
  );
}
