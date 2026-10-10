import { NUMBER_TOKENS, PORT_TYPES, TILE_DISTRIBUTION } from './constants';
import { Rng } from './rng';
import type { Board, Edge, Port, Tile, Vertex } from './types';

// Pointy-top hexes in axial coordinates; rows of 3–4–5–4–3.
const SQRT3 = Math.sqrt(3);

interface Geometry {
  tiles: Omit<Tile, 'type' | 'number'>[];
  vertices: Omit<Vertex, 'port'>[];
  edges: Edge[];
  /** Coastal edge ids in clockwise order around the island. */
  coast: number[];
}

let cachedGeometry: Geometry | null = null;

function key(x: number, y: number): string {
  return `${Math.round(x * 1000)}:${Math.round(y * 1000)}`;
}

export function buildGeometry(): Geometry {
  if (cachedGeometry) return cachedGeometry;

  const axial: [number, number][] = [];
  for (let r = -2; r <= 2; r++) {
    for (let q = -2; q <= 2; q++) {
      if (Math.abs(q + r) <= 2) axial.push([q, r]);
    }
  }

  const vertexIndex = new Map<string, number>();
  const vertices: Omit<Vertex, 'port'>[] = [];
  const edgeIndex = new Map<string, number>();
  const edges: Edge[] = [];
  const tiles: Omit<Tile, 'type' | 'number'>[] = [];

  axial.forEach(([q, r], tileId) => {
    const cx = SQRT3 * (q + r / 2);
    const cy = 1.5 * r;
    const corners: number[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = ((60 * i - 30) * Math.PI) / 180;
      const x = cx + Math.cos(angle);
      const y = cy + Math.sin(angle);
      const k = key(x, y);
      let id = vertexIndex.get(k);
      if (id === undefined) {
        id = vertices.length;
        vertexIndex.set(k, id);
        vertices.push({ id, x, y, tileIds: [], edgeIds: [], neighborIds: [] });
      }
      vertices[id].tileIds.push(tileId);
      corners.push(id);
    }
    for (let i = 0; i < 6; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 6];
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      let id = edgeIndex.get(k);
      if (id === undefined) {
        id = edges.length;
        edgeIndex.set(k, id);
        edges.push({ id, a: Math.min(a, b), b: Math.max(a, b), tileIds: [] });
        vertices[a].edgeIds.push(id);
        vertices[b].edgeIds.push(id);
        vertices[a].neighborIds.push(b);
        vertices[b].neighborIds.push(a);
      }
      edges[id].tileIds.push(tileId);
    }
    tiles.push({ id: tileId, q, r, x: cx, y: cy, vertexIds: corners, neighborIds: [] });
  });

  for (const e of edges) {
    if (e.tileIds.length === 2) {
      const [t1, t2] = e.tileIds;
      tiles[t1].neighborIds.push(t2);
      tiles[t2].neighborIds.push(t1);
    }
  }

  const coast = edges
    .filter((e) => e.tileIds.length === 1)
    .map((e) => {
      const va = vertices[e.a];
      const vb = vertices[e.b];
      const mx = (va.x + vb.x) / 2;
      const my = (va.y + vb.y) / 2;
      return { id: e.id, angle: Math.atan2(my, mx) };
    })
    .sort((p, q) => p.angle - q.angle)
    .map((p) => p.id);

  cachedGeometry = { tiles, vertices, edges, coast };
  return cachedGeometry;
}

/** Positions (indices into the clockwise coast list) for the 9 ports: gaps of 3,3,4 repeating. */
const PORT_SLOTS = [0, 3, 6, 10, 13, 16, 20, 23, 26];

function numbersAreFair(tiles: { type: string; number: number | null; neighborIds: number[] }[]): boolean {
  for (const t of tiles) {
    if (t.number === null) continue;
    for (const n of t.neighborIds) {
      const other = tiles[n].number;
      if (other === null) continue;
      const hot = (v: number) => v === 6 || v === 8;
      if (hot(t.number) && hot(other)) return false; // no adjacent high-yield hexes
      if (t.number === other) return false; // no identical neighbors
    }
  }
  return true;
}

/**
 * Generate a fair, reproducible board from a seed: shuffled terrain, production numbers
 * with no adjacent 6/8 (and no identical neighbors), and 9 coastal ports.
 */
export function createBoard(seed: number): Board {
  const geo = buildGeometry();
  const rng = new Rng(seed);

  let types = rng.shuffle(TILE_DISTRIBUTION);
  let numbers: (number | null)[] = [];
  let ok = false;
  for (let attempt = 0; attempt < 5000 && !ok; attempt++) {
    if (attempt > 0 && attempt % 50 === 0) types = rng.shuffle(TILE_DISTRIBUTION);
    const tokens = rng.shuffle(NUMBER_TOKENS);
    let i = 0;
    numbers = types.map((t) => (t === 'barren' ? null : tokens[i++]));
    ok = numbersAreFair(geo.tiles.map((t, idx) => ({ type: types[idx], number: numbers[idx], neighborIds: t.neighborIds })));
  }
  if (!ok) throw new Error('Could not generate a fair board');

  const tiles: Tile[] = geo.tiles.map((t, idx) => ({
    ...t,
    vertexIds: t.vertexIds.slice(),
    neighborIds: t.neighborIds.slice(),
    type: types[idx],
    number: numbers[idx],
  }));

  const vertices: Vertex[] = geo.vertices.map((v) => ({
    ...v,
    tileIds: v.tileIds.slice(),
    edgeIds: v.edgeIds.slice(),
    neighborIds: v.neighborIds.slice(),
    port: null,
  }));

  const portTypes = rng.shuffle(PORT_TYPES);
  const ports: Port[] = PORT_SLOTS.map((slot, i) => {
    const edge = geo.edges[geo.coast[slot]];
    const va = vertices[edge.a];
    const vb = vertices[edge.b];
    const mx = (va.x + vb.x) / 2;
    const my = (va.y + vb.y) / 2;
    const len = Math.hypot(mx, my);
    const push = 0.62;
    vertices[edge.a].port = portTypes[i];
    vertices[edge.b].port = portTypes[i];
    return {
      id: i,
      type: portTypes[i],
      edgeId: edge.id,
      vertexIds: [edge.a, edge.b],
      x: mx + (mx / len) * push,
      y: my + (my / len) * push,
    };
  });

  return {
    seed,
    tiles,
    vertices,
    edges: geo.edges.map((e) => ({ ...e, tileIds: e.tileIds.slice() })),
    ports,
  };
}

export function barrenTileId(board: Board): number {
  return board.tiles.findIndex((t) => t.type === 'barren');
}
