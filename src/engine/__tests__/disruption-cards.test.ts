import { describe, expect, it } from 'vitest';
import { sumBundle } from '../constants';
import { applyAction, disruptionVictims, GameError, getActingPlayer } from '../game';
import { checkPlayCard, playableCards } from '../rules';
import { victoryPoints } from '../scoring';
import type { DevCardType, GameState } from '../types';
import { blankGame, conservation, place, setHand, tileOf, withNextRoll } from './helpers';

function giveCard(s: GameState, player: number, type: DevCardType, boughtOnTurn = 0): GameState {
  return {
    ...s,
    players: s.players.map((p) => (p.id === player ? { ...p, devCards: [...p.devCards, { id: 900 + p.devCards.length, type, boughtOnTurn }] } : p)),
  };
}

describe('Grid Disruption (roll of 7)', () => {
  it('makes players over the hand limit discard half, rounded down, then moves the marker', () => {
    let s = blankGame();
    s = { ...s, phase: 'preRoll' };
    s = setHand(s, 0, { power: 4, land: 4 }); // 8 → discard 4
    s = setHand(s, 2, { gpu: 9 }); // 9 → discard 4
    s = setHand(s, 1, { capital: 7 }); // 7 → safe
    s = withNextRoll(s, 7);
    s = applyAction(s, { type: 'ROLL' });
    expect(s.lastRoll!.total).toBe(7);
    expect(s.phase).toBe('discard');
    expect(s.pendingDiscards).toEqual([4, 0, 4, 0]);
    expect(getActingPlayer(s)).toBe(0);
    expect(() => applyAction(s, { type: 'DISCARD', resources: { power: 1, networking: 0, land: 0, capital: 0, gpu: 0 } })).toThrow(/exactly 4/);
    s = applyAction(s, { type: 'DISCARD', resources: { power: 2, networking: 0, land: 2, capital: 0, gpu: 0 } });
    expect(getActingPlayer(s)).toBe(2);
    s = applyAction(s, { type: 'DISCARD', resources: { power: 0, networking: 0, land: 0, capital: 0, gpu: 4 } });
    expect(s.phase).toBe('moveDisruption');
    expect(getActingPlayer(s)).toBe(0);
    expect(sumBundle(s.players[0].resources)).toBe(4);
    expect(sumBundle(s.players[2].resources)).toBe(5);
  });

  it('blocks the new hex and takes one random resource from an adjacent rival', () => {
    let s = blankGame();
    const target = tileOf(s, 'gpu');
    const tile = s.board.tiles[target];
    s = place(s, tile.vertexIds[0], 1);
    s = setHand(s, 1, { capital: 2 });
    s = { ...s, phase: 'moveDisruption', returnPhase: 'main' };
    expect(disruptionVictims(s, target, 0)).toEqual([1]);
    expect(() => applyAction(s, { type: 'MOVE_DISRUPTION', tile: target, victim: null })).toThrow(GameError);
    expect(() => applyAction(s, { type: 'MOVE_DISRUPTION', tile: s.disruptionTile, victim: null })).toThrow(/different hex/);
    const after = applyAction(s, { type: 'MOVE_DISRUPTION', tile: target, victim: 1 });
    expect(after.disruptionTile).toBe(target);
    expect(after.players[0].resources.capital).toBe(1);
    expect(after.players[1].resources.capital).toBe(1);
    expect(after.phase).toBe('main');
    // The blocked hex no longer produces.
    const rolled = applyAction(withNextRoll({ ...after, phase: 'preRoll' }, tile.number!), { type: 'ROLL' });
    expect(rolled.lastProduction!.blockedTileId).toBe(target);
    expect(rolled.lastProduction!.gains[1].gpu).toBe(0);
    expect(conservation(rolled)).toEqual(conservation(s));
  });

  it('allows moving to a hex with no rivals without a steal', () => {
    let s = blankGame();
    s = { ...s, phase: 'moveDisruption', returnPhase: 'main' };
    const empty = s.board.tiles.find((t) => t.id !== s.disruptionTile)!.id;
    const after = applyAction(s, { type: 'MOVE_DISRUPTION', tile: empty, victim: null });
    expect(after.disruptionTile).toBe(empty);
  });
});

describe('Innovation Cards', () => {
  it('cannot be played on the turn they were bought, and only one per turn', () => {
    let s = blankGame();
    s = giveCard(s, 0, 'grant', s.turn);
    expect(checkPlayCard(s, 0, 'grant').reason).toMatch(/next turn/);
    s = giveCard(s, 0, 'grant', 0);
    s = giveCard(s, 0, 'consolidation', 0);
    s = applyAction(s, { type: 'PLAY_GRANT', resources: ['gpu', 'gpu'] });
    expect(s.players[0].resources.gpu).toBe(2);
    expect(checkPlayCard(s, 0, 'consolidation').reason).toMatch(/One|Only one/);
  });

  it('Infrastructure Priority moves the disruption and counts toward Priority Access', () => {
    let s = blankGame();
    s = { ...s, phase: 'preRoll' };
    for (let i = 0; i < 3; i++) s = giveCard(s, 0, 'priority', 0);
    s = applyAction(s, { type: 'PLAY_PRIORITY' });
    expect(s.phase).toBe('moveDisruption');
    const t = s.board.tiles.find((x) => x.id !== s.disruptionTile)!.id;
    s = applyAction(s, { type: 'MOVE_DISRUPTION', tile: t, victim: null });
    expect(s.phase).toBe('preRoll'); // back to rolling
    expect(s.players[0].priorityPlayed).toBe(1);
    // Simulate two more turns of plays.
    s = { ...s, players: s.players.map((p) => (p.id === 0 ? { ...p, priorityPlayed: 2 } : p)), devCardPlayedThisTurn: false, phase: 'main' };
    s = applyAction(s, { type: 'PLAY_PRIORITY' });
    expect(s.largestArmyHolder).toBe(0);
  });

  it('Network Expansion places two free connections', () => {
    let s = blankGame();
    const v = s.board.vertices.find((x) => x.neighborIds.length === 3)!;
    s = place(s, v.id, 0);
    s = giveCard(s, 0, 'expansion', 0);
    s = applyAction(s, { type: 'PLAY_EXPANSION' });
    expect(s.phase).toBe('freeRoads');
    expect(s.freeRoadsLeft).toBe(2);
    s = applyAction(s, { type: 'BUILD_ROAD', edge: v.edgeIds[0] });
    s = applyAction(s, { type: 'BUILD_ROAD', edge: v.edgeIds[1] });
    expect(s.phase).toBe('main');
    expect(s.roads.filter((r) => r === 0)).toHaveLength(2);
    expect(sumBundle(s.players[0].resources)).toBe(0);
  });

  it('Market Consolidation collects one resource from every rival', () => {
    let s = blankGame();
    s = setHand(s, 1, { gpu: 2, land: 1 });
    s = setHand(s, 2, { gpu: 1 });
    s = setHand(s, 3, { capital: 4 });
    s = giveCard(s, 0, 'consolidation', 0);
    s = applyAction(s, { type: 'PLAY_CONSOLIDATION', resource: 'gpu' });
    expect(s.players[0].resources.gpu).toBe(3);
    expect(s.players[1].resources).toMatchObject({ gpu: 0, land: 1 });
    expect(s.players[2].resources.gpu).toBe(0);
  });

  it('AI Breakthrough cards score secretly and are never played', () => {
    let s = blankGame();
    s = place(s, 0, 0);
    const before = victoryPoints(s, 0);
    s = giveCard(s, 0, 'breakthrough', 0);
    expect(victoryPoints(s, 0, true)).toBe(before + 1);
    expect(victoryPoints(s, 0, false)).toBe(before);
    expect(playableCards(s, 0)).toHaveLength(0);
  });
});
