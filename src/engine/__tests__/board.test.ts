import { describe, expect, it } from 'vitest';
import { buildGeometry, createBoard } from '../board';
import { NUMBER_TOKENS } from '../constants';

describe('board generation', () => {
  it('has 19 hexes in rows of 3-4-5-4-3', () => {
    const b = createBoard(1);
    expect(b.tiles).toHaveLength(19);
    const rows = new Map<number, number>();
    for (const t of b.tiles) rows.set(t.r, (rows.get(t.r) ?? 0) + 1);
    expect([...rows.entries()].sort((a, c) => a[0] - c[0]).map(([, n]) => n)).toEqual([3, 4, 5, 4, 3]);
  });

  it('uses the exact terrain distribution', () => {
    for (const seed of [1, 2, 3, 99, 123456]) {
      const counts: Record<string, number> = {};
      for (const t of createBoard(seed).tiles) counts[t.type] = (counts[t.type] ?? 0) + 1;
      expect(counts).toEqual({ power: 4, networking: 3, land: 4, capital: 4, gpu: 3, barren: 1 });
    }
  });

  it('uses the conventional production numbers, none on the barren tile, no 7', () => {
    for (const seed of [1, 7, 42, 2026]) {
      const b = createBoard(seed);
      const nums = b.tiles.filter((t) => t.number !== null).map((t) => t.number!).sort((a, c) => a - c);
      expect(nums).toEqual(NUMBER_TOKENS.slice().sort((a, c) => a - c));
      expect(b.tiles.find((t) => t.type === 'barren')!.number).toBeNull();
      expect(nums).not.toContain(7);
    }
  });

  it('never places 6s and 8s next to each other (and no identical neighbors)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const b = createBoard(seed);
      for (const t of b.tiles) {
        if (t.number === null) continue;
        for (const n of t.neighborIds) {
          const other = b.tiles[n].number;
          if (other === null) continue;
          const hot = (v: number) => v === 6 || v === 8;
          expect(hot(t.number) && hot(other)).toBe(false);
          expect(other).not.toBe(t.number);
        }
      }
    }
  });

  it('has true vertex/edge topology: 54 corners, 72 edges, 30 coastal edges', () => {
    const g = buildGeometry();
    expect(g.vertices).toHaveLength(54);
    expect(g.edges).toHaveLength(72);
    expect(g.coast).toHaveLength(30);
    for (const v of g.vertices) {
      expect(v.tileIds.length).toBeGreaterThanOrEqual(1);
      expect(v.tileIds.length).toBeLessThanOrEqual(3);
      expect(v.neighborIds.length).toBe(v.edgeIds.length);
      expect([2, 3]).toContain(v.neighborIds.length);
    }
    for (const t of g.tiles) expect(new Set(t.vertexIds).size).toBe(6);
  });

  it('places 9 ports (4 generic, 5 specific) on distinct coastal edges', () => {
    const b = createBoard(5);
    expect(b.ports).toHaveLength(9);
    expect(b.ports.filter((p) => p.type === 'any')).toHaveLength(4);
    expect(new Set(b.ports.filter((p) => p.type !== 'any').map((p) => p.type)).size).toBe(5);
    const portVertices = b.ports.flatMap((p) => p.vertexIds);
    expect(new Set(portVertices).size).toBe(18);
    for (const p of b.ports) expect(b.edges[p.edgeId].tileIds).toHaveLength(1);
  });

  it('is reproducible from a seed', () => {
    expect(createBoard(777)).toEqual(createBoard(777));
    expect(createBoard(777).tiles.map((t) => t.type)).not.toEqual(createBoard(778).tiles.map((t) => t.type));
  });
});
