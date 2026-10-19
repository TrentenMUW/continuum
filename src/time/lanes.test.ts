import { describe, expect, it } from "vitest";
import type { Occurrence } from "../data/index";
import type { CalendarEvent } from "../data/types";
import { densityRuns, mergeIntervals } from "./density";
import { assignRows, laneHeight, layoutLanes, ROW_HEIGHT } from "./lanes";
import { DAY_MS, HOUR_MS, MINUTE_MS, YEAR_MS, makeRenderWindow, viewportAt } from "./viewport";

const T = Date.UTC(2026, 9, 18, 12);
const W = 1000;

function occ(id: string, start: number, end: number, categoryIds: string[]): Occurrence {
  const event = { id, title: id, categoryIds } as CalendarEvent;
  return { event, start, end };
}

describe("assignRows (greedy)", () => {
  it("stacks overlapping items and reuses freed rows", () => {
    const items = [
      { start: 0, end: 10 },
      { start: 5, end: 15 },
      { start: 8, end: 20 },
      { start: 10, end: 12 }, // row 0 is free at 10
      { start: 16, end: 18 }, // row 0 is free again at 12
    ];
    const { rows, rowCount } = assignRows(items);
    expect(rows).toEqual([0, 1, 2, 0, 0]);
    expect(rowCount).toBe(3);
  });

  it("lets touching intervals share a row", () => {
    expect(assignRows([{ start: 0, end: 10 }, { start: 10, end: 20 }]).rowCount).toBe(1);
  });

  it("handles input that isn't sorted", () => {
    const { rows } = assignRows([{ start: 20, end: 30 }, { start: 0, end: 25 }]);
    expect(rows).toEqual([1, 0]);
  });
});

describe("layoutLanes", () => {
  const rw = makeRenderWindow(viewportAt(T, 250, DAY_MS, W), W);

  it("places a multi-category event in every lane at the same x and width (§5.5)", () => {
    const hike = occ("hike", T, T + 2 * HOUR_MS, ["health", "hobbies", "social"]);
    const { lanes } = layoutLanes([hike], ["sleep", "health", "hobbies", "social"], rw);
    const placed = lanes.flatMap((l) => l.rects.map((r) => ({ lane: l.categoryId, x: r.x, w: r.width, id: r.occ.event.id })));
    expect(placed.map((p) => p.lane)).toEqual(["health", "hobbies", "social"]);
    expect(new Set(placed.map((p) => `${p.x}|${p.w}`)).size).toBe(1);
    expect(placed.every((p) => p.id === "hike")).toBe(true);
    expect(placed[0]!.w).toBeCloseTo(2 * HOUR_MS * rw.scale, 9);
  });

  it("skips hidden or unknown categories but still draws the event in visible ones", () => {
    const e = occ("e", T, T + HOUR_MS, ["health", "hidden"]);
    const { lanes } = layoutLanes([e], ["health"], rw);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]!.rects).toHaveLength(1);
  });

  it("grows a lane only when its row count grows, with a minimum of one row", () => {
    const three = [0, 1, 2].map((i) => occ(`o${i}`, T + i * 10 * MINUTE_MS, T + HOUR_MS, ["work"]));
    const { lanes, totalHeight } = layoutLanes(three, ["sleep", "work"], rw);
    expect(lanes[0]!.height).toBe(laneHeight(1));
    expect(lanes[1]!.rowCount).toBe(3);
    expect(lanes[1]!.height).toBe(laneHeight(3));
    expect(lanes[1]!.top).toBe(laneHeight(1));
    expect(totalHeight).toBe(laneHeight(1) + laneHeight(3));
    expect(new Set(lanes[1]!.rects.map((r) => r.row))).toEqual(new Set([0, 1, 2]));
    expect(laneHeight(1)).toBeGreaterThan(ROW_HEIGHT);
  });

  it("shows titles only on rectangles wider than about 40 px", () => {
    const pxPerHour = HOUR_MS * rw.scale; // ~41.7 px
    const { lanes } = layoutLanes(
      [occ("wide", T, T + 2 * HOUR_MS, ["a"]), occ("thin", T + 3 * HOUR_MS, T + 3 * HOUR_MS + (30 / pxPerHour) * HOUR_MS, ["a"])],
      ["a"],
      rw,
    );
    const byId = Object.fromEntries(lanes[0]!.rects.map((r) => [r.occ.event.id, r.showTitle]));
    expect(byId).toEqual({ wide: true, thin: false });
  });

  it("clamps very long events to the window so coordinates stay small", () => {
    const decade = occ("decade", T - 5 * YEAR_MS, T + 5 * YEAR_MS, ["a"]);
    const { lanes } = layoutLanes([decade], ["a"], rw);
    const r = lanes[0]!.rects[0]!;
    expect(Math.abs(r.x)).toBeLessThan(3 * W);
    expect(r.width).toBeLessThan(4 * W);
  });

  it("turns events narrower than 1 px into density, not rectangles (D10)", () => {
    const wide = makeRenderWindow(viewportAt(T, 250, 40 * YEAR_MS, W), W);
    // 8 hours of sleep every night for a year: each column is ~14.6 days, a third of it asleep.
    const nights = Array.from({ length: 365 }, (_, i) => occ(`n${i}`, T + i * DAY_MS, T + i * DAY_MS + 8 * HOUR_MS, ["sleep"]));
    const { lanes } = layoutLanes(nights, ["sleep"], wide);
    expect(lanes[0]!.rects).toHaveLength(0);
    expect(lanes[0]!.rowCount).toBe(1);
    const inner = lanes[0]!.density.slice(1, -1); // edge columns are partly empty
    expect(inner.length).toBeGreaterThan(0);
    for (const run of inner) expect(run.opacity).toBeCloseTo(1 / 3, 1);
  });
});

describe("densityRuns", () => {
  // 1 px = 1 hour, window starts on a column boundary.
  const rw = { refTime: T, scale: 1 / HOUR_MS, winStart: T, winEnd: T + 10 * HOUR_MS, widthPx: 10 };

  it("opacity is the fraction of each column covered", () => {
    const runs = densityRuns([[T + 2 * HOUR_MS, T + 2 * HOUR_MS + 30 * MINUTE_MS]], rw);
    expect(runs).toEqual([{ x: 2, width: 1, opacity: 0.5 }]);
  });

  it("never widens short events: a 6-minute event covers a tenth of its column", () => {
    const runs = densityRuns([[T + 4 * HOUR_MS, T + 4 * HOUR_MS + 6 * MINUTE_MS]], rw);
    expect(runs).toEqual([{ x: 4, width: 1, opacity: 0.1 }]);
  });

  it("counts overlapping events once and caps at full coverage", () => {
    const runs = densityRuns(
      [
        [T + HOUR_MS, T + 2 * HOUR_MS],
        [T + HOUR_MS, T + 2 * HOUR_MS],
        [T + HOUR_MS + 30 * MINUTE_MS, T + 2 * HOUR_MS],
      ],
      rw,
    );
    expect(runs).toEqual([{ x: 1, width: 1, opacity: 1 }]);
  });

  it("splits an interval across the columns it touches and merges equal neighbors", () => {
    const runs = densityRuns([[T + 5 * HOUR_MS + 30 * MINUTE_MS, T + 8 * HOUR_MS]], rw);
    expect(runs).toEqual([
      { x: 5, width: 1, opacity: 0.5 },
      { x: 6, width: 2, opacity: 1 },
    ]);
  });

  it("mergeIntervals unions overlaps", () => {
    expect(mergeIntervals([[5, 8], [0, 3], [2, 6], [10, 11]])).toEqual([[0, 8], [10, 11]]);
  });
});
