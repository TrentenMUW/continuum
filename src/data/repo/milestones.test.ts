import { afterEach, describe, expect, it } from "vitest";
import { ContinuumDB } from "../db";
import { seedIfNeeded } from "../seed";
import { createMilestone, deleteMilestone, listMilestones, updateMilestone } from "./milestones";

let n = 0;
const open: ContinuumDB[] = [];
function freshDb(name = `milestone-test-${n++}`): ContinuumDB {
  const db = new ContinuumDB(name);
  open.push(db);
  return db;
}
afterEach(async () => {
  for (const db of open.splice(0)) await db.delete();
});

describe("milestones repository (§5.7)", () => {
  it("creates, moves, completes, and lists in date order", async () => {
    const db = freshDb();
    await seedIfNeeded(db);
    const g = await createMilestone(db, { title: "Graduation", targetDate: "2028-06-10", completed: false, completionMode: "manual" });
    expect((await listMilestones(db)).map((m) => m.title)).toEqual(["Graduation", "65th Birthday / Retirement"]);

    await updateMilestone(db, g.id, { targetDate: "2028-06-11" });
    await updateMilestone(db, g.id, { completed: true, completedAt: "2028-06-11" });
    expect(await db.milestones.get(g.id)).toMatchObject({ targetDate: "2028-06-11", completed: true, completedAt: "2028-06-11" });

    await updateMilestone(db, g.id, { completed: false });
    expect(await db.milestones.get(g.id)).not.toHaveProperty("completedAt");
  });

  it("never stores completion for a date-based milestone", async () => {
    const db = freshDb();
    const b = await createMilestone(db, { title: "30th birthday", targetDate: "2030-01-01", completed: true, completedAt: "2030-01-01", completionMode: "date-based" });
    const stored = (await db.milestones.get(b.id))!;
    expect(stored.completed).toBe(false);
    expect(stored).not.toHaveProperty("completedAt");
  });

  it("deleting the seeded 2065 milestone survives a restart (D2)", async () => {
    const name = `milestone-test-${n++}`;
    const db = freshDb(name);
    await seedIfNeeded(db);
    const [retirement] = await listMilestones(db);
    await deleteMilestone(db, retirement!.id);
    db.close();

    const again = freshDb(name);
    await seedIfNeeded(again);
    expect(await again.milestones.count()).toBe(0);
  });
});
