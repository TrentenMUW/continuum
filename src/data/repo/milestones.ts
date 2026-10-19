import type { ContinuumDB } from "../db";
import type { Milestone } from "../types";

export function listMilestones(db: ContinuumDB): Promise<Milestone[]> {
  return db.milestones.orderBy("targetDate").toArray();
}
