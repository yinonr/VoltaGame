import { describe, expect, it } from 'vitest';
import { evaluateOffer } from '../ai';
import { bundle, COSTS } from '../constants';
import { applyAction, createGame, GameError, getActingPlayer } from '../game';
import { bankRate, checkBuild } from '../rules';
import { blankGame, conservation, place, setHand } from './helpers';

describe('turn flow and player isolation', () => {
  it('starts Quick Start games with two clusters + two connections each and opening resources', () => {
    const s = createGame({ seed: 5 });
    expect(s.phase).toBe('preRoll');
    expect(s.turn).toBe(1);
    for (const p of s.players) {
      expect(s.buildings.filter((b) => b?.owner === p.id)).toHaveLength(2);
      expect(s.roads.filter((r) => r === p.id)).toHaveLength(2);
      const total = Object.values(p.resources).reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThanOrEqual(1);
      expect(total).toBeLessThanOrEqual(3);
    }
    // Distance rule holds for the whole opening.
    s.buildings.forEach((b, v) => {
      if (!b) return;
      for (const n of s.board.vertices[v].neighborIds) expect(s.buildings[n]).toBeNull();
    });
    // Every opening connection touches its owner's cluster.
    s.roads.forEach((owner, e) => {
      if (owner === null) return;
      const edge = s.board.edges[e];
      expect([s.buildings[edge.a]?.owner, s.buildings[edge.b]?.owner]).toContain(owner);
    });
    expect(conservation(s)).toEqual(bundle({ power: 19, networking: 19, land: 19, capital: 19, gpu: 19 }));
  });

  it('requires a roll before building or ending the turn', () => {
    let s = createGame({ seed: 9 });
    s = setHand(s, 0, COSTS.cluster);
    expect(checkBuild(s, 0, 'road').reason).toMatch(/Roll the dice/);
    expect(() => applyAction(s, { type: 'END_TURN' })).toThrow(GameError);
  });

  it('advances to the next company and resets per-turn state', () => {
    let s = blankGame();
    s = { ...s, devCardPlayedThisTurn: true, tradesProposedThisTurn: 3 };
    const after = applyAction(s, { type: 'END_TURN' });
    expect(after.currentPlayer).toBe(1);
    expect(after.turn).toBe(2);
    expect(after.phase).toBe('preRoll');
    expect(after.devCardPlayedThisTurn).toBe(false);
    expect(after.tradesProposedThisTurn).toBe(0);
    const wrapped = applyActions4(after);
    expect(wrapped.currentPlayer).toBe(0);
  });

  it("acts only for the current company; other hands are untouched by a rival's build", () => {
    let s = blankGame();
    const v = s.board.vertices.find((x) => x.neighborIds.length === 3)!;
    s = place(s, v.id, 1);
    s = { ...s, currentPlayer: 1 };
    s = setHand(s, 1, COSTS.road);
    s = setHand(s, 0, { power: 3, networking: 3 });
    expect(getActingPlayer(s)).toBe(1);
    const after = applyAction(s, { type: 'BUILD_ROAD', edge: v.edgeIds[0] });
    expect(after.roads[v.edgeIds[0]]).toBe(1);
    expect(after.players[0].resources).toEqual(s.players[0].resources);
  });
});

function applyActions4(s: ReturnType<typeof blankGame>) {
  // Turn passes 1 → 2 → 3 → 0 by rolling non-7s isn't needed: jump phases directly.
  let x = s;
  for (let i = 0; i < 3; i++) x = applyAction({ ...x, phase: 'main' }, { type: 'END_TURN' });
  return x;
}

describe('trading', () => {
  it('trades 4:1 with the market by default', () => {
    let s = blankGame();
    s = setHand(s, 0, { power: 4 });
    expect(bankRate(s, 0, 'power')).toBe(4);
    const after = applyAction(s, { type: 'BANK_TRADE', give: 'power', get: 'gpu' });
    expect(after.players[0].resources.power).toBe(0);
    expect(after.players[0].resources.gpu).toBe(1);
    expect(conservation(after)).toEqual(conservation(s));
  });

  it('uses 3:1 and 2:1 hub rates when a cluster touches a port', () => {
    let s = blankGame(17);
    const generic = s.board.ports.find((p) => p.type === 'any')!;
    const specific = s.board.ports.find((p) => p.type !== 'any')!;
    s = place(s, generic.vertexIds[0], 0);
    expect(bankRate(s, 0, 'land')).toBe(3);
    s = place(s, specific.vertexIds[0], 0);
    expect(bankRate(s, 0, specific.type as 'land')).toBe(2);
  });

  it('rejects invalid market trades', () => {
    let s = blankGame();
    s = setHand(s, 0, { power: 3 });
    expect(() => applyAction(s, { type: 'BANK_TRADE', give: 'power', get: 'gpu' })).toThrow(/Need 4/);
    s = setHand(s, 0, { power: 4 });
    expect(() => applyAction(s, { type: 'BANK_TRADE', give: 'power', get: 'power' })).toThrow(GameError);
    expect(() => applyAction({ ...s, phase: 'preRoll' }, { type: 'BANK_TRADE', give: 'power', get: 'gpu' })).toThrow(/Roll/);
  });

  it('runs a full offer → accept flow between companies', () => {
    let s = blankGame();
    s = setHand(s, 0, { land: 2 });
    s = setHand(s, 1, { gpu: 1 });
    s = applyAction(s, { type: 'PROPOSE_TRADE', to: 1, give: bundle({ land: 1 }), get: bundle({ gpu: 1 }) });
    expect(getActingPlayer(s)).toBe(1);
    expect(() => applyAction(s, { type: 'END_TURN' })).toThrow(GameError);
    const accepted = applyAction(s, { type: 'RESPOND_TRADE', accept: true });
    expect(accepted.players[0].resources).toMatchObject({ land: 1, gpu: 1 });
    expect(accepted.players[1].resources).toMatchObject({ land: 1, gpu: 0 });
    expect(getActingPlayer(accepted)).toBe(0);
    const declined = applyAction(s, { type: 'RESPOND_TRADE', accept: false, reason: 'no thanks' });
    expect(declined.players[0].resources.land).toBe(2);
    expect(declined.log.at(-1)!.text).toMatch(/declined/);
  });

  it('rejects invalid offers', () => {
    let s = blankGame();
    s = setHand(s, 0, { land: 1 });
    expect(() => applyAction(s, { type: 'PROPOSE_TRADE', to: 1, give: bundle({ land: 2 }), get: bundle({ gpu: 1 }) })).toThrow(/don't have/);
    expect(() => applyAction(s, { type: 'PROPOSE_TRADE', to: 1, give: bundle({ land: 1 }), get: bundle() })).toThrow(GameError);
    expect(() => applyAction(s, { type: 'PROPOSE_TRADE', to: 0, give: bundle({ land: 1 }), get: bundle({ gpu: 1 }) })).toThrow(GameError);
  });

  it('AI rivals accept deals that help them and refuse ones that do not', () => {
    let s = blankGame();
    const v = s.board.vertices.find((x) => x.neighborIds.length === 3)!;
    s = place(s, v.id, 1);
    // Player 1 is one Capital short of a factory and has spare Power.
    s = setHand(s, 1, { capital: 2, gpu: 2, power: 3 });
    const good = evaluateOffer(s, 1, { from: 0, to: 1, give: bundle({ capital: 1 }), get: bundle({ power: 1 }) });
    expect(good.accept).toBe(true);
    const bad = evaluateOffer(s, 1, { from: 0, to: 1, give: bundle({ land: 1 }), get: bundle({ gpu: 2 }) });
    expect(bad.accept).toBe(false);
    const missing = evaluateOffer(s, 1, { from: 0, to: 1, give: bundle({ capital: 1 }), get: bundle({ networking: 1 }) });
    expect(missing.accept).toBe(false);
    expect(missing.reason).toMatch(/doesn't have/);
  });

  it('AI rivals refuse to help a company at 8+ points', () => {
    let s = blankGame();
    const open = s.board.vertices.filter((_, i) => i % 9 === 0).map((v) => v.id);
    for (const v of open.slice(0, 4)) s = place(s, v, 0, 'factory');
    s = setHand(s, 1, { power: 3 });
    const verdict = evaluateOffer(s, 1, { from: 0, to: 1, give: bundle({ gpu: 2 }), get: bundle({ power: 1 }) });
    expect(verdict.accept).toBe(false);
    expect(verdict.reason).toMatch(/market leader/);
  });
});
