import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../data/types";
import { wallOf } from "./localTime";
import { EventIndex } from "../data/index";
import { densityRuns } from "./density";
import { ExpansionCache, expandSeries, seriesCoverage } from "./recurrence";
import { makeRenderWindow, viewportAt } from "./viewport";

const LA = "America/Los_Angeles";
const DAY = 86_400_000;
const H = 3_600_000;

function series(rrule: string, extra: Partial<CalendarEvent> = {}, exdates: string[] = []): CalendarEvent {
  return {
    id: "s1",
    title: "Class",
    allDay: false,
    start: "2026-10-19T16:00:00.000Z", // Mon 19 Oct 2026, 09:00 PDT
    end: "2026-10-19T17:00:00.000Z",
    timeZone: LA,
    categoryIds: ["edu"],
    recurrence: { rrule, exdates },
    source: "manual",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...extra,
  };
}

const range = (a: string, b: string) => [Date.parse(a), Date.parse(b)] as const;
const localHM = (t: number, zone = LA) => {
  const w = wallOf(t, zone);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")} ${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
};

describe("expandSeries: wall-clock time across DST (D3)", () => {
  it("a weekly Monday 9:00 class stays at 9:00 local on both sides of Nov 1, 2026", () => {
    const occ = expandSeries(series("FREQ=WEEKLY;BYDAY=MO"), ...range("2026-10-18T00:00:00Z", "2026-11-17T00:00:00Z"), LA);
    expect(occ.map((o) => localHM(o.start))).toEqual([
      "2026-10-19 09:00",
      "2026-10-26 09:00",
      "2026-11-02 09:00",
      "2026-11-09 09:00",
      "2026-11-16 09:00",
    ]);
    // …which means the UTC time shifts by an hour after the transition.
    expect(new Date(occ[1]!.start).toISOString()).toBe("2026-10-26T16:00:00.000Z");
    expect(new Date(occ[2]!.start).toISOString()).toBe("2026-11-02T17:00:00.000Z");
    expect(occ.every((o) => o.end - o.start === H)).toBe(true);
  });

  it("a daily 02:30 event moves forward by the gap on the spring-forward day", () => {
    const s = series("FREQ=DAILY;COUNT=3", { start: "2027-03-13T10:30:00.000Z", end: "2027-03-13T11:00:00.000Z" }); // 02:30 PST
    const occ = expandSeries(s, ...range("2027-03-12T00:00:00Z", "2027-03-20T00:00:00Z"), LA);
    expect(occ.map((o) => localHM(o.start))).toEqual(["2027-03-13 02:30", "2027-03-14 03:30", "2027-03-15 02:30"]);
  });

  it("a daily 01:30 event uses the first 01:30 on the fall-back day", () => {
    const s = series("FREQ=DAILY;COUNT=3", { start: "2026-10-31T08:30:00.000Z", end: "2026-10-31T09:00:00.000Z" }); // 01:30 PDT
    const occ = expandSeries(s, ...range("2026-10-30T00:00:00Z", "2026-11-05T00:00:00Z"), LA);
    expect(occ.map((o) => new Date(o.start).toISOString())).toEqual([
      "2026-10-31T08:30:00.000Z",
      "2026-11-01T08:30:00.000Z", // first 01:30 (still PDT)
      "2026-11-02T09:30:00.000Z", // PST
    ]);
  });

  it("keeps wall-clock length for an overnight event that spans the fall-back night", () => {
    // Sleep 23:00–07:00 is 9 real hours on the night the clocks fall back.
    const s = series("FREQ=DAILY", { start: "2026-10-31T06:00:00.000Z", end: "2026-10-31T14:00:00.000Z" }); // Oct 30 23:00 → Oct 31 07:00 PDT
    const occ = expandSeries(s, ...range("2026-10-31T00:00:00Z", "2026-11-02T00:00:00Z"), LA);
    const night = occ.find((o) => localHM(o.start) === "2026-10-31 23:00")!;
    expect(localHM(night.end)).toBe("2026-11-01 07:00");
    expect(night.end - night.start).toBe(9 * H);
  });
});

describe("expandSeries: COUNT, UNTIL, EXDATE", () => {
  it("COUNT limits the number of occurrences", () => {
    const occ = expandSeries(series("FREQ=DAILY;COUNT=4"), ...range("2026-10-01T00:00:00Z", "2027-01-01T00:00:00Z"), LA);
    expect(occ).toHaveLength(4);
  });

  it("COUNT counts occurrences removed by EXDATE (RFC 5545)", () => {
    const occ = expandSeries(
      series("FREQ=DAILY;COUNT=4", {}, ["2026-10-20T16:00:00.000Z"]),
      ...range("2026-10-01T00:00:00Z", "2027-01-01T00:00:00Z"),
      LA,
    );
    expect(occ.map((o) => localHM(o.start))).toEqual(["2026-10-19 09:00", "2026-10-21 09:00", "2026-10-22 09:00"]);
  });

  it("UNTIL as a UTC instant is inclusive", () => {
    const occ = expandSeries(series("FREQ=DAILY;UNTIL=20261022T160000Z"), ...range("2026-10-01T00:00:00Z", "2027-01-01T00:00:00Z"), LA);
    expect(occ.map((o) => localHM(o.start))).toEqual(["2026-10-19 09:00", "2026-10-20 09:00", "2026-10-21 09:00", "2026-10-22 09:00"]);
  });

  it("UNTIL as a date includes that whole local day", () => {
    const occ = expandSeries(series("FREQ=DAILY;UNTIL=20261021"), ...range("2026-10-01T00:00:00Z", "2027-01-01T00:00:00Z"), LA);
    expect(occ).toHaveLength(3);
  });

  it("skips EXDATEs and keys replaced by overrides", () => {
    const s = series("FREQ=WEEKLY;BYDAY=MO", {}, ["2026-10-26T16:00:00.000Z"]);
    const occ = expandSeries(s, ...range("2026-10-18T00:00:00Z", "2026-11-17T00:00:00Z"), LA, new Set(["2026-11-09T17:00:00.000Z"]));
    expect(occ.map((o) => localHM(o.start))).toEqual(["2026-10-19 09:00", "2026-11-02 09:00", "2026-11-16 09:00"]);
  });

  it("only returns occurrences overlapping the window", () => {
    const occ = expandSeries(series("FREQ=DAILY"), ...range("2026-10-25T16:30:00Z", "2026-10-27T16:00:00Z"), LA);
    expect(occ.map((o) => localHM(o.start))).toEqual(["2026-10-25 09:00", "2026-10-26 09:00"]);
  });
});

describe("expandSeries: calendar edge cases", () => {
  it("a yearly Feb 29 series occurs only in leap years (RFC 5545 skips invalid dates)", () => {
    const s = series("FREQ=YEARLY", { allDay: true, start: undefined, end: undefined, startDate: "2028-02-29", endDate: "2028-03-01" });
    const occ = expandSeries(s, ...range("2028-01-01T00:00:00Z", "2041-01-01T00:00:00Z"), LA);
    expect(occ.map((o) => o.key)).toEqual(["2028-02-29", "2032-02-29", "2036-02-29", "2040-02-29"]);
  });

  it("a monthly series on the 31st skips shorter months", () => {
    const s = series("FREQ=MONTHLY", { start: "2027-01-31T17:00:00.000Z", end: "2027-01-31T18:00:00.000Z" });
    const occ = expandSeries(s, ...range("2027-01-01T00:00:00Z", "2027-08-01T00:00:00Z"), LA);
    expect(occ.map((o) => localHM(o.start).slice(0, 10))).toEqual(["2027-01-31", "2027-03-31", "2027-05-31", "2027-07-31"]);
  });

  it("all-day occurrences span local midnight to midnight in the display zone", () => {
    const s = series("FREQ=WEEKLY;COUNT=2", { allDay: true, start: undefined, end: undefined, startDate: "2026-10-30", endDate: "2026-11-02" });
    const occ = expandSeries(s, ...range("2026-10-01T00:00:00Z", "2026-12-01T00:00:00Z"), LA);
    expect(occ.map((o) => o.key)).toEqual(["2026-10-30", "2026-11-06"]);
    // Fri–Sun inclusive across the fall-back night: 3 days and one extra hour.
    expect(occ[0]!.end - occ[0]!.start).toBe(3 * DAY + H);
  });

  it("interval 2 weekly keeps its phase", () => {
    const occ = expandSeries(series("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO"), ...range("2026-10-18T00:00:00Z", "2026-11-30T00:00:00Z"), LA);
    // The window ends at 2026-11-30T00:00Z, before that Monday's 09:00 class.
    expect(occ.map((o) => localHM(o.start).slice(0, 10))).toEqual(["2026-10-19", "2026-11-02", "2026-11-16"]);
  });
});

describe("expandSeries: jumping ahead", () => {
  it("gives the same occurrences as a full iteration for a far-future window", () => {
    for (const rule of ["FREQ=DAILY", "FREQ=DAILY;INTERVAL=3", "FREQ=WEEKLY;BYDAY=MO,WE,FR", "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU"]) {
      const s = series(rule);
      const [from, to] = range("2060-03-01T00:00:00Z", "2060-04-15T00:00:00Z");
      const fast = expandSeries(s, from, to, LA);
      // Force a full iteration by adding a huge COUNT, which disables the jump.
      const full = expandSeries(series(`${rule};COUNT=200000`), from, to, LA);
      expect(fast.map((o) => o.key), rule).toEqual(full.map((o) => o.key));
      expect(fast.length, rule).toBeGreaterThan(0);
    }
  });

  it("expands an endless daily series in 2060 quickly", () => {
    const s = series("FREQ=DAILY");
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) expandSeries(s, ...range("2060-06-01T00:00:00Z", "2060-06-10T00:00:00Z"), LA);
    expect((performance.now() - t0) / 20).toBeLessThan(20);
  });
});

describe("seriesCoverage (wide-zoom summary)", () => {
  const YEAR = 365.25 * DAY;
  const run = series("FREQ=DAILY", { start: "2026-10-19T14:00:00.000Z", end: "2026-10-19T14:45:00.000Z" }); // 07:00–07:45

  it("summarizes a dense daily series as its average coverage", () => {
    const b = seriesCoverage(run, Date.parse("2000-01-01T00:00:00Z"), Date.parse("2150-01-01T00:00:00Z"), 45 * DAY, LA)!;
    expect(b.coverage).toBeCloseTo(45 / 1440, 9);
    expect(b.start).toBe(Date.parse(run.start!)); // nothing before the series starts
    expect(b.end).toBe(Date.parse("2150-01-01T00:00:00Z"));
  });

  it("weekly coverage counts the chosen days", () => {
    const b = seriesCoverage(series("FREQ=WEEKLY;BYDAY=MO,WE,FR"), 0, Date.parse("2100-01-01T00:00:00Z"), 30 * DAY, LA)!;
    expect(b.coverage).toBeCloseTo((3 * H) / (7 * DAY), 9);
  });

  it("ends at UNTIL", () => {
    const b = seriesCoverage(series("FREQ=DAILY;UNTIL=20301231T235959Z"), 0, Date.parse("2100-01-01T00:00:00Z"), 30 * DAY, LA)!;
    expect(b.end).toBe(Date.parse("2030-12-31T23:59:59Z") + H);
  });

  it("declines when a pixel holds less than one gap, for COUNT rules, and for complex rules", () => {
    expect(seriesCoverage(run, 0, 1e13, 0.5 * DAY, LA)).toBeNull();
    expect(seriesCoverage(series("FREQ=DAILY;COUNT=10"), 0, 1e13, 30 * DAY, LA)).toBeNull();
    expect(seriesCoverage(series("FREQ=MONTHLY;BYDAY=2TU"), 0, 1e13, 300 * DAY, LA)).toBeNull();
    expect(seriesCoverage(series("FREQ=WEEKLY;INTERVAL=4"), 0, 1e13, 20 * DAY, LA)).toBeNull(); // gap 28 days > 20 days/px
  });

  it("draws the same density as full expansion where both apply", () => {
    // 10 years at ~3 days per pixel: compare per-column opacity from the band and from every occurrence.
    const sleep = series("FREQ=DAILY", { start: "2026-10-20T06:00:00.000Z", end: "2026-10-20T14:00:00.000Z" }); // 8 h
    const v = viewportAt(Date.parse("2030-01-01T00:00:00Z"), 0, 10 * YEAR, 1200);
    const rw = makeRenderWindow(v, 1200);
    const band = seriesCoverage(sleep, rw.winStart, rw.winEnd, 1 / rw.scale, LA)!;
    const fromBand = densityRuns([], rw, [band]);
    const fromAll = densityRuns(expandSeries(sleep, rw.winStart, rw.winEnd, LA).map((o) => [o.start, o.end] as [number, number]), rw);
    const opacityAt = (runs: typeof fromBand, x: number) => runs.find((r) => x >= r.x && x < r.x + r.width)?.opacity ?? 0;
    const first = fromAll[0]!.x + 2; // skip the partial first column
    for (let x = first; x < first + 1000; x += 37) {
      expect(Math.abs(opacityAt(fromBand, x) - opacityAt(fromAll, x)), `column ${x}`).toBeLessThanOrEqual(0.05);
    }
  });

  it("keeps a 450-year query with an endless daily series fast", () => {
    const idx = new EventIndex([run], LA);
    const t0 = performance.now();
    const occ = idx.query(Date.parse("1800-01-01T00:00:00Z"), Date.parse("2250-01-01T00:00:00Z"), 45 * DAY);
    expect(performance.now() - t0).toBeLessThan(20);
    expect(occ).toHaveLength(1);
    expect(occ[0]!.coverage).toBeCloseTo(45 / 1440, 9);
  });
});

describe("ExpansionCache", () => {
  it("returns the same occurrences as direct expansion, without duplicates across buckets", () => {
    const cache = new ExpansionCache();
    const s = series("FREQ=DAILY");
    const [from, to] = range("2026-11-03T05:00:00Z", "2026-11-20T05:00:00Z");
    const cached = cache.get(s, from, to, LA, new Set());
    expect(cached.map((o) => o.key)).toEqual(expandSeries(s, from, to, LA).map((o) => o.key));
    expect(cache.get(s, from, to, LA, new Set()).map((o) => o.key)).toEqual(cached.map((o) => o.key));
  });

  it("invalidates when the series changes", () => {
    const cache = new ExpansionCache();
    const [from, to] = range("2026-10-18T00:00:00Z", "2026-10-25T00:00:00Z");
    expect(cache.get(series("FREQ=DAILY"), from, to, LA, new Set())).toHaveLength(6);
    const edited = series("FREQ=DAILY", { updatedAt: "2026-10-02T00:00:00.000Z" }, ["2026-10-20T16:00:00.000Z"]);
    expect(cache.get(edited, from, to, LA, new Set())).toHaveLength(5);
  });
});
