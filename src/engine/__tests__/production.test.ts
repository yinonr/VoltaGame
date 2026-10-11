import { describe, expect, it } from 'vitest';
import { applyAction } from '../game';
import { blankGame, conservation, place, setHand, tileOf, withNextRoll } from './helpers';

describe('dice production', () => {
  it('pays 1 per adjacent cluster and 2 per factory on matching hexes', () => {
    let s = blankGame(11);
    const tile = s.board.tiles[tileOf(s, 'gpu')];
    const [v1, , v3] = tile.vertexIds; // opposite-ish corners, distance rule irrelevant for this test
    s = place(s, v1, 0, 'cluster');
    s = place(s, v3, 1, 'factory');
    s = { ...s, phase: 'preRoll' };
    s = withNextRoll(s, tile.number!);
    const before0 = s.players[0].resources.gpu;
    const before1 = s.players[1].resources.gpu;
    const after = applyAction(s, { type: 'ROLL' });
    // Other tiles may share corners; count only this tile's contribution by checking at least.
    const gained0 = after.players[0].resources.gpu - before0;
    const gained1 = after.players[1].resources.gpu - before1;
    const sameNumberGpuTiles = s.board.tiles.filter((t) => t.type === 'gpu' && t.number === tile.number);
    expect(sameNumberGpuTiles).toHaveLength(1);
    expect(gained0).toBe(1);
    expect(gained1).toBe(2);
    expect(after.phase).toBe('main');
    expect(after.lastProduction!.gains[0].gpu).toBe(1);
    expect(conservation(after)).toEqual(conservation(s));
  });

  it('pays every adjacent resource type for a corner touching three hexes', () => {
    let s = blankGame(3);
    const v = s.board.vertices.find((x) => x.tileIds.length === 3 && x.tileIds.every((t) => s.board.tiles[t].number !== null))!;
    s = place(s, v.id, 2, 'cluster');
    s = { ...s, phase: 'preRoll' };
    for (const t of v.tileIds) {
      const tile = s.board.tiles[t];
      const rolled = applyAction(withNextRoll(s, tile.number!), { type: 'ROLL' });
      const type = tile.type as Exclude<typeof tile.type, 'barren'>;
      const expected = v.tileIds.filter((id) => s.board.tiles[id].number === tile.number && s.board.tiles[id].type === type).length;
      expect(rolled.players[2].resources[type]).toBe(expected);
    }
  });

  it('produces nothing on a hex under the Grid Disruption', () => {
    let s = blankGame(8);
    const t = tileOf(s, 'capital');
    const tile = s.board.tiles[t];
    s = place(s, tile.vertexIds[0], 0);
    s = { ...s, phase: 'preRoll', disruptionTile: t };
    const after = applyAction(withNextRoll(s, tile.number!), { type: 'ROLL' });
    expect(after.lastProduction!.blockedTileId).toBe(t);
    const otherSame = s.board.tiles.filter((x) => x.id !== t && x.number === tile.number && x.vertexIds.includes(tile.vertexIds[0]));
    if (otherSame.length === 0) expect(after.players[0].resources.capital).toBe(0);
  });

  it('applies the shortage rule when the market cannot pay everyone', () => {
    let s = blankGame(21);
    const tile = s.board.tiles[tileOf(s, 'land')];
    s = place(s, tile.vertexIds[0], 0, 'factory');
    s = place(s, tile.vertexIds[3], 1, 'factory');
    // Drain the market to 3 Land: 4 are owed, so nobody collects.
    s = setHand(s, 3, { land: 16 });
    s = { ...s, phase: 'preRoll' };
    const after = applyAction(withNextRoll(s, tile.number!), { type: 'ROLL' });
    expect(after.lastProduction!.shortages).toContain('land');
    expect(after.players[0].resources.land).toBe(0);
    expect(after.players[1].resources.land).toBe(0);
    expect(conservation(after)).toEqual(conservation(s));
  });
});
