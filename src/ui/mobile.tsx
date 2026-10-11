import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Subscribe to a CSS media query. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** Phones and small tablets (portrait), and phones in landscape. */
export const COMPACT_QUERY = '(max-width: 820px), (max-height: 520px)';

export const ZOOM_LEVELS = [1, 1.5, 2.2];

/**
 * Scrollable board viewport for touch screens: the board is drawn larger than the viewport
 * at higher zoom levels and the player pans with native one-finger scrolling. Pinch-zoom is
 * disabled inside the viewport (touch-action) so the page itself never zooms by accident.
 */
export function ZoomableBoard({ zoom, children }: { zoom: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef(zoom);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ratio = zoom / prev.current;
    prev.current = zoom;
    if (ratio === 1) return;
    // Keep the point at the center of the viewport centered after zooming.
    const cx = el.scrollLeft + el.clientWidth / 2;
    const cy = el.scrollTop + el.clientHeight / 2;
    el.scrollLeft = cx * ratio - el.clientWidth / 2;
    el.scrollTop = cy * ratio - el.clientHeight / 2;
  }, [zoom]);
  return (
    <div className={`m-board-scroll${zoom > 1 ? ' zoomed' : ''}`} ref={ref}>
      <div className="m-board-inner" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
        {children}
      </div>
    </div>
  );
}

/** Bottom sheet used for the build menu, cards, activity, market and menu on phones. */
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay sheet-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header className="sheet-head">
          <span className="sheet-grip" aria-hidden="true" />
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
