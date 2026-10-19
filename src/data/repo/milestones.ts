import type { ContinuumDB } from "../db";
import type { Milestone } from "../types";

export function listMilestones(db: ContinuumDB): Promise<Milestone[]> {
  return db.milestones.orderBy("targetDate").toArray();
}

export type MilestoneFields = Pick<Milestone, "title" | "description" | "targetDate" | "completed" | "completedAt" | "completionMode">;

export async function createMilestone(db: ContinuumDB, fields: MilestoneFields, now: Date = new Date()): Promise<Milestone> {
  const stamp = now.toISOString();
  const milestone = stripUndefined({ ...normalize(fields), id: crypto.randomUUID(), createdAt: stamp, updatedAt: stamp });
  await db.milestones.add(milestone);
  return milestone;
}

export async function updateMilestone(
  db: ContinuumDB,
  id: string,
  patch: Partial<MilestoneFields>,
  now: Date = new Date(),
): Promise<Milestone> {
  return db.transaction("rw", db.milestones, async () => {
    const existing = await db.milestones.get(id);
    if (!existing) throw new Error(`No milestone ${id}`);
    const next = stripUndefined({ ...existing, ...normalize({ ...existing, ...patch }), id, updatedAt: now.toISOString() });
    await db.milestones.put(next);
    return next;
  });
}

export function deleteMilestone(db: ContinuumDB, id: string): Promise<void> {
  return db.milestones.delete(id);
}

/**
 * Date-based milestones derive completion at render time (D12), so they never store it.
 * Manual ones keep `completedAt` only while completed.
 */
function normalize(f: MilestoneFields): MilestoneFields {
  if (f.completionMode === "date-based") return { ...f, completed: false, completedAt: undefined };
  return { ...f, completedAt: f.completed ? f.completedAt : undefined };
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
