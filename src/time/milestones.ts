// Milestones work at day resolution (D12).

import type { CalDate, Milestone } from "../data/types";
import { addCalDays, calDateOf, startOfCalDate } from "./calDate";

/**
 * D12 / §5.7: a milestone never completes just because its date passed, except in
 * "date-based" mode (birthdays and the like), where completion is derived, not stored.
 */
export function isMilestoneComplete(m: Milestone, today: CalDate): boolean {
  return m.completionMode === "date-based" ? today >= m.targetDate : m.completed;
}

/** The calendar date whose local midnight is nearest to `t` in `zone` (drag snapping, D12). */
export function nearestMidnight(t: number, zone: string): CalDate {
  const day = calDateOf(t, zone);
  const next = addCalDays(day, 1);
  // Days aren't all 24 hours, so compare against the real midnights on either side.
  return t - startOfCalDate(day, zone) <= startOfCalDate(next, zone) - t ? day : next;
}
