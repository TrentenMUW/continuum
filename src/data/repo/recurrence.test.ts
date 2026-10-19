import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { wallOf } from "../../time/localTime";
import { ContinuumDB } from "../db";
import { EventIndex } from "../index";
import type { CalendarEvent } from "../types";
import { createEvent, deleteEvent } from "./events";
import { deleteOccurrence, saveOccurrence, type OccurrenceFields } from "./recurrence";

const LA = "America/Los_Angeles";
let db: ContinuumDB;
let n = 0;

beforeEach(() => {
  db = new ContinuumDB(`recur-repo-${n++}`);
});
afterEach(async () => {
  await db.delete();
});

const weekly = (rrule = "FREQ=WEEKLY;BYDAY=MO") =>
  createEvent(db, {
    title: "Class",
    allDay: false,
    start: "2026-10-19T16:00:00.000Z", // Mon 09:00 PDT
    end: "2026-10-19T17:00:00.000Z",
    timeZone: LA,
    categoryIds: ["edu"],
    recurrence: { rrule, exdates: [] },
    source: "manual",
  });

/** Local "YYYY-MM-DD HH:mm" starts of everything visible in a window. */
async function visible(from = "2026-10-18T00:00:00Z", to = "2026-11-24T00:00:00Z") {
  const idx = new EventIndex(await db.events.toArray(), LA);
  return idx
    .query(Date.parse(from), Date.parse(to))
    .map((o) => {
      const w = wallOf(o.start, LA);
      return `${w.month}/${w.day} ${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")} ${o.event.title}`;
    })
    .sort((a, b) => Date.parse(`2026/${a.split(" ")[0]}`) - Date.parse(`2026/${b.split(" ")[0]}`));
}

const fieldsFor = (s: CalendarEvent, patch: Partial<OccurrenceFields>): OccurrenceFields => ({
  title: s.title,
  allDay: s.allDay,
  start: s.start,
  end: s.end,
  categoryIds: s.categoryIds,
  recurrence: s.recurrence,
  ...patch,
});

const KEY_NOV2 = "2026-11-02T17:00:00.000Z"; // Mon Nov 2, 09:00 PST

/** The editor's fields for the unchanged occurrence at `key` (1 hour long), plus a patch. */
const atOccurrence = (s: CalendarEvent, key: string, patch: Partial<OccurrenceFields> = {}): OccurrenceFields =>
  fieldsFor(s, { start: key, end: new Date(Date.parse(key) + 3_600_000).toISOString(), ...patch });

describe("this occurrence (D13)", () => {
  it("delete adds an EXDATE and only that occurrence disappears", async () => {
    const s = await weekly();
    await deleteOccurrence(db, s, KEY_NOV2, "this");
    expect((await db.events.get(s.id))!.recurrence!.exdates).toEqual([KEY_NOV2]);
    expect(await visible()).toEqual(["10/19 09:00 Class", "10/26 09:00 Class", "11/9 09:00 Class", "11/16 09:00 Class", "11/23 09:00 Class"]);
  });

  it("edit creates an override; only that occurrence moves", async () => {
    const s = await weekly();
    await saveOccurrence(db, s, KEY_NOV2, fieldsFor(s, { start: "2026-11-02T19:00:00.000Z", end: "2026-11-02T20:00:00.000Z", title: "Class (moved)" }), "this", LA);
    expect(await db.events.count()).toBe(2);
    const override = (await db.events.where("recurrenceParentId").equals(s.id).first())!;
    expect(override).toMatchObject({ recurrenceId: KEY_NOV2, start: "2026-11-02T19:00:00.000Z" });
    expect(override).not.toHaveProperty("recurrence");
    expect(await visible()).toEqual([
      "10/19 09:00 Class",
      "10/26 09:00 Class",
      "11/2 11:00 Class (moved)",
      "11/9 09:00 Class",
      "11/16 09:00 Class",
      "11/23 09:00 Class",
    ]);
  });

  it("editing an override again updates it rather than adding another", async () => {
    const s = await weekly();
    await saveOccurrence(db, s, KEY_NOV2, fieldsFor(s, { title: "A" }), "this", LA);
    const o = (await db.events.where("recurrenceParentId").equals(s.id).first())!;
    await saveOccurrence(db, s, KEY_NOV2, fieldsFor(s, { title: "B" }), "this", LA, o);
    expect(await db.events.count()).toBe(2);
    expect((await db.events.get(o.id))!.title).toBe("B");
  });

  it("deleting an overridden occurrence removes the override too", async () => {
    const s = await weekly();
    await saveOccurrence(db, s, KEY_NOV2, fieldsFor(s, { title: "Moved" }), "this", LA);
    await deleteOccurrence(db, (await db.events.get(s.id))!, KEY_NOV2, "this");
    expect(await db.events.count()).toBe(1);
    expect((await visible()).some((v) => v.startsWith("11/2 "))).toBe(false);
  });
});

describe("this and following (D13)", () => {
  it("splits the series: the original ends before, a new series starts at the edited time", async () => {
    const s = await weekly();
    await saveOccurrence(db, s, KEY_NOV2, fieldsFor(s, { start: "2026-11-02T18:00:00.000Z", end: "2026-11-02T19:00:00.000Z", title: "Class v2" }), "following", LA);
    const all = await db.events.toArray();
    expect(all).toHaveLength(2);
    expect((await db.events.get(s.id))!.recurrence!.rrule).toBe("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261102T165959Z");
    expect(await visible()).toEqual([
      "10/19 09:00 Class",
      "10/26 09:00 Class",
      "11/2 10:00 Class v2",
      "11/9 10:00 Class v2",
      "11/16 10:00 Class v2",
      "11/23 10:00 Class v2",
    ]);
  });

  it("keeps the remaining COUNT on the new series", async () => {
    const s = await weekly("FREQ=WEEKLY;BYDAY=MO;COUNT=5"); // Oct 19 … Nov 16
    await saveOccurrence(db, s, KEY_NOV2, atOccurrence(s, KEY_NOV2, { title: "Later" }), "following", LA);
    expect(await visible()).toEqual(["10/19 09:00 Class", "10/26 09:00 Class", "11/2 09:00 Later", "11/9 09:00 Later", "11/16 09:00 Later"]);
  });

  it("delete ends the series before this occurrence", async () => {
    const s = await weekly();
    await deleteOccurrence(db, s, KEY_NOV2, "following");
    expect(await visible()).toEqual(["10/19 09:00 Class", "10/26 09:00 Class"]);
  });

  it("from the first occurrence it behaves like 'all'", async () => {
    const s = await weekly();
    await deleteOccurrence(db, s, "2026-10-19T16:00:00.000Z", "following");
    expect(await db.events.count()).toBe(0);
  });

  it("moves later overrides to the new series", async () => {
    const s = await weekly();
    const key9 = "2026-11-09T17:00:00.000Z";
    await saveOccurrence(db, s, key9, atOccurrence(s, key9, { title: "Special" }), "this", LA);
    await saveOccurrence(db, (await db.events.get(s.id))!, KEY_NOV2, atOccurrence(s, KEY_NOV2, { title: "v2" }), "following", LA);
    const v = await visible();
    expect(v.filter((x) => x.startsWith("11/9"))).toEqual(["11/9 09:00 Special"]);
    expect(v).toHaveLength(6);
  });
});

describe("all occurrences (D13)", () => {
  it("moves every occurrence when edited from any occurrence, keeping EXDATEs aligned", async () => {
    const s = await weekly();
    await deleteOccurrence(db, s, "2026-11-16T17:00:00.000Z", "this");
    const fresh = (await db.events.get(s.id))!;
    // Edit the Nov 2 occurrence: 09:00 → 10:30, 90 minutes long.
    await saveOccurrence(db, fresh, KEY_NOV2, fieldsFor(fresh, { start: "2026-11-02T18:30:00.000Z", end: "2026-11-02T20:00:00.000Z" }), "all", LA);
    const v = await visible();
    expect(v).toEqual(["10/19 10:30 Class", "10/26 10:30 Class", "11/2 10:30 Class", "11/9 10:30 Class", "11/23 10:30 Class"]);
    const stored = (await db.events.get(s.id))!;
    expect(stored.start).toBe("2026-10-19T17:30:00.000Z");
    expect(stored.end).toBe("2026-10-19T19:00:00.000Z");
  });

  it("delete removes the series and its overrides", async () => {
    const s = await weekly();
    await saveOccurrence(db, s, KEY_NOV2, fieldsFor(s, { title: "x" }), "this", LA);
    await deleteOccurrence(db, (await db.events.get(s.id))!, KEY_NOV2, "all");
    expect(await db.events.count()).toBe(0);
  });

  it("deleteEvent on a series cascades to overrides", async () => {
    const s = await weekly();
    await saveOccurrence(db, s, KEY_NOV2, fieldsFor(s, { title: "x" }), "this", LA);
    await deleteEvent(db, s.id);
    expect(await db.events.count()).toBe(0);
  });
});

describe("all-day series", () => {
  it("'this and following' on an all-day series splits on the date", async () => {
    const s = await createEvent(db, {
      title: "Gym",
      allDay: true,
      startDate: "2026-10-19",
      endDate: "2026-10-20",
      timeZone: LA,
      categoryIds: ["h"],
      recurrence: { rrule: "FREQ=DAILY;COUNT=10", exdates: [] },
      source: "manual",
    });
    await saveOccurrence(db, s, "2026-10-22", { ...fieldsFor(s, { title: "Gym+" }), startDate: "2026-10-22", endDate: "2026-10-23" }, "following", LA);
    const titles = (await visible("2026-10-18T00:00:00Z", "2026-11-05T00:00:00Z")).map((v) => v.split(" ").slice(2).join(" "));
    expect(titles).toEqual(["Gym", "Gym", "Gym", "Gym+", "Gym+", "Gym+", "Gym+", "Gym+", "Gym+", "Gym+"]);
  });
});
