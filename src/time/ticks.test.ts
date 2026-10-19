import { describe, expect, it } from "vitest";
import { calDateOf, startOfCalDate } from "./calDate";
import { chooseLevel, formatTick, generateTicks, MIN_TICK_SPACING_PX, rulerTicks, TICK_LEVELS } from "./ticks";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "./viewport";

const LA = "America/Los_Angeles";
const H = HOUR_MS;

/** Durations between consecutive ticks, keyed by the calendar date of the first. */
function dayLengths(start: string, end: string, zone: string): Record<string, number> {
  const ticks = generateTicks("day", startOfCalDate(start, zone), startOfCalDate(end, zone), zone);
  const out: Record<string, number> = {};
  for (let i = 0; i + 1 < ticks.length; i++) out[calDateOf(ticks[i]!, zone)] = ticks[i + 1]! - ticks[i]!;
  return out;
}

describe("day ticks across DST (Pacific)", () => {
  it("Sun Nov 1, 2026 is 25 hours; its neighbors are 24", () => {
    const len = dayLengths("2026-10-30", "2026-11-04", LA);
    expect(len["2026-10-31"]).toBe(24 * H);
    expect(len["2026-11-01"]).toBe(25 * H);
    expect(len["2026-11-02"]).toBe(24 * H);
  });

  it("Sun Mar 14, 2027 is 23 hours; its neighbors are 24", () => {
    const len = dayLengths("2027-03-12", "2027-03-17", LA);
    expect(len["2027-03-13"]).toBe(24 * H);
    expect(len["2027-03-14"]).toBe(23 * H);
    expect(len["2027-03-15"]).toBe(24 * H);
  });

  it("puts every day tick at local midnight", () => {
    const ticks = generateTicks("day", Date.UTC(2026, 9, 25), Date.UTC(2026, 10, 10), LA);
    for (const t of ticks) expect(formatTick("hour", t, LA)).toBe("00:00");
  });
});

describe("leap years and month lengths", () => {
  it("Feb 29, 2028 exists and Feb 2027 ends on the 28th", () => {
    const feb2028 = generateTicks("day", startOfCalDate("2028-02-27", LA), startOfCalDate("2028-03-02", LA), LA).map(
      (t) => calDateOf(t, LA),
    );
    expect(feb2028).toEqual(["2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01", "2028-03-02"]);

    const feb2027 = generateTicks("day", startOfCalDate("2027-02-27", LA), startOfCalDate("2027-03-01", LA), LA).map(
      (t) => calDateOf(t, LA),
    );
    expect(feb2027).toEqual(["2027-02-27", "2027-02-28", "2027-03-01"]);
  });

  it("month ticks fall on the 1st, and month lengths are 31/28/31/30 …", () => {
    const ticks = generateTicks("month", startOfCalDate("2027-01-01", "UTC"), startOfCalDate("2028-01-01", "UTC"), "UTC");
    expect(ticks.map((t) => calDateOf(t, "UTC").slice(8))).toEqual(Array(13).fill("01"));
    const days = ticks.slice(1).map((t, i) => (t - ticks[i]!) / DAY_MS);
    expect(days).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  });

  it("month boundaries stay at local midnight across DST in Pacific time", () => {
    const ticks = generateTicks("month", startOfCalDate("2026-09-01", LA), startOfCalDate("2027-05-01", LA), LA);
    for (const t of ticks) {
      expect(calDateOf(t, LA).slice(8)).toBe("01");
      expect(formatTick("hour", t, LA)).toBe("00:00");
    }
  });

  it("year, 5-year, and decade ticks land on Jan 1", () => {
    const start = startOfCalDate("2026-06-01", LA);
    const end = startOfCalDate("2101-01-02", LA);
    expect(generateTicks("year", start, end, LA).map((t) => calDateOf(t, LA))).toContain("2065-01-01");
    expect(generateTicks("5y", start, end, LA).map((t) => calDateOf(t, LA)).slice(0, 3)).toEqual([
      "2030-01-01", "2035-01-01", "2040-01-01",
    ]);
    expect(generateTicks("decade", start, end, LA).map((t) => calDateOf(t, LA)).at(-1)).toBe("2100-01-01");
  });
});

describe("week ticks", () => {
  it("start on Monday, including across a month boundary and DST", () => {
    const ticks = generateTicks("week", startOfCalDate("2026-10-20", LA), startOfCalDate("2026-11-30", LA), LA);
    expect(ticks.map((t) => calDateOf(t, LA))).toEqual(["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]);
    for (const t of ticks) expect(formatTick("day", t, LA).startsWith("Mon")).toBe(true);
  });
});

describe("sub-day ticks", () => {
  it("fall-back night has two 01:00 hour ticks, 25 in all", () => {
    const ticks = generateTicks("hour", startOfCalDate("2026-11-01", LA), startOfCalDate("2026-11-02", LA) - 1, LA);
    expect(ticks).toHaveLength(25);
    expect(ticks.map((t) => formatTick("hour", t, LA)).filter((l) => l === "01:00")).toHaveLength(2);
  });

  it("spring-forward night has no 02:00 tick, 23 in all", () => {
    const ticks = generateTicks("hour", startOfCalDate("2027-03-14", LA), startOfCalDate("2027-03-15", LA) - 1, LA);
    expect(ticks).toHaveLength(23);
    expect(ticks.map((t) => formatTick("hour", t, LA))).not.toContain("02:00");
  });

  it("hour ticks follow local hours in a half-hour-offset zone", () => {
    const zone = "Asia/Kolkata"; // UTC+5:30
    const ticks = generateTicks("hour", Date.UTC(2026, 9, 18, 0, 0), Date.UTC(2026, 9, 18, 6, 0), zone);
    for (const t of ticks) {
      expect(formatTick("hour", t, zone).endsWith(":00")).toBe(true);
      expect(new Date(t).getUTCMinutes()).toBe(30);
    }
  });

  it("6-hour ticks fall at 00, 06, 12, 18 local", () => {
    const ticks = generateTicks("6h", startOfCalDate("2026-10-18", LA), startOfCalDate("2026-10-20", LA), LA);
    expect(ticks.map((t) => formatTick("6h", t, LA))).toEqual(["00:00", "06:00", "12:00", "18:00", "00:00", "06:00", "12:00", "18:00", "00:00"]);
  });

  it("5-minute ticks are 5 minutes apart", () => {
    const start = Date.UTC(2026, 9, 18, 16, 2);
    const ticks = generateTicks("5min", start, start + HOUR_MS, LA);
    expect(ticks).toHaveLength(12);
    ticks.slice(1).forEach((t, i) => expect(t - ticks[i]!).toBe(5 * MINUTE_MS));
  });
});

describe("level choice", () => {
  it("picks the finest level with ticks at least ~80 px apart", () => {
    const pxPerMs = (spanMs: number) => 1600 / spanMs;
    expect(chooseLevel(pxPerMs(10 * MINUTE_MS))).toBe("minute");
    expect(chooseLevel(pxPerMs(3 * DAY_MS))).toBe("6h"); // 3 h would be ~67 px apart
    expect(chooseLevel(pxPerMs(2 * DAY_MS))).toBe("3h");
    expect(chooseLevel(pxPerMs(20 * DAY_MS))).toBe("day"); // 80 px per day
    expect(chooseLevel(pxPerMs(30 * DAY_MS))).toBe("week"); // a day would be ~53 px
    expect(chooseLevel(pxPerMs(365 * DAY_MS))).toBe("month");
    expect(chooseLevel(pxPerMs(20 * 365.25 * DAY_MS))).toBe("year");
    expect(chooseLevel(pxPerMs(40 * 365.25 * DAY_MS))).toBe("5y"); // a year would be 40 px
    expect(chooseLevel(pxPerMs(150 * 365.25 * DAY_MS))).toBe("decade");
  });

  it("changes level monotonically with scale", () => {
    let last = -1;
    for (let span = 10 * MINUTE_MS; span < 150 * 365 * DAY_MS; span *= 1.3) {
      const i = TICK_LEVELS.indexOf(chooseLevel(1600 / span));
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
    }
  });

  it("rulerTicks pairs minor ticks with a coarser context level", () => {
    const scale = 1600 / (3 * DAY_MS);
    const r = rulerTicks(scale, startOfCalDate("2026-10-18", LA), startOfCalDate("2026-10-21", LA), LA);
    expect(r.level).toBe("6h");
    expect(r.major).toBe("day");
    expect(r.majors.map((m) => m.label)).toEqual(["Sun 18 Oct 2026", "Mon 19 Oct 2026", "Tue 20 Oct 2026", "Wed 21 Oct 2026"]);
    expect(MIN_TICK_SPACING_PX).toBe(80);
  });
});

describe("calendar dates", () => {
  it("places 2065-01-01 at local midnight in the display zone", () => {
    expect(new Date(startOfCalDate("2065-01-01", LA)).toISOString()).toBe("2065-01-01T08:00:00.000Z");
    expect(new Date(startOfCalDate("2065-01-01", "UTC")).toISOString()).toBe("2065-01-01T00:00:00.000Z");
  });
});
