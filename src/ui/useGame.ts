import { useCallback, useEffect, useRef, useState } from 'react';
import { decideAIAction } from '../engine/ai';
import { applyAction, disruptionVictims, GameError, getActingPlayer } from '../engine/game';
import { legalRoadEdges } from '../engine/rules';
import type { Action, GameState } from '../engine/types';
import { RESOURCES } from '../engine/types';
import { RESOURCE_INFO } from '../engine/constants';
import { withCleanNames } from './companies';

const SAVE_KEY = 'settlers-of-compute:save:v1';

export type Speed = 'normal' | 'fast' | 'turbo';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

export function loadSavedGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (s.version !== 1 || !s.board || !Array.isArray(s.players) || s.phase === 'gameOver') return null;
    // Names are display-only; re-clean them so an edited save cannot break the layout.
    return withCleanNames(s);
  } catch {
    return null;
  }
}

function saveGame(s: GameState | null): void {
  try {
    if (!s || s.phase === 'gameOver') localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — saving is a convenience only */
  }
}

/** A safe legal action used only if the AI heuristic ever proposes an illegal move. */
function fallbackAction(s: GameState, actor: number): Action {
  if (s.pendingTrade) return { type: 'RESPOND_TRADE', accept: false };
  switch (s.phase) {
    case 'preRoll':
      return { type: 'ROLL' };
    case 'moveDisruption': {
      const tile = s.board.tiles.find((t) => t.id !== s.disruptionTile)!.id;
      const victims = disruptionVictims(s, tile, actor);
      return { type: 'MOVE_DISRUPTION', tile, victim: victims[0] ?? null };
    }
    case 'freeRoads':
      return { type: 'BUILD_ROAD', edge: legalRoadEdges(s, actor)[0] };
    default:
      return { type: 'END_TURN' };
  }
}

const DELAYS: Partial<Record<Action['type'], number>> = {
  ROLL: 700,
  END_TURN: 550,
  RESPOND_TRADE: 900,
  PROPOSE_TRADE: 800,
  DISCARD: 450,
  MOVE_DISRUPTION: 850,
  BANK_TRADE: 600,
  SETUP_CLUSTER: 450,
  SETUP_ROAD: 350,
};

export function useGame() {
  const [state, setStateRaw] = useState<GameState | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [paused, setPaused] = useState(false);
  const toastId = useRef(1);

  const pushToast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = toastId.current++;
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 3200 : 4200);
  }, []);

  const setState = useCallback((s: GameState | null) => {
    stateRef.current = s;
    setStateRaw(s);
    saveGame(s);
  }, []);

  const dispatch = useCallback(
    (action: Action): boolean => {
      const cur = stateRef.current;
      if (!cur) return false;
      try {
        setState(applyAction(cur, action));
        return true;
      } catch (e) {
        pushToast(e instanceof Error ? e.message : String(e), 'error');
        return false;
      }
    },
    [pushToast, setState],
  );

  // Computer-controlled companies act one step at a time, with pacing so humans can follow.
  useEffect(() => {
    if (!state || paused) return;
    const actor = getActingPlayer(state);
    if (actor === null || !state.players[actor].isAI) return;
    let action: Action;
    try {
      action = decideAIAction(state, actor);
    } catch (e) {
      console.error('AI decision failed', e);
      action = fallbackAction(state, actor);
    }
    const base = DELAYS[action.type] ?? 620;
    const delay = speed === 'turbo' ? 25 : speed === 'fast' ? Math.round(base * 0.3) : base;
    const timer = window.setTimeout(() => {
      const cur = stateRef.current;
      if (cur !== state) return; // state changed underneath us; effect will re-run
      let next: GameState;
      try {
        next = applyAction(cur, action);
      } catch (e) {
        if (!(e instanceof GameError)) console.error(e);
        console.warn('AI proposed an illegal action; using fallback', action, e);
        try {
          next = applyAction(cur, fallbackAction(cur, actor));
        } catch (e2) {
          console.error('Fallback failed', e2);
          setPaused(true);
          pushToast('The AI got stuck — game paused. Please report this seed.', 'error');
          return;
        }
      }
      // With several humans at one device, "you" is ambiguous: name the company instead.
      const multiHuman = cur.players.filter((p) => !p.isAI).length > 1;
      const name = cur.players[actor].name;
      if (action.type === 'MOVE_DISRUPTION' && action.victim !== null && !cur.players[action.victim].isAI) {
        const lost = RESOURCES.find((r) => next.players[action.victim!].resources[r] < cur.players[action.victim!].resources[r]);
        const from = multiHuman ? cur.players[action.victim].name : 'you';
        if (lost) pushToast(`${name} took 1 ${RESOURCE_INFO[lost].label} from ${from}.`, 'error');
      }
      if (action.type === 'PLAY_CONSOLIDATION') {
        for (const p of cur.players) {
          const n = p.resources[action.resource];
          const who = multiHuman ? `${p.name} handed` : 'you handed';
          if (!p.isAI && p.id !== actor && n > 0) pushToast(`${name} consolidated ${RESOURCE_INFO[action.resource].label}: ${who} over ${n}.`, 'error');
        }
      }
      if (action.type === 'RESPOND_TRADE' && cur.pendingTrade && !cur.players[cur.pendingTrade.from].isAI) {
        const whose = multiHuman ? ` ${cur.players[cur.pendingTrade.from].name}'s offer` : '';
        pushToast(`${name} ${action.accept ? 'accepted' : 'declined'}${whose}${action.reason ? ` — ${action.reason}` : '.'}`, action.accept ? 'success' : 'info');
      }
      setState(next);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [state, paused, speed, pushToast, setState]);

  const getState = useCallback(() => stateRef.current, []);

  return { state, getState, setState, dispatch, toasts, pushToast, speed, setSpeed, paused, setPaused };
}

export type GameController = ReturnType<typeof useGame>;
