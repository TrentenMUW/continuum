import { describe, expect, it } from "vitest";
import { EventIndex, eventBounds } from "./index";
import type { CalendarEvent } from "./types";

const LA = "America/Los_Angeles";
const H = 3_600_000;

let n = 0;
function timed(startIso: string, endIso: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: `e${n++}`,
    title: "t",
    allDay: false,
    start: startIso,
    end: endIso,
    timeZone: LA,
    categoryIds: ["c"],
    source: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

function allDay(startDate: string, endDate: string): CalendarEvent {
  return { ...timed("", ""), start: undefined, end: undefined, allDay: true, startDate, endDate };
}

describe("eventBounds", () => {
  it("all-day events span local midnight to local midnight in the display zone", () => {
    const b = eventBounds(allDay("2026-11-01", "2026-11-02"), LA)!;
    expect(new Date(b.start).toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(new Date(b.end).toISOString()).toBe("2026-11-02T08:00:00.000Z");
    expect(b.end - b.start).toBe(25 * H); // the fall-back day
  });

  it("the same all-day event follows the display zone", () => {
    const b = eventBounds(allDay("2026-11-01", "2026-11-02"), "UTC")!;
    expect(new Date(b.start).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});

describe("EventIndex (D4)", () => {
  const events = [
    timed("2026-10-18T10:00:00Z", "2026-10-18T11:00:00Z"),
    timed("2026-10-18T12:00:00Z", "2026-10-18T13:00:00Z"),
    timed("2026-10-01T00:00:00Z", "2026-10-30T00:00:00Z"), // long, starts well before the window
    timed("2026-10-19T00:00:00Z", "2026-10-19T01:00:00Z"),
    timed("2026-10-18T09:00:00Z", "2026-10-18T10:00:00Z"), // ends exactly at the window start
  ];
  const idx = new EventIndex(events, LA);
  const ids = (from: string, to: string) =>
    idx
      .query(Date.parse(from), Date.parse(to))
      .map((o) => o.event.id)
      .sort();

  it("finds events overlapping the window, including long ones that started earlier", () => {
    expect(ids("2026-10-18T10:00:00Z", "2026-10-18T12:30:00Z")).toEqual(
      [events[0]!.id, events[1]!.id, events[2]!.id].sort(),
    );
  });

  it("treats intervals as half-open", () => {
    expect(ids("2026-10-18T13:00:00Z", "2026-10-18T14:00:00Z")).toEqual([events[2]!.id]);
  });

  it("returns nothing outside every event", () => {
    expect(ids("2027-01-01T00:00:00Z", "2027-02-01T00:00:00Z")).toEqual([]);
  });

  it("upsert moves an edited event and remove drops it", () => {
    const local = new EventIndex(events, LA);
    const moved = { ...events[0]!, start: "2030-01-01T00:00:00Z", end: "2030-01-01T01:00:00Z" };
    local.upsert(moved);
    expect(local.size).toBe(events.length);
    expect(local.query(Date.parse("2029-12-31T00:00:00Z"), Date.parse("2030-01-02T00:00:00Z")).map((o) => o.event.id)).toEqual([moved.id]);
    local.remove(moved.id);
    expect(local.size).toBe(events.length - 1);
  });

  it("shrinks the lookback after the longest event is removed, and still finds the rest", () => {
    const local = new EventIndex(events, LA);
    local.remove(events[2]!.id);
    expect(local.query(Date.parse("2026-10-18T12:30:00Z"), Date.parse("2026-10-18T12:31:00Z")).map((o) => o.event.id)).toEqual([events[1]!.id]);
  });

  it("stays sorted across many upserts", () => {
    const local = new EventIndex([], "UTC");
    const base = Date.parse("2026-01-01T00:00:00Z");
    for (let i = 0; i < 200; i++) {
      const s = base + ((i * 7919) % 200) * H;
      local.upsert(timed(new Date(s).toISOString(), new Date(s + H).toISOString(), { id: `s${i}` }));
    }
    const all = local.query(base - H, base + 1000 * H).map((o) => o.start);
    expect(all).toEqual([...all].sort((a, b) => a - b));
    expect(all).toHaveLength(200);
  });
});
