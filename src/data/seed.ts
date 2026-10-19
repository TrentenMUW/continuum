import type { ContinuumDB } from "./db";
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, SEED_MILESTONE } from "./defaults";
import { CURRENT_SCHEMA_VERSION } from "./migrations";

/**
 * D2: seed categories, settings, and the retirement milestone exactly once.
 * Runs in one read-write transaction, so two concurrent calls (React StrictMode,
 * two tabs) serialize and the second sees `meta.seeded`. Returns true if it seeded.
 */
export async function seedIfNeeded(db: ContinuumDB, now: Date = new Date()): Promise<boolean> {
  return db.transaction("rw", [db.categories, db.milestones, db.settings, db.meta], async () => {
    const meta = await db.meta.get("meta");
    if (meta?.seeded) return false;

    const stamp = now.toISOString();
    await db.categories.bulkAdd(
      DEFAULT_CATEGORIES.map((c, i) => ({
        id: crypto.randomUUID(),
        name: c.name,
        color: c.color,
        order: i + 1,
        visible: true,
      })),
    );
    await db.milestones.add({
      id: crypto.randomUUID(),
      ...SEED_MILESTONE,
      createdAt: stamp,
      updatedAt: stamp,
    });
    if (!(await db.settings.get("app"))) {
      await db.settings.add({ id: "app", ...DEFAULT_SETTINGS });
    }
    await db.meta.put({ id: "meta", schemaVersion: CURRENT_SCHEMA_VERSION, seeded: true });
    return true;
  });
}
