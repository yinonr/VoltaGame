import type { Resource, TileType } from '../engine/types';
import { BARREN_INFO, RESOURCE_INFO } from '../engine/constants';

// Original, minimal SVG glyphs for each compute resource (24×24 grid).
export function ResourceGlyph({ type, color = 'currentColor', strokeWidth = 2 }: { type: TileType; color?: string; strokeWidth?: number }) {
  const common = { fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (type) {
    case 'power':
      return <path d="M13.5 2 L5 13.5 H11.5 L10.5 22 L19 10 H12.5 Z" fill={color} stroke={color} strokeWidth={1} strokeLinejoin="round" />;
    case 'networking':
      return (
        <g {...common}>
          <path d="M6 7 L18 7 M6 7 L12 18 M18 7 L12 18" />
          <circle cx="6" cy="7" r="2.8" fill={color} />
          <circle cx="18" cy="7" r="2.8" fill={color} />
          <circle cx="12" cy="18" r="2.8" fill={color} />
        </g>
      );
    case 'land':
      return (
        <g {...common}>
          <path d="M12 4 L21 9 L12 14 L3 9 Z" fill={color} fillOpacity={0.35} />
          <path d="M3 13 L12 18 L21 13" />
          <path d="M7.5 6.5 L16.5 11.5 M16.5 6.5 L7.5 11.5" strokeWidth={strokeWidth * 0.6} />
        </g>
      );
    case 'capital':
      return (
        <g {...common}>
          <ellipse cx="12" cy="6.5" rx="7" ry="2.8" fill={color} fillOpacity={0.35} />
          <path d="M5 6.5 V11 C5 12.6 8.1 13.8 12 13.8 C15.9 13.8 19 12.6 19 11 V6.5" />
          <path d="M5 11 V15.5 C5 17.1 8.1 18.3 12 18.3 C15.9 18.3 19 17.1 19 15.5 V11" />
        </g>
      );
    case 'gpu':
      return (
        <g {...common}>
          <rect x="6" y="6" width="12" height="12" rx="2" fill={color} fillOpacity={0.35} />
          <rect x="9.5" y="9.5" width="5" height="5" rx="1" fill={color} />
          <path d="M9 3 V6 M12 3 V6 M15 3 V6 M9 18 V21 M12 18 V21 M15 18 V21 M3 9 H6 M3 12 H6 M3 15 H6 M18 9 H21 M18 12 H21 M18 15 H21" />
        </g>
      );
    case 'barren':
      return (
        <g {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M6.5 17.5 L17.5 6.5" />
        </g>
      );
  }
}

export function ResourceIcon({ type, size = 18, color }: { type: TileType; size?: number; color?: string }) {
  const c = color ?? (type === 'barren' ? BARREN_INFO.color : RESOURCE_INFO[type].color);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="res-icon">
      <ResourceGlyph type={type} color={c} />
    </svg>
  );
}

export function ResourceChip({ type, count, dim = false, title }: { type: Resource; count?: number; dim?: boolean; title?: string }) {
  const info = RESOURCE_INFO[type];
  return (
    <span className={`res-chip${dim ? ' dim' : ''}`} style={{ ['--res' as string]: info.color }} title={title ?? info.label}>
      <ResourceIcon type={type} size={14} />
      {count !== undefined && <b>{count}</b>}
    </span>
  );
}

export function OutageGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.5 2 L5 13.5 H11.5 L10.5 22 L19 10 H12.5 Z" fill="#f87171" />
      <path d="M3 3 L21 21" stroke="#0b1020" strokeWidth={3.5} strokeLinecap="round" />
      <path d="M3 3 L21 21" stroke="#fca5a5" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

export function DieFace({ value, rolling }: { value: number; rolling?: boolean }) {
  const spots: Record<number, [number, number][]> = {
    1: [[12, 12]],
    2: [[7, 7], [17, 17]],
    3: [[7, 7], [12, 12], [17, 17]],
    4: [[7, 7], [17, 7], [7, 17], [17, 17]],
    5: [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]],
    6: [[7, 6.5], [17, 6.5], [7, 12], [17, 12], [7, 17.5], [17, 17.5]],
  };
  return (
    <svg className={`die${rolling ? ' rolling' : ''}`} width="44" height="44" viewBox="0 0 24 24" aria-label={`Die showing ${value}`}>
      <rect x="1" y="1" width="22" height="22" rx="5" className="die-body" />
      {(spots[value] ?? []).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.1" className="die-spot" />
      ))}
    </svg>
  );
}
