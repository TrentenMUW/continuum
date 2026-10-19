import { DAY_MS } from "./viewport";

/** D8: target spans. Snapping only picks one uniform scale; labels stay calendar-true. */
export const SNAP_TARGETS_MS: readonly number[] = [1 * DAY_MS, 7 * DAY_MS, 30.44 * DAY_MS, 365.25 * DAY_MS];

/** The target span to snap to, or null if `spanMs` isn't within `threshold` of any. */
export function snapTarget(spanMs: number, threshold: number): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const target of SNAP_TARGETS_MS) {
    const dist = Math.abs(spanMs / target - 1);
    if (dist <= threshold && dist < bestDist) {
      best = target;
      bestDist = dist;
    }
  }
  return best;
}
