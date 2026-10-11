import type { LogEntry } from '../engine/types';

/**
 * Newest turn first, each under its own "Turn N" heading, with that turn's events in the order
 * they happened. (A turn marker is logged when the turn starts, so a flat reversed list would put
 * every heading below its own events.)
 */
export function logNewestTurnFirst(log: LogEntry[]): LogEntry[] {
  const groups: LogEntry[][] = [];
  for (const e of log) {
    if (e.kind === 'turn' || groups.length === 0) groups.push([]);
    groups[groups.length - 1].push(e);
  }
  return groups.reverse().flat();
}
