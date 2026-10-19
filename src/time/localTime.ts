// Wall-clock ↔ instant conversion with RFC 5545 rules for DST edges (D3).

import { TZDate, tzOffset, tzScan } from "@date-fns/tz";

/**
 * UTC offset (minutes east) of `zone` at instant `t`: the same answer as `tzOffset`,
 * from a per-zone, per-year table of transitions. Offsets change a few times a year at
 * most, so this replaces an Intl call per lookup with a short array scan (§7).
 */
interface OffsetTable {
  from: number; // UTC year start
  to: number;
  start: number; // offset at `from`
  changes: Array<{ at: number; offset: number }>;
}
const offsetTables = new Map<string, Map<number, OffsetTable>>();
/** The table used last for each zone: consecutive lookups almost always hit it. */
const lastTable = new Map<string, OffsetTable>();

export function offsetAt(zone: string, t: number): number {
  let table = lastTable.get(zone);
  if (!table || t < table.from || t >= table.to) {
    const year = new Date(t).getUTCFullYear();
    let byYear = offsetTables.get(zone);
    if (!byYear) offsetTables.set(zone, (byYear = new Map()));
    table = byYear.get(year);
    if (!table) {
      const from = Date.UTC(year, 0, 1);
      const to = Date.UTC(year + 1, 0, 1);
      table = {
        from,
        to,
        start: tzOffset(zone, new Date(from)),
        changes: tzScan(zone, { start: new Date(from), end: new Date(to) }).map((c) => ({ at: c.date.getTime(), offset: c.offset })),
      };
      byYear.set(year, table);
    }
    lastTable.set(zone, table);
  }
  let offset = table.start;
  for (const c of table.changes) {
    if (c.at <= t) offset = c.offset;
    else break;
  }
  return offset;
}

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
  const before = offsetAt(zone, asUtc - HALF_DAY);
  const after = offsetAt(zone, asUtc + HALF_DAY);

  const valid: number[] = [];
  for (const off of before === after ? [before] : [before, after]) {
    const t = asUtc - off * 60_000;
    if (offsetAt(zone, t) === off) valid.push(t);
  }
  if (valid.length > 0) return Math.min(...valid);
  return asUtc - before * 60_000;
}
