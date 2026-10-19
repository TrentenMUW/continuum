/**
 * D11: an interval split at Now into the part already past and the part still ahead.
 * Computed at render time and never stored.
 */
export interface PastSplit {
  past: [number, number] | null;
  future: [number, number] | null;
}

export function splitAtNow(start: number, end: number, now: number): PastSplit {
  if (end <= now) return { past: [start, end], future: null };
  if (start >= now) return { past: null, future: [start, end] };
  return { past: [start, now], future: [now, end] };
}
