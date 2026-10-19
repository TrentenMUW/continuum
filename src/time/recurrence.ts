// Lazy recurrence expansion (D3). ical.js iterates occurrences as FLOATING wall-clock
// date-times; each is converted to an instant in the event's own IANA zone, so a weekly
// 9:00 class stays at 9:00 across DST. Nothing is ever stored per occurrence.

import ICAL from "ical.js";
import type { CalendarEvent, OccurrenceKey } from "../data/types";
import { addCalDays, calDateOf, parseCalDate, startOfCalDate } from "./calDate";
import { wallAsUtc, wallFromUtc, wallOf, wallToInstant, type WallTime } from "./localTime";
import { buildRRule, parseRRule, parseUntil, type Until } from "./rrule";

export interface ExpandedOccurrence {
  key: OccurrenceKey; // original start: Instant (timed) or CalDate (all-day)
  start: number;
  end: number;
}

const DAY_MS = 86_400_000;
/** Safety valve: never iterate more than this per expansion. */
export const MAX_ITERATIONS = 200_000;

const keyOfInstant = (t: number) => new Date(t).toISOString();

/**
 * ical.js rolls invalid dates over (a yearly Feb 29 series yields Mar 1 in common years),
 * but RFC 5545 says they're skipped. Making the month/day explicit and filtering on it
 * gives the RFC behavior.
 */
function normalizedRule(rrule: string, startMonth: number, startDay: number): { rule: string; parts: Map<string, string> } {
  const parts = parseRRule(rrule);
  parts.delete("UNTIL"); // enforced here, in the right zone (see expandSeries)
  const freq = parts.get("FREQ");
  const has = (...keys: string[]) => keys.some((k) => parts.has(k));
  if (freq === "YEARLY" && !has("BYMONTH", "BYWEEKNO", "BYYEARDAY", "BYMONTHDAY", "BYDAY")) {
    parts.set("BYMONTH", String(startMonth));
    parts.set("BYMONTHDAY", String(startDay));
  }
  if (freq === "MONTHLY" && !has("BYMONTHDAY", "BYDAY", "BYSETPOS")) {
    parts.set("BYMONTHDAY", String(startDay));
  }
  return { rule: buildRRule(parts), parts };
}

/** Reject anything ical.js yields that breaks a positive BYMONTH / BYMONTHDAY constraint. */
function matchesExplicitParts(parts: Map<string, string>, month: number, day: number): boolean {
  const months = parts.get("BYMONTH")?.split(",").map(Number);
  if (months && !months.includes(month)) return false;
  const days = parts.get("BYMONTHDAY")?.split(",").map(Number);
  if (days && days.every((d) => d > 0) && !days.includes(day)) return false;
  return true;
}

/** Days from one floating date to another (both as wall-as-UTC ms at midnight). */
const daysBetween = (a: number, b: number) => Math.round((b - a) / DAY_MS);

interface SeriesShape {
  allDay: boolean;
  startWall: WallTime; // timed: wall time in the event zone; all-day: the start date at 00:00
  wallDurationMs: number; // timed: wall-clock length; all-day: whole days × DAY_MS
}

function shapeOf(e: CalendarEvent): SeriesShape | null {
  if (e.allDay) {
    if (!e.startDate || !e.endDate) return null;
    const s = parseCalDate(e.startDate);
    const startWall = { year: s.year, month: s.month, day: s.day, hour: 0, minute: 0, second: 0 };
    const end = parseCalDate(e.endDate);
    const days = daysBetween(wallAsUtc(startWall), Date.UTC(end.year, end.month - 1, end.day));
    return { allDay: true, startWall, wallDurationMs: Math.max(1, days) * DAY_MS };
  }
  if (!e.start || !e.end) return null;
  const startWall = wallOf(Date.parse(e.start), e.timeZone);
  const endWall = wallOf(Date.parse(e.end), e.timeZone);
  return { allDay: false, startWall, wallDurationMs: wallAsUtc(endWall) - wallAsUtc(startWall) };
}

function untilAllows(until: Until | null, occ: ExpandedOccurrence, startWall: WallTime, allDay: boolean, zone: string): boolean {
  if (!until) return true;
  switch (until.kind) {
    case "instant":
      return occ.start <= until.t;
    case "date": {
      const occDate = allDay ? occ.key : calDateOf(occ.start, zone);
      return occDate <= until.date;
    }
    case "floating": {
      const wall = `${startWall.year}-${String(startWall.month).padStart(2, "0")}-${String(startWall.day).padStart(2, "0")}T${String(startWall.hour).padStart(2, "0")}:${String(startWall.minute).padStart(2, "0")}:${String(startWall.second).padStart(2, "0")}`;
      return wall <= until.wall;
    }
  }
}

/**
 * Occurrences of a series overlapping [from, to), skipping EXDATEs and any keys in
 * `skipKeys` (occurrences replaced by override records). All-day occurrences resolve in
 * `displayZone`; timed ones in the event's own zone.
 */
export function expandSeries(
  series: CalendarEvent,
  from: number,
  to: number,
  displayZone: string,
  skipKeys: ReadonlySet<string> = new Set(),
): ExpandedOccurrence[] {
  if (!series.recurrence) return [];
  const shape = shapeOf(series);
  if (!shape) return [];

  const { rule, parts } = normalizedRule(series.recurrence.rrule, shape.startWall.month, shape.startWall.day);
  const until = parseUntil(parseRRule(series.recurrence.rrule).get("UNTIL"));
  const exdates = new Set(series.recurrence.exdates);

  // Jump ahead for daily/weekly rules without COUNT, keeping the interval's phase, so a
  // window in 2060 doesn't iterate every day since 2026. Monthly/yearly are cheap anyway,
  // and ical.js mis-handles a start that doesn't match their BY-rules (see normalizedRule).
  let iterStart = shape.startWall;
  const freq = parts.get("FREQ");
  const interval = Math.max(1, Number(parts.get("INTERVAL") ?? 1));
  if (!parts.has("COUNT") && !parts.has("BYSETPOS") && (freq === "DAILY" || freq === "WEEKLY")) {
    const period = interval * (freq === "WEEKLY" ? 7 : 1);
    const zone = shape.allDay ? displayZone : series.timeZone;
    // Earliest start that could still overlap the window, with a day of slack for zone offsets.
    const target = wallOf(from - shape.wallDurationMs - 2 * DAY_MS, zone);
    const startMidnight = Date.UTC(shape.startWall.year, shape.startWall.month - 1, shape.startWall.day);
    const k = Math.floor(daysBetween(startMidnight, Date.UTC(target.year, target.month - 1, target.day)) / period);
    if (k > 0) iterStart = wallFromUtc(wallAsUtc(shape.startWall) + k * period * DAY_MS);
  }

  const dtstart = ICAL.Time.fromData({
    year: iterStart.year,
    month: iterStart.month,
    day: iterStart.day,
    hour: iterStart.hour,
    minute: iterStart.minute,
    second: iterStart.second,
    isDate: shape.allDay,
  });
  const it = ICAL.Recur.fromString(rule).iterator(dtstart);

  const out: ExpandedOccurrence[] = [];
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const next = it.next();
    if (!next) break;
    if (!matchesExplicitParts(parts, next.month, next.day)) continue;
    const wall: WallTime = {
      year: next.year,
      month: next.month,
      day: next.day,
      hour: shape.allDay ? 0 : next.hour,
      minute: shape.allDay ? 0 : next.minute,
      second: shape.allDay ? 0 : next.second,
    };

    let occ: ExpandedOccurrence;
    if (shape.allDay) {
      const date = `${wall.year}-${String(wall.month).padStart(2, "0")}-${String(wall.day).padStart(2, "0")}`;
      const endDate = addCalDays(date, shape.wallDurationMs / DAY_MS);
      occ = { key: date, start: startOfCalDate(date, displayZone), end: startOfCalDate(endDate, displayZone) };
    } else {
      const start = wallToInstant(wall, series.timeZone);
      const end = wallToInstant(wallFromUtc(wallAsUtc(wall) + shape.wallDurationMs), series.timeZone);
      occ = { key: keyOfInstant(start), start, end: Math.max(end, start) };
    }

    if (!untilAllows(until, occ, wall, shape.allDay, series.timeZone)) break;
    if (occ.start >= to) break;
    if (occ.end <= from) continue;
    if (exdates.has(occ.key) || skipKeys.has(occ.key)) continue;
    out.push(occ);
  }
  return out;
}

export interface SeriesCoverage {
  start: number;
  end: number;
  /** Average fraction of time the series' occurrences cover. */
  coverage: number;
}

const SUMMARY_PARTS = new Set(["FREQ", "INTERVAL", "BYDAY", "WKST", "UNTIL"]);
/**
 * Summarize once a pixel column spans at least this many of the rule's longest gaps.
 * Below this, expansion is bounded (a daily series' window is then under ~10 years).
 */
const SUMMARY_GAPS_PER_COLUMN = 1;

/**
 * At very wide zoom a simple daily or weekly series is a uniform haze: each pixel column
 * spans many occurrences, all narrower than a pixel. Its density there is the average
 * share of time it covers, so it can be drawn as one band instead of expanding (say)
 * 160,000 occurrences. Returns null when the series must be expanded individually:
 * COUNT rules, anything but simple DAILY/WEEKLY rules, or zooms where the per-column
 * count would vary noticeably. EXDATEs are ignored here: at this scale each one changes a
 * column's coverage by far less than one opacity step.
 */
export function seriesCoverage(series: CalendarEvent, from: number, to: number, msPerPx: number, displayZone: string): SeriesCoverage | null {
  if (!series.recurrence) return null;
  const shape = shapeOf(series);
  if (!shape) return null;
  const parts = parseRRule(series.recurrence.rrule);
  const freq = parts.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY") return null;
  if ([...parts.keys()].some((k) => !SUMMARY_PARTS.has(k))) return null;
  const days = parts.get("BYDAY")?.split(",") ?? [];
  if (days.some((d) => !/^(MO|TU|WE|TH|FR|SA|SU)$/.test(d))) return null;

  const interval = Math.max(1, Number(parts.get("INTERVAL") ?? 1));
  const maxGap = interval * (freq === "WEEKLY" ? 7 : 1) * DAY_MS;
  if (shape.wallDurationMs / msPerPx >= 1 || msPerPx < SUMMARY_GAPS_PER_COLUMN * maxGap) return null;

  const perPeriod = freq === "WEEKLY" ? Math.max(1, days.length) : 1;
  const coverage = Math.min(1, (perPeriod * shape.wallDurationMs) / maxGap);

  const seriesStart = shape.allDay ? startOfCalDate(series.startDate!, displayZone) : Date.parse(series.start!);
  const until = parseUntil(parts.get("UNTIL"));
  const seriesEnd =
    !until
      ? Infinity
      : until.kind === "instant"
        ? until.t + shape.wallDurationMs
        : until.kind === "date"
          ? startOfCalDate(addCalDays(until.date, 1), shape.allDay ? displayZone : series.timeZone) + shape.wallDurationMs
          : Date.parse(`${until.wall}Z`) + DAY_MS; // floating: within a day is far below a pixel here

  const start = Math.max(from, seriesStart);
  const end = Math.min(to, seriesEnd);
  return end > start ? { start, end, coverage } : { start, end: start, coverage: 0 };
}

/**
 * Per-series cache of expansions by window bucket (§7). Buckets are power-of-two
 * lengths at least as long as the query, so a window touches at most two of them.
 */
export class ExpansionCache {
  private entries = new Map<string, ExpandedOccurrence[]>();

  constructor(private readonly maxEntries = 2000) {}

  get(
    series: CalendarEvent,
    from: number,
    to: number,
    displayZone: string,
    skipKeys: ReadonlySet<string>,
  ): ExpandedOccurrence[] {
    const size = 2 ** Math.ceil(Math.log2(Math.max(1, to - from)));
    const first = Math.floor(from / size);
    const last = Math.floor((to - 1) / size);
    const skipSig = [...skipKeys].sort().join(",");
    const seen = new Set<string>();
    const out: ExpandedOccurrence[] = [];
    for (let b = first; b <= last; b++) {
      const key = `${series.id}|${series.updatedAt}|${displayZone}|${size}|${b}|${skipSig}`;
      let bucket = this.entries.get(key);
      if (bucket) {
        this.entries.delete(key); // refresh LRU position
      } else {
        bucket = expandSeries(series, b * size, (b + 1) * size, displayZone, skipKeys);
      }
      this.entries.set(key, bucket);
      for (const o of bucket) {
        if (o.end > from && o.start < to && !seen.has(o.key)) {
          seen.add(o.key);
          out.push(o);
        }
      }
    }
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
    return out;
  }

  clear(): void {
    this.entries.clear();
  }
}
