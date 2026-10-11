import { describe, expect, it } from 'vitest';
import { decideAIAction } from '../ai';
import { bundle, INTEGRATION_COST } from '../constants';
import { applyAction, createGame, GameError, getActingPlayer } from '../game';
import { checkPlayCard, legalClusterVertices, piecesLeft } from '../rules';
import { victoryPoints } from '../scoring';
import type { GameState } from '../types';
import { ALL_AI, blankGame, conservation, place, road, setHand } from './helpers';

function giveIntegration(s: GameState, player: number, boughtOnTurn = 0): GameState {
  return {
    ...s,
    players: s.players.map((p) => (p.id === player ? { ...p, devCards: [...p.devCards, { id: 990 + p.devCards.length, type: 'integration', boughtOnTurn }] } : p)),
  };
}

/** Player 0: a cluster with a two-connection corridor ending at an open site. */
function withSite(seed = 42) {
  let s = blankGame(seed);
  const start = s.board.vertices.find((v) => v.neighborIds.length === 3)!;
  const e1 = start.edgeIds[0];
  const mid = s.board.edges[e1].a === start.id ? s.board.edges[e1].b : s.board.edges[e1].a;
  const e2 = s.board.vertices[mid].edgeIds.find((e) => e !== e1)!;
  const far = s.board.edges[e2].a === mid ? s.board.edges[e2].b : s.board.edges[e2].a;
  s = place(s, start.id, 0);
  s = road(road(s, e1, 0), e2, 0);
  return { s, site: far };
}

describe('Volta special cards — deck', () => {
  it('leaves the default deck (and therefore the Quick Demo) unchanged', () => {
    const s = createGame({ seed: 7 });
    expect(s.devDeck).toHaveLength(25);
    expect(s.devDeck).not.toContain('integration');
  });

  it('adds two Full-Stack Integration cards when Volta cards are enabled', () => {
    const s = createGame({ seed: 7, voltaCards: true });
    expect(s.devDeck).toHaveLength(27);
    expect(s.devDeck.filter((c) => c === 'integration')).toHaveLength(2);
    expect(s.voltaCards).toBe(true);
  });
});

describe('Full-Stack Integration', () => {
  it('deploys an AI Factory directly on an open network site for 1 Land + 3 Capital + 2 GPUs (+2 CP)', () => {
    let { s, site } = withSite();
    s = giveIntegration(setHand(s, 0, { land: 1, capital: 3, gpu: 2, power: 1 }), 0);
    const cp = victoryPoints(s, 0);
    const factoriesLeft = piecesLeft(s, 0).factory;
    expect(checkPlayCard(s, 0, 'integration').ok).toBe(true);
    const after = applyAction(s, { type: 'PLAY_INTEGRATION', vertex: site });
    expect(after.buildings[site]).toEqual({ owner: 0, kind: 'factory' });
    expect(victoryPoints(after, 0)).toBe(cp + 2);
    expect(after.players[0].resources).toEqual(bundle({ power: 1 }));
    expect(after.players[0].devCards).toHaveLength(0);
    expect(after.devCardPlayedThisTurn).toBe(true);
    expect(piecesLeft(after, 0).factory).toBe(factoriesLeft - 1);
    expect(piecesLeft(after, 0).cluster).toBe(piecesLeft(s, 0).cluster); // no cluster piece used
    expect(conservation(after)).toEqual(conservation(s));
  });

  it('follows the normal placement rules', () => {
    let { s } = withSite();
    s = giveIntegration(setHand(s, 0, INTEGRATION_COST), 0);
    const illegal = s.board.vertices.find((v) => !legalClusterVertices(s, 0).includes(v.id))!.id;
    expect(() => applyAction(s, { type: 'PLAY_INTEGRATION', vertex: illegal })).toThrow(GameError);
  });

  it('respects card timing, cost and piece limits', () => {
    let { s, site } = withSite();
    // Bought this turn → not yet playable.
    let t = giveIntegration(setHand(s, 0, INTEGRATION_COST), 0, s.turn);
    expect(checkPlayCard(t, 0, 'integration').reason).toMatch(/next turn/);
    // Missing a GPU → explains what's missing.
    t = giveIntegration(setHand(s, 0, { land: 1, capital: 3, gpu: 1 }), 0);
    expect(checkPlayCard(t, 0, 'integration').reason).toMatch(/Need 1 GPU/);
    expect(() => applyAction(t, { type: 'PLAY_INTEGRATION', vertex: site })).toThrow(GameError);
    // Must roll first.
    t = giveIntegration(setHand({ ...s, phase: 'preRoll' }, 0, INTEGRATION_COST), 0);
    expect(checkPlayCard(t, 0, 'integration').ok).toBe(false);
    // All four factories built → not playable.
    s = giveIntegration(setHand(s, 0, INTEGRATION_COST), 0);
    let placed = 0;
    for (const v of s.board.vertices) {
      if (placed === 4) break;
      if (v.id === site || s.buildings[v.id] || v.neighborIds.some((n) => s.buildings[n] || n === site)) continue;
      s = place(s, v.id, 0, 'factory');
      placed++;
    }
    expect(checkPlayCard(s, 0, 'integration').reason).toMatch(/All 4 AI Factories/);
  });

  it('counts as the one Innovation Card for the turn', () => {
    let { s, site } = withSite();
    s = giveIntegration(setHand(s, 0, INTEGRATION_COST), 0);
    s = { ...s, players: s.players.map((p) => (p.id === 0 ? { ...p, devCards: [...p.devCards, { id: 1, type: 'grant', boughtOnTurn: 0 }] } : p)) };
    const after = applyAction(s, { type: 'PLAY_INTEGRATION', vertex: site });
    expect(checkPlayCard(after, 0, 'grant').reason).toMatch(/One|Only one/);
  });

  it('is played by the AI when it can afford it and has a site', () => {
    let { s, site } = withSite();
    s = { ...s, players: s.players.map((p) => ({ ...p, isAI: true })) };
    s = giveIntegration(setHand(s, 0, INTEGRATION_COST), 0);
    const action = decideAIAction(s, 0);
    expect(action.type).toBe('PLAY_INTEGRATION');
    expect(legalClusterVertices(s, 0)).toContain((action as { vertex: number }).vertex);
    expect(site).toBeGreaterThanOrEqual(0);
  });

  it('AI-only games with Volta cards finish legally, and the AI actually uses the card', () => {
    // Regression guard: before the AI saved toward INTEGRATION_COST it played only ~12% of drawn copies.
    let bought = 0;
    let played = 0;
    for (let seed = 9000; seed < 9100; seed++) {
      let s = createGame({ seed, seats: ALL_AI, voltaCards: true });
      let steps = 0;
      while (s.phase !== 'gameOver' && steps < 6000) {
        const a = decideAIAction(s, getActingPlayer(s)!);
        const held = s.players[s.currentPlayer].devCards.filter((c) => c.type === 'integration').length;
        if (a.type === 'PLAY_INTEGRATION') played++;
        s = applyAction(s, a);
        if (a.type === 'BUY_CARD' && s.players[s.currentPlayer].devCards.filter((c) => c.type === 'integration').length > held) bought++;
        steps++;
      }
      expect(s.phase, `seed ${seed}`).toBe('gameOver');
      expect(conservation(s)).toEqual(bundle({ power: 19, networking: 19, land: 19, capital: 19, gpu: 19 }));
    }
    expect(bought).toBeGreaterThan(20);
    expect(played / bought).toBeGreaterThanOrEqual(0.18);
  });
});
