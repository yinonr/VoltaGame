import {
  FINANCING_COMMITMENT,
  FINANCING_COST,
  FINANCING_MAX_OUTSTANDING,
  INTEGRATED_DEPLOYMENT_COST,
  RESOURCE_INFO,
  describeBundle,
  pips,
  rulesOf,
} from '../engine/constants';
import { checkRefinance, financedVertices, refinanceCost } from '../engine/financing';
import { fullStackProgress } from '../engine/fullstack';
import { gridStatus } from '../engine/grid';
import type { GameState } from '../engine/types';
import { ResourceIcon } from './icons';

// Panels for the Settlers of Compute strategic systems: Infrastructure Financing commitments
// (with Refinance, which must stay reachable even with an empty Innovation Card hand) and
// progress toward Full-Stack Integration. Both render nothing in Classic Mode.

/** Unblocked production pips around a corner: a financed factory repays from this output. */
export function sitePips(state: GameState, vertex: number): number {
  let n = 0;
  for (const t of state.board.vertices[vertex].tileIds) {
    const tile = state.board.tiles[t];
    if (tile.type !== 'barren' && t !== state.disruptionTile) n += pips(tile.number);
  }
  return n;
}

export function isStalled(state: GameState, vertex: number): boolean {
  return state.board.tiles[state.disruptionTile].type !== 'barren' && state.board.vertices[vertex].tileIds.includes(state.disruptionTile);
}

function hexSummary(state: GameState, vertex: number) {
  return state.board.vertices[vertex].tileIds
    .map((t) => state.board.tiles[t])
    .filter((t) => t.type !== 'barren' && t.number !== null)
    .map((t) => ({ id: t.id, type: t.type as Exclude<typeof t.type, 'barren'>, number: t.number! }));
}

export function FinancingPanel({ state, player, onRefinance }: { state: GameState; player: number; onRefinance: (vertex: number) => void }) {
  if (!rulesOf(state).financing) return null;
  const vertices = financedVertices(state, player);
  return (
    <section className="panel financing" aria-label="Infrastructure Financing">
      <header className="panel-head">
        <h2>Financing</h2>
        <span className={`muted small${vertices.length >= FINANCING_MAX_OUTSTANDING ? ' warn' : ''}`}>
          {vertices.length} / {FINANCING_MAX_OUTSTANDING} financed
        </span>
      </header>
      {vertices.length === 0 ? (
        <p className="muted small empty-note">
          No commitments. Finance an upgrade for {describeBundle(FINANCING_COST)}: the factory runs like a cluster until {FINANCING_COMMITMENT} units of its
          own output are repaid, then it is a full AI Factory.
        </p>
      ) : (
        <ul className="commitments">
          {vertices.map((v) => {
            const left = state.buildings[v]!.financed!;
            const check = checkRefinance(state, player, v);
            const stalled = isStalled(state, v);
            const cost = refinanceCost(state, v).capital;
            return (
              <li key={v} className={`commitment${stalled ? ' stalled' : ''}`}>
                <div className="commitment-head">
                  <strong>Financed AI Factory</strong>
                  <span className="commitment-left" title={`${left} committed unit${left === 1 ? '' : 's'} still to deliver`}>
                    {Array.from({ length: Math.max(left, FINANCING_COMMITMENT) }, (_, i) => (
                      <i key={i} className={i < left ? 'owed' : 'paid'} />
                    ))}
                    <b>{left} left</b>
                  </span>
                </div>
                <p className="small muted commitment-hexes">
                  Repays from{' '}
                  {hexSummary(state, v).map((t, i) => (
                    <span key={t.id} className={t.id === state.disruptionTile ? 'blocked' : ''}>
                      {i > 0 ? ' · ' : ''}
                      <ResourceIcon type={t.type} size={11} /> {RESOURCE_INFO[t.type].label} {t.number}
                    </span>
                  ))}
                </p>
                {stalled && (
                  <p className="small warn">
                    Stalled: a hex is under the outage, so deliveries there are blocked
                    {gridStatus(state).outageRolls > 0 ? ` (back online in ${gridStatus(state).outageRolls} roll${gridStatus(state).outageRolls === 1 ? '' : 's'})` : ''}.
                  </p>
                )}
                <button
                  className="btn small refinance-btn"
                  disabled={!check.ok}
                  onClick={() => onRefinance(v)}
                  title={check.ok ? `Pay ${cost} Capital now: +1 CP and double output immediately` : check.reason}
                >
                  Refinance · {cost} Capital
                </button>
                {!check.ok && <p className="small why">{check.reason}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function FullStackPanel({ state, player }: { state: GameState; player: number }) {
  if (!rulesOf(state).fullStack) return null;
  const progress = fullStackProgress(state, player);
  return (
    <section className={`panel fullstack${progress.unlocked ? ' unlocked' : ''}`} aria-label="Full-Stack Integration">
      <header className="panel-head">
        <h2>Full-Stack Integration</h2>
        <span className={progress.unlocked ? 'badge fullstack-badge' : 'muted small'}>{progress.unlocked ? 'Unlocked' : `${progress.done} / ${progress.total}`}</span>
      </header>
      {progress.milestones.length > 0 && (
        <ul className="milestones">
          {progress.milestones.map((m) => (
            <li key={m.id} className={m.done || progress.unlocked ? 'done' : ''}>
              <span className="tick" aria-hidden="true">
                {m.done || progress.unlocked ? '✓' : '○'}
              </span>
              <span className="milestone-label">{m.label}</span>
              <span className="small muted">{m.detail}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="small fullstack-reward">
        {progress.unlocked ? (
          <>Integrated Deployment is yours: build an AI Factory straight onto an open site for {describeBundle(INTEGRATED_DEPLOYMENT_COST)}.</>
        ) : (
          <>Reward: Integrated Deployment, an AI Factory straight onto an open network site, skipping the cluster stage.</>
        )}
      </p>
    </section>
  );
}

/**
 * Grid Stability at a glance: whether a natural 7 can disrupt right now, and how long the current
 * outage lasts. Two small chips, no dialogs. Renders nothing in Classic.
 */
export function GridStatusBar({ state, compact = false }: { state: GameState; compact?: boolean }) {
  const g = gridStatus(state);
  if (!g.enabled) return null;
  const rolls = (n: number) => `${n} roll${n === 1 ? '' : 's'}`;
  const outage = g.outageTile !== null && g.outageRolls > 0 ? state.board.tiles[g.outageTile] : null;
  return (
    <div className={`grid-status${compact ? ' compact' : ''}`} role="status" aria-live="polite">
      {g.vulnerable ? (
        <span className="grid-chip vulnerable" title="A natural 7 now triggers a Grid Disruption: discards, an outage and a theft.">
          <i aria-hidden="true" />
          Grid vulnerable
        </span>
      ) : (
        <span className="grid-chip stable" title={`A 7 in the next ${rolls(g.stableRolls)} causes no disruption.`}>
          <i aria-hidden="true" />
          Stabilizing · {rolls(g.stableRolls)}
        </span>
      )}
      {outage && outage.type !== 'barren' && (
        <span className="grid-chip outage" title={`The ${RESOURCE_INFO[outage.type].label} ${outage.number} hex is offline; it produces again after ${rolls(g.outageRolls)}.`}>
          <i aria-hidden="true" />
          Outage · {compact ? '' : `${RESOURCE_INFO[outage.type].label} ${outage.number} · `}
          {rolls(g.outageRolls)}
        </span>
      )}
    </div>
  );
}
