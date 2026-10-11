import { useMemo, useState } from 'react';
import type { GameState, TileType } from '../engine/types';
import { BARREN_INFO, RESOURCE_INFO, companyById, pips } from '../engine/constants';
import { ResourceGlyph } from './icons';

const S = 64; // pixels per unit hex radius

export type Ghost = 'road' | 'cluster' | 'factory' | null;

/** A board spot chosen on touch devices, awaiting confirmation. */
export interface BoardTarget {
  kind: 'vertex' | 'edge' | 'tile';
  id: number;
}

interface BoardProps {
  state: GameState;
  highlightVertices: Set<number>;
  highlightEdges: Set<number>;
  highlightTiles: Set<number>;
  ghost: Ghost;
  ghostColor: string;
  onVertex: (v: number) => void;
  onEdge: (e: number) => void;
  onTile: (t: number) => void;
  /** Tiles to mark as "disruption candidates" with a warning style. */
  tileMode?: 'disrupt' | null;
  /** Touch layout: larger hit areas. */
  touch?: boolean;
  /** Spot selected (touch) and awaiting confirmation. */
  selected?: BoardTarget | null;
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = ((60 * i - 30) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

function tileColors(type: TileType) {
  if (type === 'barren') return { color: BARREN_INFO.color, deep: BARREN_INFO.deep };
  return { color: RESOURCE_INFO[type].color, deep: RESOURCE_INFO[type].deep };
}

export function ClusterShape({ x, y, color, stroke, scale = 1, ghost = false }: { x: number; y: number; color: string; stroke: string; scale?: number; ghost?: boolean }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`} className={ghost ? 'piece ghost' : 'piece'}>
      <rect x={-10} y={-10} width={20} height={20} rx={4} fill={color} stroke={stroke} strokeWidth={2.5} />
      <path d="M-6 -4 H6 M-6 1 H6 M-6 6 H6" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" opacity={0.85} />
    </g>
  );
}

export function FactoryShape({ x, y, color, stroke, scale = 1, ghost = false }: { x: number; y: number; color: string; stroke: string; scale?: number; ghost?: boolean }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`} className={ghost ? 'piece ghost' : 'piece'}>
      <path
        d="M-15 12 V-4 L-7 -10 V-4 L1 -10 V-4 H5 V-14 H13 V12 Z"
        fill={color}
        stroke={stroke}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <path d="M-10 4 H-5 M-1 4 H4 M8 -6 V6" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={9} cy={-17} r={2.4} fill="#fde68a" stroke={stroke} strokeWidth={1} className="factory-light" />
    </g>
  );
}

export function Board({ state, highlightVertices, highlightEdges, highlightTiles, ghost, ghostColor, onVertex, onEdge, onTile, tileMode, touch = false, selected = null }: BoardProps) {
  const { board } = state;
  const [hoverV, setHoverV] = useState<number | null>(null);
  const [hoverE, setHoverE] = useState<number | null>(null);

  const viewBox = useMemo(() => {
    const xs = [...board.vertices.map((v) => v.x), ...board.ports.map((p) => p.x)];
    const ys = [...board.vertices.map((v) => v.y), ...board.ports.map((p) => p.y)];
    const pad = 0.55;
    const minX = (Math.min(...xs) - pad) * S;
    const minY = (Math.min(...ys) - pad) * S;
    const w = (Math.max(...xs) - Math.min(...xs) + pad * 2) * S;
    const h = (Math.max(...ys) - Math.min(...ys) + pad * 2) * S;
    return `${minX.toFixed(1)} ${minY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
  }, [board]);

  const playerColor = (p: number) => companyById(state.players[p].companyId);
  const report = state.lastProduction;
  const prodKey = `${state.turn}-${state.lastRoll?.total ?? 0}-${state.log.length}`;

  return (
    <svg className="board" viewBox={viewBox} role="img" aria-label="Settlers of Compute board">
      <defs>
        {(['power', 'networking', 'land', 'capital', 'gpu', 'barren'] as TileType[]).map((t) => {
          const c = tileColors(t);
          return (
            <radialGradient key={t} id={`tile-${t}`} cx="50%" cy="35%" r="75%">
              <stop offset="0%" stopColor={c.color} stopOpacity={0.55} />
              <stop offset="55%" stopColor={c.deep} stopOpacity={0.95} />
              <stop offset="100%" stopColor="#060914" stopOpacity={1} />
            </radialGradient>
          );
        })}
        <pattern id="outage-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="rgba(8,10,20,0.55)" />
          <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(248,113,113,0.35)" strokeWidth="3" />
        </pattern>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="sea" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#13234a" />
          <stop offset="100%" stopColor="#070b18" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* backdrop plate */}
      <circle cx={0} cy={0} r={S * 5.4} fill="url(#sea)" />
      <polygon points={hexPoints(0, 0, S * 4.75)} transform="rotate(30)" className="board-plate" />

      {/* ports */}
      {board.ports.map((port) => {
        const [a, b] = port.vertexIds.map((id) => board.vertices[id]);
        const label = port.type === 'any' ? '3:1' : '2:1';
        const color = port.type === 'any' ? '#e2e8f0' : RESOURCE_INFO[port.type].color;
        return (
          <g key={port.id} className="port">
            <line x1={port.x * S} y1={port.y * S} x2={a.x * S} y2={a.y * S} className="port-line" />
            <line x1={port.x * S} y1={port.y * S} x2={b.x * S} y2={b.y * S} className="port-line" />
            <g transform={`translate(${port.x * S},${port.y * S})`}>
              <title>{port.type === 'any' ? 'Exchange hub: trade any 3 identical resources for 1' : `${RESOURCE_INFO[port.type].label} hub: trade 2 ${RESOURCE_INFO[port.type].label} for 1 of anything`}</title>
              <rect x={-22} y={-13} width={44} height={26} rx={13} className="port-badge" style={{ stroke: color }} />
              {port.type === 'any' ? (
                <text x={0} y={4.5} textAnchor="middle" className="port-text">{label}</text>
              ) : (
                <>
                  <text x={-6} y={4.5} textAnchor="middle" className="port-text">{label}</text>
                  <g transform="translate(5,-7) scale(0.58)">
                    <ResourceGlyph type={port.type} color={color} />
                  </g>
                </>
              )}
            </g>
          </g>
        );
      })}

      {/* tiles */}
      {board.tiles.map((tile) => {
        const cx = tile.x * S;
        const cy = tile.y * S;
        const c = tileColors(tile.type);
        const producing = report && report.tileIds.includes(tile.id) && report.blockedTileId !== tile.id;
        const hot = tile.number === 6 || tile.number === 8;
        const label = tile.type === 'barren' ? BARREN_INFO.label : RESOURCE_INFO[tile.type].label;
        return (
          <g key={tile.id} className="tile">
            <title>{`${label}${tile.number ? ` · produces on ${tile.number} (${pips(tile.number)}/36)` : ''}`}</title>
            <polygon points={hexPoints(cx, cy, S * 0.97)} fill={`url(#tile-${tile.type})`} stroke={c.color} strokeOpacity={0.55} strokeWidth={1.5} />
            <polygon points={hexPoints(cx, cy, S * 0.82)} fill="none" stroke={c.color} strokeOpacity={0.18} strokeWidth={1} />
            {producing && <polygon key={prodKey} points={hexPoints(cx, cy, S * 0.95)} className="tile-produce" style={{ stroke: c.color }} />}
            <g transform={`translate(${cx - 13},${cy - 33}) scale(1.08)`} opacity={0.95}>
              <ResourceGlyph type={tile.type} color={c.color} />
            </g>
            {tile.number !== null && (
              <g transform={`translate(${cx},${cy + 12})`}>
                <circle r={17} className={`token${hot ? ' hot' : ''}`} />
                <text y={4} textAnchor="middle" className={`token-num${hot ? ' hot' : ''}`}>
                  {tile.number}
                </text>
                <g transform="translate(0,11)">
                  {Array.from({ length: pips(tile.number) }).map((_, i, arr) => (
                    <circle key={i} cx={(i - (arr.length - 1) / 2) * 3.6} cy={0} r={1.15} className={`pip${hot ? ' hot' : ''}`} />
                  ))}
                </g>
              </g>
            )}
            {tile.type === 'barren' && (
              <text x={cx} y={cy + 16} textAnchor="middle" className="barren-label">
                DEAD ZONE
              </text>
            )}
          </g>
        );
      })}

      {/* disruption marker */}
      {(() => {
        const tile = board.tiles[state.disruptionTile];
        const cx = tile.x * S;
        const cy = tile.y * S;
        return (
          <g className="outage" pointerEvents="none">
            <polygon points={hexPoints(cx, cy, S * 0.95)} fill="url(#outage-hatch)" />
            <g transform={`translate(${cx},${cy - 22})`}>
              <circle r={15} className="outage-ring" />
              <circle r={14} fill="#1a0b10" stroke="#f87171" strokeWidth={2} />
              <g transform="translate(-9,-9) scale(0.75)">
                <path d="M13.5 2 L5 13.5 H11.5 L10.5 22 L19 10 H12.5 Z" fill="#f87171" />
                <path d="M3 3 L21 21" stroke="#1a0b10" strokeWidth={3.5} strokeLinecap="round" />
              </g>
            </g>
            <text x={cx} y={cy + 47} textAnchor="middle" className="outage-label">OUTAGE</text>
          </g>
        );
      })()}

      {/* roads */}
      {board.edges.map((e) => {
        const owner = state.roads[e.id];
        if (owner === null) return null;
        const a = board.vertices[e.a];
        const b = board.vertices[e.b];
        const co = playerColor(owner);
        const x1 = a.x + (b.x - a.x) * 0.16;
        const y1 = a.y + (b.y - a.y) * 0.16;
        const x2 = a.x + (b.x - a.x) * 0.84;
        const y2 = a.y + (b.y - a.y) * 0.84;
        return (
          <g key={`road-${e.id}`} className="road">
            <line x1={x1 * S} y1={y1 * S} x2={x2 * S} y2={y2 * S} stroke={co.color} strokeWidth={18} strokeLinecap="round" className="fresh-road" />
            <line x1={x1 * S} y1={y1 * S} x2={x2 * S} y2={y2 * S} stroke={co.stroke} strokeWidth={11} strokeLinecap="round" />
            <line x1={x1 * S} y1={y1 * S} x2={x2 * S} y2={y2 * S} stroke={co.color} strokeWidth={6.5} strokeLinecap="round" />
          </g>
        );
      })}

      {/* edge highlights */}
      {board.edges.map((e) => {
        if (!highlightEdges.has(e.id)) return null;
        const a = board.vertices[e.a];
        const b = board.vertices[e.b];
        const x1 = a.x + (b.x - a.x) * 0.18;
        const y1 = a.y + (b.y - a.y) * 0.18;
        const x2 = a.x + (b.x - a.x) * 0.82;
        const y2 = a.y + (b.y - a.y) * 0.82;
        const hovered = touch ? selected?.kind === 'edge' && selected.id === e.id : hoverE === e.id;
        return (
          <g
            key={`he-${e.id}`}
            className="hit"
            onClick={() => onEdge(e.id)}
            onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && onEdge(e.id)}
            onMouseEnter={() => setHoverE(e.id)}
            onMouseLeave={() => setHoverE((h) => (h === e.id ? null : h))}
            onFocus={() => setHoverE(e.id)}
            onBlur={() => setHoverE((h) => (h === e.id ? null : h))}
            tabIndex={0}
            role="button"
            aria-label="Build connection here"
          >
            <line x1={x1 * S} y1={y1 * S} x2={x2 * S} y2={y2 * S} className={`edge-hl${hovered ? ' hover' : ''}`} style={{ stroke: hovered ? ghostColor : undefined }} />
            <line x1={a.x * S} y1={a.y * S} x2={b.x * S} y2={b.y * S} stroke="transparent" strokeWidth={touch ? 34 : 22} />
          </g>
        );
      })}

      {/* buildings */}
      {state.buildings.map((bld, v) => {
        if (!bld) return null;
        const vx = board.vertices[v].x * S;
        const vy = board.vertices[v].y * S;
        const co = playerColor(bld.owner);
        return (
          <g key={`b-${v}-${bld.kind}`}>
            <circle cx={vx} cy={vy} r={14} className="fresh-ring" style={{ stroke: co.color }} />
            {bld.kind === 'cluster' ? (
              <ClusterShape x={vx} y={vy} color={co.color} stroke={co.stroke} />
            ) : (
              <FactoryShape x={vx} y={vy} color={co.color} stroke={co.stroke} />
            )}
          </g>
        );
      })}

      {/* vertex highlights */}
      {board.vertices.map((vert) => {
        if (!highlightVertices.has(vert.id)) return null;
        const hovered = touch ? selected?.kind === 'vertex' && selected.id === vert.id : hoverV === vert.id;
        const vx = vert.x * S;
        const vy = vert.y * S;
        return (
          <g
            key={`hv-${vert.id}`}
            className="hit"
            onClick={() => onVertex(vert.id)}
            onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && onVertex(vert.id)}
            onMouseEnter={() => setHoverV(vert.id)}
            onMouseLeave={() => setHoverV((h) => (h === vert.id ? null : h))}
            onFocus={() => setHoverV(vert.id)}
            onBlur={() => setHoverV((h) => (h === vert.id ? null : h))}
            tabIndex={0}
            role="button"
            aria-label="Build here"
          >
            <circle cx={vx} cy={vy} r={hovered ? 15 : touch ? 12 : 10} className={`vertex-hl${hovered && touch ? ' chosen' : ''}`} />
            {hovered && ghost === 'cluster' && <ClusterShape x={vx} y={vy} color={ghostColor} stroke="#0b1020" ghost />}
            {hovered && ghost === 'factory' && <FactoryShape x={vx} y={vy} color={ghostColor} stroke="#0b1020" ghost />}
            <circle cx={vx} cy={vy} r={touch ? 30 : 18} fill="transparent" />
          </g>
        );
      })}

      {/* tile targets (Grid Disruption) */}
      {board.tiles.map((tile) => {
        if (!highlightTiles.has(tile.id)) return null;
        return (
          <g
            key={`ht-${tile.id}`}
            className="hit"
            onClick={() => onTile(tile.id)}
            onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && onTile(tile.id)}
            tabIndex={0}
            role="button"
            aria-label={`Move Grid Disruption to ${tile.type === 'barren' ? 'the Dead Zone' : RESOURCE_INFO[tile.type].label}${tile.number ? ` ${tile.number}` : ''}`}
          >
            <polygon
              points={hexPoints(tile.x * S, tile.y * S, S * 0.9)}
              className={`tile-hl${tileMode === 'disrupt' ? ' disrupt' : ''}${selected?.kind === 'tile' && selected.id === tile.id ? ' chosen' : ''}`}
            />
          </g>
        );
      })}

      {/* production payouts */}
      {report &&
        report.tileIds
          .filter((t) => t !== report.blockedTileId)
          .flatMap((t) => {
            const tile = board.tiles[t];
            if (tile.type === 'barren') return [];
            return tile.vertexIds
              .filter((v) => state.buildings[v])
              .map((v, i) => {
                const bld = state.buildings[v]!;
                const vert = board.vertices[v];
                const n = bld.kind === 'factory' ? 2 : 1;
                const res = tile.type as Exclude<TileType, 'barren'>;
                const short = report.shortages.includes(res);
                // Float the chip just above the producing building (buildings are 2+ steps apart,
                // so chips never collide).
                const ox = 0;
                const oy = -24;
                return (
                  <g key={`${prodKey}-${t}-${v}-${i}`} className="payout" transform={`translate(${vert.x * S + ox},${vert.y * S + oy})`} pointerEvents="none">
                    <rect x={-20} y={-12} width={40} height={22} rx={11} fill="#0b1020" stroke={RESOURCE_INFO[res].color} strokeWidth={1.5} />
                    <text x={-6} y={4} textAnchor="middle" className="payout-text" fill={RESOURCE_INFO[res].color}>
                      {short ? '✕' : `+${n}`}
                    </text>
                    <g transform="translate(3,-7) scale(0.55)">
                      <ResourceGlyph type={res} color={RESOURCE_INFO[res].color} />
                    </g>
                  </g>
                );
              });
          })}
    </svg>
  );
}
