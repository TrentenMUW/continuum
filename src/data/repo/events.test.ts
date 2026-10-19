import { afterEach, describe, expect, it } from "vitest";
import { ContinuumDB } from "../db";
import { seedIfNeeded } from "../seed";
import { countEventsInCategory, createCategory, deleteCategory, listCategories, moveCategory, updateCategory } from "./categories";
import { createEvent, deleteEvent, listEvents, updateEvent } from "./events";

let n = 0;
const open: ContinuumDB[] = [];
async function freshDb(): Promise<ContinuumDB> {
  const db = new ContinuumDB(`repo-test-${n++}`);
  open.push(db);
  await seedIfNeeded(db);
  return db;
}

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete();
});

const hike = (categoryIds: string[]) => ({
  title: "Hike",
  allDay: false,
  start: "2026-10-24T16:00:00.000Z",
  end: "2026-10-24T18:00:00.000Z",
  timeZone: "America/Los_Angeles",
  categoryIds,
  source: "manual" as const,
});

describe("events repository", () => {
  it("creates one record for a multi-category event and persists it", async () => {
    const db = await freshDb();
    const [health, hobbies, social] = (await listCategories(db)).slice(3, 6).map((c) => c.id);
    const e = await createEvent(db, hike([health!, hobbies!, social!]));
    const all = await listEvents(db);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: e.id, categoryIds: [health, hobbies, social] });
  });

  it("removing one category from an event keeps the single record", async () => {
    const db = await freshDb();
    const [a, b, c] = (await listCategories(db)).slice(3, 6).map((x) => x.id);
    const e = await createEvent(db, hike([a!, b!, c!]));
    await updateEvent(db, e.id, { categoryIds: [a!, b!] });
    expect((await db.events.get(e.id))!.categoryIds).toEqual([a, b]);
    expect(await db.events.count()).toBe(1);
  });

  it("switching timed → all-day leaves no stale timed fields", async () => {
    const db = await freshDb();
    const [a] = (await listCategories(db)).map((x) => x.id);
    const e = await createEvent(db, hike([a!]));
    await updateEvent(db, e.id, { allDay: true, start: undefined, end: undefined, startDate: "2026-10-24", endDate: "2026-10-25" });
    const stored = (await db.events.get(e.id))!;
    expect(stored).not.toHaveProperty("start");
    expect(stored).not.toHaveProperty("end");
    expect(stored.endDate).toBe("2026-10-25");
  });

  it("refuses an event with no category", async () => {
    const db = await freshDb();
    await expect(createEvent(db, hike([]))).rejects.toThrow();
  });

  it("deletes", async () => {
    const db = await freshDb();
    const [a] = (await listCategories(db)).map((x) => x.id);
    const e = await createEvent(db, hike([a!]));
    await deleteEvent(db, e.id);
    expect(await db.events.count()).toBe(0);
  });
});

describe("categories repository (§5.4)", () => {
  it("creates at the end of lane order, renames, recolors, and hides", async () => {
    const db = await freshDb();
    const c = await createCategory(db, " Music ", "#123456");
    expect(c.order).toBe(9);
    expect(c.name).toBe("Music");
    await updateCategory(db, c.id, { name: "Music & Art", color: "#abcdef", visible: false });
    expect(await db.categories.get(c.id)).toMatchObject({ name: "Music & Art", color: "#abcdef", visible: false });
  });

  it("reorders by swapping with a neighbor, and ignores moves past the ends", async () => {
    const db = await freshDb();
    const before = await listCategories(db);
    await moveCategory(db, before[1]!.id, -1);
    const after = await listCategories(db);
    expect(after.slice(0, 2).map((c) => c.id)).toEqual([before[1]!.id, before[0]!.id]);
    await moveCategory(db, after[0]!.id, -1);
    expect((await listCategories(db)).map((c) => c.id)).toEqual(after.map((c) => c.id));
  });

  it("deletes an unused category", async () => {
    const db = await freshDb();
    const c = await createCategory(db, "Temp", "#000000");
    await deleteCategory(db, c.id);
    expect(await db.categories.get(c.id)).toBeUndefined();
  });

  it("won't delete a category in use without a target", async () => {
    const db = await freshDb();
    const [a] = (await listCategories(db)).map((x) => x.id);
    await createEvent(db, hike([a!]));
    await expect(deleteCategory(db, a!)).rejects.toThrow(/move/);
    expect(await db.categories.get(a!)).toBeTruthy();
  });

  it("moves events to the chosen category, without duplicating it", async () => {
    const db = await freshDb();
    const [a, b, c] = (await listCategories(db)).map((x) => x.id);
    const e1 = await createEvent(db, hike([a!]));
    const e2 = await createEvent(db, hike([a!, b!]));
    const e3 = await createEvent(db, hike([c!]));
    expect(await countEventsInCategory(db, a!)).toBe(2);

    await deleteCategory(db, a!, b!);
    expect(await db.categories.get(a!)).toBeUndefined();
    expect((await db.events.get(e1.id))!.categoryIds).toEqual([b]);
    expect((await db.events.get(e2.id))!.categoryIds).toEqual([b]);
    expect((await db.events.get(e3.id))!.categoryIds).toEqual([c]);
  });
});
