import { afterEach, describe, expect, it } from "vitest";
import { ContinuumDB } from "./db";
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from "./defaults";
import { CURRENT_SCHEMA_VERSION } from "./migrations";
import { listCategories } from "./repo/categories";
import { seedIfNeeded } from "./seed";

let n = 0;
const open: ContinuumDB[] = [];
function freshDb(name = `seed-test-${n++}`): ContinuumDB {
  const db = new ContinuumDB(name);
  open.push(db);
  return db;
}

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete();
});

describe("seedIfNeeded (D2)", () => {
  it("seeds 8 categories in spec order with spec colors", async () => {
    const db = freshDb();
    expect(await seedIfNeeded(db)).toBe(true);

    const cats = await listCategories(db);
    expect(cats.map((c) => [c.name, c.color])).toEqual(DEFAULT_CATEGORIES.map((c) => [c.name, c.color]));
    expect(cats.map((c) => c.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(cats.every((c) => c.visible)).toBe(true);
    expect(new Set(cats.map((c) => c.id)).size).toBe(8);
  });

  it("seeds exactly one date-based milestone on 2065-01-01", async () => {
    const db = freshDb();
    await seedIfNeeded(db, new Date("2026-10-18T12:00:00Z"));

    const milestones = await db.milestones.toArray();
    expect(milestones).toHaveLength(1);
    expect(milestones[0]).toMatchObject({
      title: "65th Birthday / Retirement",
      targetDate: "2065-01-01",
      completed: false,
      completionMode: "date-based",
      createdAt: "2026-10-18T12:00:00.000Z",
    });
  });

  it("writes default settings and meta", async () => {
    const db = freshDb();
    await seedIfNeeded(db);

    const { id, ...settings } = (await db.settings.get("app"))!;
    expect(id).toBe("app");
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(settings).not.toHaveProperty("retirementDate");
    expect(await db.meta.get("meta")).toEqual({ id: "meta", schemaVersion: CURRENT_SCHEMA_VERSION, seeded: true });
  });

  it("does not reseed on later startups", async () => {
    const name = `seed-test-${n++}`;
    const first = freshDb(name);
    await seedIfNeeded(first);
    first.close();

    const second = freshDb(name);
    expect(await seedIfNeeded(second)).toBe(false);
    expect(await second.categories.count()).toBe(8);
    expect(await second.milestones.count()).toBe(1);
  });

  it("does not bring back a deleted seed milestone", async () => {
    const db = freshDb();
    await seedIfNeeded(db);
    await db.milestones.clear();

    expect(await seedIfNeeded(db)).toBe(false);
    expect(await db.milestones.count()).toBe(0);
  });

  it("seeds once when called concurrently (StrictMode, two tabs)", async () => {
    const db = freshDb();
    const results = await Promise.all([seedIfNeeded(db), seedIfNeeded(db), seedIfNeeded(db)]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.categories.count()).toBe(8);
    expect(await db.milestones.count()).toBe(1);
  });

  it("keeps existing settings if they are already present", async () => {
    const db = freshDb();
    await db.settings.add({ id: "app", ...DEFAULT_SETTINGS, snapEnabled: true });
    await seedIfNeeded(db);
    expect((await db.settings.get("app"))!.snapEnabled).toBe(true);
  });
});
