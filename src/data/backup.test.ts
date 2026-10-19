import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backupFilename, checkBackup, exportBackup, restoreBackup } from "./backup";
import { ContinuumDB } from "./db";
import { listCategories } from "./repo/categories";
import { createEvent } from "./repo/events";
import { saveSettings } from "./repo/settings";
import { seedIfNeeded } from "./seed";

let db: ContinuumDB;
let n = 0;
beforeEach(async () => {
  db = new ContinuumDB(`backup-test-${n++}`);
  await seedIfNeeded(db);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});

const addEvent = async (title: string) => {
  const [cat] = await listCategories(db);
  return createEvent(db, { title, allDay: false, start: "2026-10-20T16:00:00.000Z", end: "2026-10-20T17:00:00.000Z", timeZone: "UTC", categoryIds: [cat!.id], source: "manual" });
};

describe("backup (§5.10)", () => {
  it("exports everything with the documented shape and file name", async () => {
    await addEvent("Kept");
    await saveSettings(db, { snapEnabled: true });
    const b = await exportBackup(db, new Date("2026-10-19T12:00:00Z"));
    expect(Object.keys(b)).toEqual(["app", "schemaVersion", "exportedAt", "events", "categories", "milestones", "settings"]);
    expect(b).toMatchObject({ app: "continuum", schemaVersion: 1, exportedAt: "2026-10-19T12:00:00.000Z" });
    expect(b.events).toHaveLength(1);
    expect(b.categories).toHaveLength(8);
    expect(b.milestones).toHaveLength(1);
    expect(b.settings.snapEnabled).toBe(true);
    expect(b.settings).not.toHaveProperty("id");
    expect(backupFilename(new Date(2026, 9, 19, 23, 0))).toBe("continuum-backup-2026-10-19.json");
  });

  it("export → add → restore brings back exactly the backup", async () => {
    await addEvent("Before");
    const text = JSON.stringify(await exportBackup(db));
    await addEvent("Added after the backup");
    const check = checkBackup(text);
    if (!check.ok) throw new Error(check.error);
    expect(check.counts).toEqual({ events: 1, categories: 8, milestones: 1 });

    await restoreBackup(db, check.backup);
    expect((await db.events.toArray()).map((e) => e.title)).toEqual(["Before"]);
    expect(await db.categories.count()).toBe(8);
    expect(await db.milestones.count()).toBe(1);
    expect((await db.meta.get("meta"))!.seeded).toBe(true);
  });

  it("restoring a backup without the 2065 milestone doesn't reseed it", async () => {
    const b = await exportBackup(db);
    await restoreBackup(db, { ...b, milestones: [] });
    await seedIfNeeded(db);
    expect(await db.milestones.count()).toBe(0);
  });

  it("rejects files that aren't valid backups, before changing anything", async () => {
    const good = await exportBackup(db);
    const cases: Array<[string, RegExp]> = [
      ["not json", /valid JSON/],
      [JSON.stringify({ app: "other" }), /isn't a Continuum backup/],
      [JSON.stringify({ ...good, schemaVersion: 99 }), /newer version/],
      [JSON.stringify({ ...good, events: undefined }), /missing its events/],
      [JSON.stringify({ ...good, events: [{ id: "x", title: "Bad", categoryIds: ["nope"], allDay: false, start: "a", end: "b" }] }), /category that isn't in the backup/],
      [JSON.stringify({ ...good, events: [{ id: "x", title: "No times", categoryIds: [good.categories[0]!.id], allDay: false }] }), /no valid start/],
    ];
    for (const [text, error] of cases) {
      const r = checkBackup(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(error);
    }
  });

  it("a failed restore leaves the existing data untouched", async () => {
    await addEvent("Existing");
    const b = await exportBackup(db);
    vi.spyOn(db.milestones, "bulkAdd").mockRejectedValue(new Error("simulated failure"));
    await expect(restoreBackup(db, { ...b, events: [] })).rejects.toThrow(/simulated/);
    expect((await db.events.toArray()).map((e) => e.title)).toEqual(["Existing"]);
  });
});
