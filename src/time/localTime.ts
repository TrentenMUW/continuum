// Wall-clock ↔ instant conversion with RFC 5545 rules for DST edges (D3).

import { TZDate, tzOffset } from "@date-fns/tz";

/** Local date-time fields with no zone attached ("floating"). Month is 1-12. */
export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const HALF_DAY = 12 * 3_600_000;

/** The wall time as if it were UTC: handy for exact wall-clock arithmetic. */
export function wallAsUtc(w: WallTime): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
}

export function wallFromUtc(ms: number): WallTime {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

/** The wall time an instant shows in `zone`. */
export function wallOf(t: number, zone: string): WallTime {
  const z = new TZDate(t, zone);
  return {
    year: z.getFullYear(),
    month: z.getMonth() + 1,
    day: z.getDate(),
    hour: z.getHours(),
    minute: z.getMinutes(),
    second: z.getSeconds(),
  };
}

/**
 * The instant a wall time denotes in `zone`.
 * - Normal times have exactly one answer.
 * - Ambiguous times (fall back) use the FIRST occurrence.
 * - Nonexistent times (spring forward) move forward by the length of the gap, by
 *   reading them with the offset in force before the gap (RFC 5545 §3.3.5).
 */
export function wallToInstant(w: WallTime, zone: string): number {
  const asUtc = wallAsUtc(w);
  // Offsets in force on either side of any transition near this wall time (minutes east of UTC).
  const before = tzOffset(zone, new Date(asUtc - HALF_DAY));
  const after = tzOffset(zone, new Date(asUtc + HALF_DAY));

  const valid: number[] = [];
  for (const off of new Set([before, after])) {
    const t = asUtc - off * 60_000;
    if (tzOffset(zone, new Date(t)) === off) valid.push(t);
  }
  if (valid.length > 0) return Math.min(...valid);
  return asUtc - before * 60_000;
}
