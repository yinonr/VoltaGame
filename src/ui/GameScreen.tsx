import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BuildType } from '../engine/constants';
import { DEV_CARD_INFO, HAND_LIMIT, RESOURCE_INFO, companyById, describeBundle, sumBundle } from '../engine/constants';
import { disruptionVictims, getActingPlayer } from '../engine/game';
import {
  checkBuild,
  checkPlayCard,
  checkTradePhase,
  legalClusterVertices,
  legalFactoryVertices,
  legalRoadEdges,
  legalSetupClusterVertices,
  legalSetupRoadEdges,
} from '../engine/rules';
import type { DevCardType, GameState } from '../engine/types';
import type { BoardTarget, Ghost } from './Board';
import { Board } from './Board';
import {
  ConsolidationModal,
  DiscardModal,
  GrantModal,
  IncomingOfferModal,
  IntroModal,
  PassScreen,
  RulesModal,
  TradeModal,
  VictimModal,
  WinnerModal,
} from './modals';
import { BuildPanel, CardsPanel, CompanyDot, DiceDisplay, EventLog, FlashCount, HandPanel, Scoreboard } from './panels';
import { BottomSheet, COMPACT_QUERY, useMediaQuery, ZOOM_LEVELS, ZoomableBoard } from './mobile';
import { ResourceIcon } from './icons';
import { scoreBreakdown } from '../engine/scoring';
import { RESOURCES } from '../engine/types';
import { SHOW_QUICK_DEMO } from './flags';
import type { GameController } from './useGame';

interface Props {
  ctl: GameController;
  intro: 'demo' | 'new' | null;
  onDismissIntro: () => void;
  onExit: () => void;
  onNewGame: () => void;
  onDemo: () => void;
}

const EMPTY = new Set<number>();

/** Placement modes: a build from the menu, or a card that places a piece. */
type Mode = BuildType | 'integration';

function instruction(state: GameState, viewer: number | null, mode: Mode | null): string {
  if (state.phase === 'gameOver') return `${state.players[state.winner!].name} is the market leader.`;
  const acting = getActingPlayer(state);
  if (acting === null) return '';
  const actor = state.players[acting];
  if (state.pendingTrade) {
    const from = state.players[state.pendingTrade.from];
    if (acting === viewer) return `${from.name} sent you an offer.`;
    if (state.pendingTrade.from === viewer) return `Waiting for ${actor.name} to answer your offer…`;
    return `${actor.name} is considering an offer from ${from.name}…`;
  }
  if (acting !== viewer) {
    if (state.phase === 'discard') return `${actor.name} is discarding after the Grid Disruption…`;
    if (state.phase === 'moveDisruption') return `${actor.name} is choosing where the outage hits…`;
    return `${actor.name} is taking its turn…`;
  }
  switch (state.phase) {
    case 'setup':
      return state.setup?.expecting === 'cluster' ? 'Opening draft: place a Compute Cluster on a glowing corner.' : 'Now place a Network Connection next to it.';
    case 'preRoll':
      return 'Roll the dice to start your turn.';
    case 'discard':
      return `Grid Disruption: discard ${state.pendingDiscards[acting]} resources.`;
    case 'moveDisruption':
      return 'Grid Disruption: click a hex to knock it offline.';
    case 'freeRoads':
      return `Network Expansion: place ${state.freeRoadsLeft} free connection${state.freeRoadsLeft === 1 ? '' : 's'}.`;
    case 'main':
      if (mode === 'road') return 'Click a glowing edge to build a Network Connection.';
      if (mode === 'cluster') return 'Click a glowing corner to build a Compute Cluster.';
      if (mode === 'factory') return 'Click one of your clusters to upgrade it to an AI Factory.';
      if (mode === 'integration') return 'Full-Stack Integration: click an open site on your network to deploy an AI Factory.';
      return 'Trade and build, then end your turn.';
    default:
      return '';
  }
}

export function GameScreen({ ctl, intro, onDismissIntro, onExit, onNewGame, onDemo }: Props) {
  const state = ctl.state!;
  const { dispatch, toasts, speed, setSpeed, pushToast } = ctl;
  const [mode, setMode] = useState<Mode | null>(null);
  const [victimChoice, setVictimChoice] = useState<{ tile: number; victims: number[] } | null>(null);
  const [cardModal, setCardModal] = useState<'grant' | 'consolidation' | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [winnerDismissed, setWinnerDismissed] = useState(false);
  const [revealedFor, setRevealedFor] = useState<number | null>(null);
  const compact = useMediaQuery(COMPACT_QUERY);
  const landscape = useMediaQuery('(orientation: landscape)');
  const [pending, setPending] = useState<BoardTarget | null>(null);
  const [sheet, setSheet] = useState<null | 'build' | 'cards' | 'log' | 'market' | 'menu'>(null);
  const [zoom, setZoom] = useState(1);

  const humans = state.players.filter((p) => !p.isAI).map((p) => p.id);
  const multiHuman = humans.length > 1;
  const acting = getActingPlayer(state);
  const actingHuman = acting !== null && !state.players[acting].isAI ? acting : null;
  const needsPass = multiHuman && actingHuman !== null && revealedFor !== actingHuman;
  const viewer: number | null = multiHuman ? (needsPass ? null : actingHuman) : (humans[0] ?? null);
  const myAction = viewer !== null && actingHuman === viewer;

  // Reset transient UI state when it no longer applies.
  useEffect(() => {
    if (!mode || mode === 'card') return;
    const ok = viewer !== null && (mode === 'integration' ? checkPlayCard(state, viewer, 'integration').ok : checkBuild(state, viewer, mode).ok);
    if (!ok) setMode(null);
  }, [state, mode, viewer]);
  useEffect(() => {
    if (state.phase !== 'gameOver') setWinnerDismissed(false);
  }, [state.phase]);
  const awaitingMyOffer = viewer !== null && state.pendingTrade?.from === viewer;
  useEffect(() => {
    if (!myAction && !awaitingMyOffer) setTradeOpen(false);
  }, [myAction, awaitingMyOffer]);

  const highlights = useMemo(() => {
    const out = { v: EMPTY, e: EMPTY, t: EMPTY, ghost: null as Ghost };
    if (!myAction || viewer === null || state.pendingTrade) return out;
    if (state.phase === 'setup' && state.setup) {
      if (state.setup.expecting === 'cluster') return { ...out, v: new Set(legalSetupClusterVertices(state)), ghost: 'cluster' as Ghost };
      return { ...out, e: new Set(legalSetupRoadEdges(state, state.setup.lastVertex!)), ghost: 'road' as Ghost };
    }
    if (state.phase === 'moveDisruption') {
      return { ...out, t: new Set(state.board.tiles.filter((t) => t.id !== state.disruptionTile).map((t) => t.id)) };
    }
    if (state.phase === 'freeRoads') return { ...out, e: new Set(legalRoadEdges(state, viewer)), ghost: 'road' as Ghost };
    if (state.phase === 'main' && mode) {
      if (mode === 'road') return { ...out, e: new Set(legalRoadEdges(state, viewer)), ghost: 'road' as Ghost };
      if (mode === 'cluster') return { ...out, v: new Set(legalClusterVertices(state, viewer)), ghost: 'cluster' as Ghost };
      if (mode === 'factory') return { ...out, v: new Set(legalFactoryVertices(state, viewer)), ghost: 'factory' as Ghost };
      if (mode === 'integration') return { ...out, v: new Set(legalClusterVertices(state, viewer)), ghost: 'factory' as Ghost };
    }
    return out;
  }, [state, myAction, viewer, mode]);

  const doVertex = (v: number) => {
    if (state.phase === 'setup') dispatch({ type: 'SETUP_CLUSTER', vertex: v });
    else if (mode === 'cluster') dispatch({ type: 'BUILD_CLUSTER', vertex: v }) && setMode(null);
    else if (mode === 'factory') dispatch({ type: 'BUILD_FACTORY', vertex: v }) && setMode(null);
    else if (mode === 'integration') dispatch({ type: 'PLAY_INTEGRATION', vertex: v }) && setMode(null);
  };
  const doEdge = (e: number) => {
    if (state.phase === 'setup') dispatch({ type: 'SETUP_ROAD', edge: e });
    else if (state.phase === 'freeRoads' || mode === 'road') dispatch({ type: 'BUILD_ROAD', edge: e });
  };
  const doTile = (t: number) => {
    if (acting === null) return;
    const victims = disruptionVictims(state, t, acting);
    if (victims.length <= 1) dispatch({ type: 'MOVE_DISRUPTION', tile: t, victim: victims[0] ?? null });
    else setVictimChoice({ tile: t, victims });
  };
  // On touch screens a tap only selects a spot; the player confirms it, so a mis-tap never builds.
  const onVertex = (v: number) => (compact ? setPending({ kind: 'vertex', id: v }) : doVertex(v));
  const onEdge = (e: number) => (compact ? setPending({ kind: 'edge', id: e }) : doEdge(e));
  const onTile = (t: number) => (compact ? setPending({ kind: 'tile', id: t }) : doTile(t));
  const confirmPending = () => {
    if (!pending) return;
    setPending(null);
    if (pending.kind === 'vertex') doVertex(pending.id);
    else if (pending.kind === 'edge') doEdge(pending.id);
    else doTile(pending.id);
  };
  useEffect(() => setPending(null), [state, mode]);
  const pendingLabel = (() => {
    if (!pending) return '';
    if (pending.kind === 'tile') {
      const t = state.board.tiles[pending.id];
      const victims = acting !== null ? disruptionVictims(state, pending.id, acting) : [];
      const what = t.type === 'barren' ? 'the Dead Zone' : `${RESOURCE_INFO[t.type].label} ${t.number}`;
      return `Knock out ${what}?${victims.length ? ` Rivals here: ${victims.map((v) => companyById(state.players[v].companyId).short).join(', ')}.` : ''}`;
    }
    if (pending.kind === 'edge') return state.phase === 'freeRoads' ? 'Place a free connection here?' : state.phase === 'setup' ? 'Place your connection here?' : 'Build a Network Connection here?';
    if (state.phase === 'setup') return 'Place your opening cluster here?';
    if (mode === 'integration') return 'Deploy an AI Factory here with Full-Stack Integration?';
    return mode === 'factory' ? 'Upgrade this cluster to an AI Factory?' : 'Build a Compute Cluster here?';
  })();

  const onSelectBuild = (t: BuildType) => {
    if (viewer === null) return;
    if (t === 'card') {
      const before = state.players[viewer].devCards.length;
      if (dispatch({ type: 'BUY_CARD' })) {
        // Reveal the drawn card to its owner only.
        const drawn = ctl.getState()?.players[viewer].devCards[before];
        if (drawn) pushToast(`You drew ${DEV_CARD_INFO[drawn.type].title}.`, 'success');
      }
      return;
    }
    setMode((m) => (m === t ? null : t));
  };

  const onPlayCard = (t: Exclude<DevCardType, 'breakthrough'>) => {
    setMode(null);
    if (t === 'priority') dispatch({ type: 'PLAY_PRIORITY' });
    else if (t === 'expansion') dispatch({ type: 'PLAY_EXPANSION' });
    else if (t === 'integration') setMode('integration');
    else setCardModal(t);
  };

  const roll = useCallback(() => dispatch({ type: 'ROLL' }), [dispatch]);
  const endTurn = useCallback(() => {
    setMode(null);
    dispatch({ type: 'END_TURN' });
  }, [dispatch]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('.overlay')) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') setMode(null);
      if (!myAction) return;
      if (k === 'r' && state.phase === 'preRoll') roll();
      if (k === 'e' && state.phase === 'main' && !state.pendingTrade) endTurn();
      if (k === 't' && checkTradePhase(state, viewer!).ok) setTradeOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [myAction, state, roll, endTurn, viewer]);

  const viewerPlayer = viewer !== null ? state.players[viewer] : null;
  const viewerCompany = viewerPlayer ? companyById(viewerPlayer.companyId) : null;
  const actingName = acting !== null ? state.players[acting].name : '';
  const round = Math.max(1, Math.ceil(state.turn / state.players.length));
  const myGains = viewer !== null && state.lastProduction ? state.lastProduction.gains[viewer] : null;
  const priorityCheck = viewer !== null ? checkPlayCard(state, viewer, 'priority') : null;

  const rollNote =
    state.lastRoll?.total === 7
      ? 'Grid Disruption — no production.'
      : state.lastProduction && viewer !== null
        ? myGains && sumBundle(myGains) > 0
          ? `You collected ${describeBundle(myGains)}.`
          : state.lastProduction.blockedTileId !== null && state.board.tiles[state.lastProduction.blockedTileId].vertexIds.some((v) => state.buildings[v]?.owner === viewer)
            ? 'Your hex is under the outage — nothing this roll.'
            : 'Nothing for you this roll.'
        : state.phase === 'preRoll'
          ? 'Waiting for the roll.'
          : '\u00a0';
  const tradeCheck = viewer !== null ? checkTradePhase(state, viewer) : { ok: false };

  const boardEl = (
    <Board
      state={state}
      highlightVertices={highlights.v}
      highlightEdges={highlights.e}
      highlightTiles={highlights.t}
      ghost={highlights.ghost}
      ghostColor={viewerCompany?.color ?? '#fff'}
      onVertex={onVertex}
      onEdge={onEdge}
      onTile={onTile}
      tileMode={state.phase === 'moveDisruption' ? 'disrupt' : null}
      touch={compact}
      selected={pending}
    />
  );

  const modalsEl = (
    <>
      {needsPass && actingHuman !== null && <PassScreen state={state} player={actingHuman} onReveal={() => setRevealedFor(actingHuman)} />}
      {!needsPass && myAction && state.pendingTrade && state.pendingTrade.to === viewer && <IncomingOfferModal state={state} dispatch={dispatch} />}
      {!needsPass && myAction && state.phase === 'discard' && viewer !== null && state.pendingDiscards[viewer] > 0 && (
        <DiscardModal key={`discard-${state.turn}-${viewer}`} state={state} player={viewer} dispatch={dispatch} />
      )}
      {victimChoice && (
        <VictimModal
          state={state}
          victims={victimChoice.victims}
          onCancel={() => setVictimChoice(null)}
          onPick={(v) => {
            dispatch({ type: 'MOVE_DISRUPTION', tile: victimChoice.tile, victim: v });
            setVictimChoice(null);
          }}
        />
      )}
      {cardModal === 'grant' && (
        <GrantModal
          state={state}
          onCancel={() => setCardModal(null)}
          onConfirm={(r) => {
            dispatch({ type: 'PLAY_GRANT', resources: r });
            setCardModal(null);
          }}
        />
      )}
      {cardModal === 'consolidation' && (
        <ConsolidationModal
          onCancel={() => setCardModal(null)}
          onConfirm={(r) => {
            dispatch({ type: 'PLAY_CONSOLIDATION', resource: r });
            setCardModal(null);
          }}
        />
      )}
      {tradeOpen && viewer !== null && <TradeModal state={state} player={viewer} dispatch={dispatch} onClose={() => setTradeOpen(false)} />}
      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      {intro && <IntroModal demo={intro === 'demo'} onStart={onDismissIntro} />}
      {state.phase === 'gameOver' && !winnerDismissed && (
        <WinnerModal state={state} viewer={humans.length === 1 ? humans[0] : viewer} onNewGame={onNewGame} onDemo={onDemo} onTitle={onExit} onClose={() => setWinnerDismissed(true)} />
      )}
      <div className="toasts" aria-live="assertive">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  );

  const speedLabel = speed === 'normal' ? 'Normal' : speed === 'fast' ? 'Fast' : 'Turbo';
  const cycleSpeed = () => setSpeed(speed === 'normal' ? 'fast' : speed === 'fast' ? 'turbo' : 'normal');

  if (compact) {
    const zi = ZOOM_LEVELS.indexOf(zoom);
    const cardCount = viewerPlayer?.devCards.length ?? 0;
    const sheetTitle = { build: 'Build', cards: 'Innovation Cards', log: 'Activity', market: 'Market', menu: 'Menu' } as const;
    return (
      <div className={`m-game${landscape ? ' landscape' : ''}`}>
        <header className="m-top">
          <div className="m-players">
            {state.players.map((p) => {
              const c = companyById(p.companyId);
              const sb = scoreBreakdown(state, p.id);
              const cp = viewer === p.id || state.phase === 'gameOver' ? sb.total : sb.publicTotal;
              const isTurn = state.currentPlayer === p.id && state.phase !== 'gameOver';
              return (
                <button
                  key={p.id}
                  className={`m-chip${isTurn ? ' active' : ''}${viewer === p.id ? ' me' : ''}`}
                  style={{ ['--co' as string]: c.color }}
                  onClick={() => setSheet('market')}
                  aria-label={`${p.name}: ${cp} Compute Points${isTurn ? ', taking a turn' : ''}`}
                >
                  <span className="m-chip-name">
                    <CompanyDot companyId={p.companyId} size={8} /> {viewer === p.id ? 'You' : c.short}
                  </span>
                  <b>{cp}</b>
                </button>
              );
            })}
          </div>
          <button className="icon-btn m-menu-btn" onClick={() => setSheet('menu')} aria-label="Open menu">
            ☰
          </button>
        </header>

        <div className={`m-banner${myAction ? ' mine' : ''}${state.phase === 'moveDisruption' || state.phase === 'discard' ? ' alert' : ''}`} role="status">
          <span>{instruction(state, viewer, mode).replace('Click', 'Tap').replace('click', 'tap')}</span>
          {mode && myAction && state.phase === 'main' && (
            <button className="btn small" onClick={() => setMode(null)}>
              Cancel
            </button>
          )}
        </div>

        <div className="m-board">
          <ZoomableBoard zoom={zoom}>{boardEl}</ZoomableBoard>
          <div className="m-zoom">
            <button className="icon-btn" onClick={() => setZoom(ZOOM_LEVELS[Math.max(0, zi - 1)])} disabled={zi <= 0} aria-label="Zoom out">
              −
            </button>
            <button className="icon-btn" onClick={() => setZoom(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, zi + 1)])} disabled={zi >= ZOOM_LEVELS.length - 1} aria-label="Zoom in">
              +
            </button>
          </div>
          {pending && (
            <div className="m-confirm" role="group" aria-label="Confirm your choice">
              <span>{pendingLabel}</span>
              <div>
                <button className="btn small" onClick={() => setPending(null)}>
                  Cancel
                </button>
                <button className="btn primary small" onClick={confirmPending}>
                  Confirm
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="m-dock">
          <DiceDisplay state={state} />
          <p className="m-roll-note small">{myAction || state.phase === 'gameOver' ? rollNote : `Watching ${actingName}…`}</p>
          <div className="m-dock-actions">
            {myAction && state.phase === 'preRoll' && (
              <>
                {priorityCheck?.ok && (
                  <button className="btn small" onClick={() => onPlayCard('priority')}>
                    Priority
                  </button>
                )}
                <button className="btn primary" onClick={roll}>
                  Roll dice
                </button>
              </>
            )}
            {myAction && state.phase === 'main' && !state.pendingTrade && (
              <button className="btn primary" onClick={endTurn}>
                End turn
              </button>
            )}
            {!myAction && state.phase !== 'gameOver' && <span className="spinner" aria-label="Waiting" />}
            {state.phase === 'gameOver' && (
              <button className="btn primary" onClick={() => setWinnerDismissed(false)}>
                Results
              </button>
            )}
          </div>
        </div>

        {viewerPlayer && (
          <div className="m-hand" aria-label="Your resources">
            {RESOURCES.map((r) => (
              <div key={r} className={`m-res${viewerPlayer.resources[r] === 0 ? ' empty' : ''}`} style={{ ['--res' as string]: RESOURCE_INFO[r].color }} title={RESOURCE_INFO[r].label}>
                <ResourceIcon type={r} size={18} />
                <FlashCount value={viewerPlayer.resources[r]} />
                <span>{RESOURCE_INFO[r].label}</span>
              </div>
            ))}
          </div>
        )}

        <nav className="m-tabs" aria-label="Game panels">
          <button className={sheet === 'build' || mode ? 'on' : ''} onClick={() => setSheet('build')} disabled={viewer === null}>
            <span aria-hidden="true">▣</span>Build
          </button>
          <button onClick={() => setTradeOpen(true)} disabled={!tradeCheck.ok}>
            <span aria-hidden="true">⇄</span>Trade
          </button>
          <button onClick={() => setSheet('cards')} disabled={viewer === null}>
            <span aria-hidden="true">◈</span>Cards{cardCount > 0 && <i className="m-badge">{cardCount}</i>}
          </button>
          <button onClick={() => setSheet('log')}>
            <span aria-hidden="true">≡</span>Activity
          </button>
          <button onClick={() => setSheet('market')}>
            <span aria-hidden="true">♜</span>Market
          </button>
        </nav>

        {sheet && (
          <BottomSheet title={sheetTitle[sheet]} onClose={() => setSheet(null)}>
            {sheet === 'build' && viewer !== null && (
              <BuildPanel
                state={state}
                player={viewer}
                mode={mode === 'integration' ? null : mode}
                onSelect={(t) => {
                  onSelectBuild(t);
                  if (t !== 'card') setSheet(null);
                }}
              />
            )}
            {sheet === 'cards' && viewer !== null && (
              <CardsPanel
                state={state}
                player={viewer}
                onPlay={(t) => {
                  setSheet(null);
                  onPlayCard(t);
                }}
              />
            )}
            {sheet === 'log' && <EventLog state={state} />}
            {sheet === 'market' && <Scoreboard state={state} viewer={viewer} />}
            {sheet === 'menu' && (
              <div className="m-menu">
                <p className="muted small">
                  {state.scenario ? `${state.scenario} · ` : ''}
                  {state.phase === 'setup' ? 'Opening draft' : `Round ${round} · Turn ${state.turn}`}
                </p>
                <button className="btn" onClick={cycleSpeed}>
                  AI speed: {speedLabel}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setSheet(null);
                    setRulesOpen(true);
                  }}
                >
                  How to play
                </button>
{SHOW_QUICK_DEMO && (
                <button className="btn" onClick={onDemo}>
                  Restart Quick Demo
                </button>
)}
                <button className="btn" onClick={onNewGame}>
                  New game vs 3 AI
                </button>
                <button className="btn" onClick={onExit}>
                  Title screen
                </button>
                <p className="disclaimer">Unofficial, Catan-inspired creative prototype. Not affiliated with or endorsed by Volta or Catan rights holders.</p>
              </div>
            )}
          </BottomSheet>
        )}
        {modalsEl}
      </div>
    );
  }

  return (
    <div className="game">
      <header className="topbar">
        <div className="brand" onClick={onExit} role="button" tabIndex={0} title="Back to title">
          <span className="brand-mark">◆</span>
          <span>
            SETTLERS <em>of</em> COMPUTE
          </span>
        </div>
        <div className="topbar-mid">
          {state.scenario && <span className="chip scenario">{state.scenario}</span>}
          <span className="chip">{state.phase === 'setup' ? 'Opening draft' : `Round ${round} · Turn ${state.turn}`}</span>
          {acting !== null && (
            <span className="chip turn-chip">
              <CompanyDot companyId={state.players[state.currentPlayer].companyId} />
              {state.players[state.currentPlayer].name}
            </span>
          )}
        </div>
        <div className="topbar-right">
          <button className={`btn ghost small${speed !== 'normal' ? ' on' : ''}`} onClick={cycleSpeed} title="Speed of computer turns (Normal → Fast → Turbo)">
            AI speed: {speedLabel}
          </button>
          <button className="btn ghost small" onClick={() => setRulesOpen(true)}>
            How to play
          </button>
          <button className="btn ghost small" onClick={onNewGame}>
            New game
          </button>
          <button className="btn ghost small" onClick={onExit}>
            Menu
          </button>
        </div>
      </header>

      <aside className="col left">
        <Scoreboard state={state} viewer={viewer} />
        <EventLog state={state} />
      </aside>

      <main className="col center">
        <div className={`banner${myAction ? ' mine' : ''}${state.phase === 'moveDisruption' || state.phase === 'discard' ? ' alert' : ''}`} role="status">
          {instruction(state, viewer, mode)}
        </div>
        {boardEl}
        <p className="disclaimer-inline">Unofficial, Catan-inspired creative prototype. Not affiliated with or endorsed by Volta or Catan rights holders.</p>
      </main>

      <aside className="col right">
        <section className="panel turn" aria-label="Turn">
          <header className="panel-head">
            <h2>{myAction ? 'Your move' : state.phase === 'gameOver' ? 'Game over' : actingName ? `${actingName}` : 'Turn'}</h2>
            {!myAction && state.phase !== 'gameOver' && <span className="spinner" aria-hidden="true" />}
          </header>
          <DiceDisplay state={state} />
          <p className="roll-note small">{rollNote}</p>
          {state.lastProduction?.shortages.length ? (
            <p className="small warn">Shortage: {state.lastProduction.shortages.map((r) => RESOURCE_INFO[r].label).join(', ')} ran out at the market.</p>
          ) : null}
          <div className="turn-actions">
            {myAction && state.phase === 'preRoll' && (
              <>
                <button className="btn primary big" onClick={roll}>
                  Roll dice <kbd>R</kbd>
                </button>
                {priorityCheck?.ok && (
                  <button className="btn small" onClick={() => onPlayCard('priority')} title="Move the outage before rolling">
                    Play Priority first
                  </button>
                )}
              </>
            )}
            {myAction && state.phase === 'main' && !state.pendingTrade && (
              <>
                <button className="btn" onClick={() => setTradeOpen(true)} disabled={!tradeCheck.ok}>
                  Trade <kbd>T</kbd>
                </button>
                <button className="btn primary big" onClick={endTurn}>
                  End turn <kbd>E</kbd>
                </button>
              </>
            )}
            {!myAction && state.phase !== 'gameOver' && <p className="muted small">Watching {actingName}. Moves appear on the board and in Activity.</p>}
            {state.phase === 'gameOver' && (
              <button className="btn primary" onClick={() => setWinnerDismissed(false)}>
                Show results
              </button>
            )}
          </div>
        </section>
        {viewer !== null ? (
          <>
            <HandPanel state={state} player={viewer} />
            <BuildPanel state={state} player={viewer} mode={mode === 'integration' ? null : mode} onSelect={onSelectBuild} />
            <CardsPanel state={state} player={viewer} onPlay={onPlayCard} />
          </>
        ) : (
          <section className="panel">
            <p className="muted small empty-note">
              {humans.length === 0 ? 'Spectating: four AI companies are playing each other.' : 'Hands are hidden until the next human player takes the device.'}
            </p>
          </section>
        )}
      </aside>

      {modalsEl}
      {viewerPlayer && sumBundle(viewerPlayer.resources) > HAND_LIMIT && state.phase === 'main' && myAction && (
        <div className="limit-hint small">Holding {sumBundle(viewerPlayer.resources)} resources — a 7 would cost you half.</div>
      )}
    </div>
  );
}
