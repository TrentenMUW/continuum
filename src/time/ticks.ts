// Calendar-true tick generation (§5.2). Every boundary is a real local boundary in
// the display zone, found by calendar arithmetic, never by adding a fixed day/month length.

import { TZDate, tzOffset } from "@date-fns/tz";
import { format } from "date-fns";
import { DAY_MS, HOUR_MS, MINUTE_MS, YEAR_MS } from "./viewport";

export type TickLevel =
  | "minute"
  | "5min"
  | "15min"
  | "hour"
  | "3h"
  | "6h"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "5y"
  | "decade";

export const TICK_LEVELS: readonly TickLevel[] = [
  "minute", "5min", "15min", "hour", "3h", "6h", "day", "week", "month", "quarter", "year", "5y", "decade",
];

/** Typical length of one step, used only to choose a level, never for positions. */
const NOMINAL_MS: Record<TickLevel, number> = {
  minute: MINUTE_MS,
  "5min": 5 * MINUTE_MS,
  "15min": 15 * MINUTE_MS,
  hour: HOUR_MS,
  "3h": 3 * HOUR_MS,
  "6h": 6 * HOUR_MS,
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: YEAR_MS / 12,
  quarter: YEAR_MS / 4,
  year: YEAR_MS,
  "5y": 5 * YEAR_MS,
  decade: 10 * YEAR_MS,
};

/** Sub-day levels as a number of local minutes. */
const SUB_DAY_MINUTES: Partial<Record<TickLevel, number>> = {
  minute: 1,
  "5min": 5,
  "15min": 15,
  hour: 60,
  "3h": 180,
  "6h": 360,
};

export const MIN_TICK_SPACING_PX = 80;

/** The finest level whose ticks are at least ~80 px apart. */
export function chooseLevel(scale: number, minSpacingPx = MIN_TICK_SPACING_PX): TickLevel {
  for (const level of TICK_LEVELS) {
    if (NOMINAL_MS[level] * scale >= minSpacingPx) return level;
  }
  return "decade";
}

/** The coarser level whose boundaries give context (dates above hours, and so on). */
export function majorLevelFor(level: TickLevel): TickLevel | null {
  switch (level) {
    case "minute":
    case "5min":
    case "15min":
    case "hour":
    case "3h":
    case "6h":
      return "day";
    case "day":
    case "week":
      return "month";
    case "month":
    case "quarter":
      return "year";
    case "year":
      return "decade";
    case "5y":
    case "decade":
      return null;
  }
}

export interface Tick {
  t: number; // epoch ms
  label: string;
}

/** All ticks of `level` with start ≤ t ≤ end, in `zone`. */
export function generateTicks(level: TickLevel, start: number, end: number, zone: string, weekStartsOn: 1 = 1): number[] {
  const subDay = SUB_DAY_MINUTES[level];
  if (subDay !== undefined) return subDayTicks(subDay, start, end, zone);

  const out: number[] = [];
  let d = floorCalendar(level, new TZDate(start, zone), weekStartsOn);
  // Guard against pathological zones; a 150-year window at day level is far beyond any real use.
  for (let i = 0; i < 100_000 && d.getTime() <= end; i++) {
    if (d.getTime() >= start) out.push(d.getTime());
    d = stepCalendar(level, d);
  }
  return out;
}

/**
 * Sub-day ticks: walk real time in steps that can't skip a local boundary and keep
 * instants whose local minute-of-day is a multiple of the level. A DST gap simply has
 * no tick for the missing hour; a repeated hour gets two ticks (two real instants).
 */
function subDayTicks(levelMinutes: number, start: number, end: number, zone: string): number[] {
  // Offsets are multiples of 15 min in every current zone, and whole hours in most.
  const wholeHourZone =
    tzOffset(zone, new Date(start)) % 60 === 0 && tzOffset(zone, new Date(end)) % 60 === 0;
  const stepMin = Math.min(levelMinutes, levelMinutes >= 60 && wholeHourZone ? 60 : 15);
  const step = stepMin * MINUTE_MS;

  const out: number[] = [];
  for (let t = Math.ceil(start / step) * step; t <= end; t += step) {
    const z = new TZDate(t, zone);
    if ((z.getHours() * 60 + z.getMinutes()) % levelMinutes === 0) out.push(t);
  }
  return out;
}

function floorCalendar(level: TickLevel, d: TZDate, weekStartsOn: 1): TZDate {
  const zone = d.timeZone!;
  const y = d.getFullYear();
  switch (level) {
    case "day":
      return TZDate.tz(zone, y, d.getMonth(), d.getDate());
    case "week": {
      const back = (d.getDay() - weekStartsOn + 7) % 7;
      return TZDate.tz(zone, y, d.getMonth(), d.getDate() - back);
    }
    case "month":
      return TZDate.tz(zone, y, d.getMonth(), 1);
    case "quarter":
      return TZDate.tz(zone, y, d.getMonth() - (d.getMonth() % 3), 1);
    case "year":
      return TZDate.tz(zone, y, 0, 1);
    case "5y":
      return TZDate.tz(zone, y - mod(y, 5), 0, 1);
    case "decade":
      return TZDate.tz(zone, y - mod(y, 10), 0, 1);
    default:
      throw new Error(`not a calendar level: ${level}`);
  }
}

function stepCalendar(level: TickLevel, d: TZDate): TZDate {
  const zone = d.timeZone!;
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (level) {
    case "day":
      return TZDate.tz(zone, y, m, d.getDate() + 1);
    case "week":
      return TZDate.tz(zone, y, m, d.getDate() + 7);
    case "month":
      return TZDate.tz(zone, y, m + 1, 1);
    case "quarter":
      return TZDate.tz(zone, y, m + 3, 1);
    case "year":
      return TZDate.tz(zone, y + 1, 0, 1);
    case "5y":
      return TZDate.tz(zone, y + 5, 0, 1);
    case "decade":
      return TZDate.tz(zone, y + 10, 0, 1);
    default:
      throw new Error(`not a calendar level: ${level}`);
  }
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

const MINOR_FORMAT: Record<TickLevel, string> = {
  minute: "HH:mm",
  "5min": "HH:mm",
  "15min": "HH:mm",
  hour: "HH:mm",
  "3h": "HH:mm",
  "6h": "HH:mm",
  day: "EEE d",
  week: "d MMM",
  month: "MMM",
  quarter: "QQQ",
  year: "yyyy",
  "5y": "yyyy",
  decade: "yyyy",
};

const MAJOR_FORMAT: Partial<Record<TickLevel, string>> = {
  day: "EEE d MMM yyyy",
  month: "MMMM yyyy",
  year: "yyyy",
  decade: "yyyy's'",
};

export function formatTick(level: TickLevel, t: number, zone: string, major = false): string {
  const fmt = (major ? MAJOR_FORMAT[level] : undefined) ?? MINOR_FORMAT[level];
  return format(new TZDate(t, zone), fmt);
}

export interface RulerTicks {
  level: TickLevel;
  major: TickLevel | null;
  minor: Tick[];
  majors: Tick[];
}

export function rulerTicks(scale: number, start: number, end: number, zone: string): RulerTicks {
  const level = chooseLevel(scale);
  const major = majorLevelFor(level);
  return {
    level,
    major,
    minor: generateTicks(level, start, end, zone).map((t) => ({ t, label: formatTick(level, t, zone) })),
    majors: major
      ? generateTicks(major, start, end, zone).map((t) => ({ t, label: formatTick(major, t, zone, true) }))
      : [],
  };
}
