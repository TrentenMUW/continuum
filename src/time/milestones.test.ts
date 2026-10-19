import { describe, expect, it } from "vitest";
import type { Milestone } from "../data/types";
import { isMilestoneComplete, nearestMidnight } from "./milestones";

const LA = "America/Los_Angeles";
const m = (patch: Partial<Milestone>): Milestone => ({
  id: "m",
  title: "Graduation",
  targetDate: "2026-06-12",
  completed: false,
  completionMode: "manual",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...patch,
});

describe("isMilestoneComplete (D12, §5.7)", () => {
  it("a past-dated achievement stays incomplete until it's marked", () => {
    expect(isMilestoneComplete(m({}), "2026-10-18")).toBe(false);
    expect(isMilestoneComplete(m({ completed: true }), "2026-10-18")).toBe(true);
  });

  it("a manual milestone can be marked complete before its date", () => {
    expect(isMilestoneComplete(m({ targetDate: "2030-01-01", completed: true }), "2026-10-18")).toBe(true);
  });

  it("a date-based milestone completes on its date, regardless of the stored flag", () => {
    const birthday = m({ completionMode: "date-based", targetDate: "2026-10-18" });
    expect(isMilestoneComplete(birthday, "2026-10-17")).toBe(false);
    expect(isMilestoneComplete(birthday, "2026-10-18")).toBe(true);
    expect(isMilestoneComplete({ ...birthday, completed: true }, "2026-10-17")).toBe(false);
  });
});

describe("nearestMidnight (drag snapping)", () => {
  const at = (iso: string) => Date.parse(iso);

  it("rounds to the nearer local midnight", () => {
    expect(nearestMidnight(at("2026-10-20T17:00:00Z"), LA)).toBe("2026-10-20"); // 10:00 local
    expect(nearestMidnight(at("2026-10-21T03:00:00Z"), LA)).toBe("2026-10-21"); // 20:00 local
  });

  it("uses real midnights on a 25-hour day", () => {
    // Sun Nov 1, 2026 runs 07:00Z → 08:00Z next day (25 h). Its midpoint is 12.5 h in.
    expect(nearestMidnight(at("2026-11-01T19:00:00Z"), LA)).toBe("2026-11-01"); // 12 h in
    expect(nearestMidnight(at("2026-11-01T20:00:00Z"), LA)).toBe("2026-11-02"); // 13 h in
  });

  it("uses real midnights on a 23-hour day", () => {
    // Sun Mar 14, 2027 runs 08:00Z → 07:00Z next day (23 h). Its midpoint is 11.5 h in.
    expect(nearestMidnight(at("2027-03-14T19:00:00Z"), LA)).toBe("2027-03-14"); // 11 h in
    expect(nearestMidnight(at("2027-03-14T20:00:00Z"), LA)).toBe("2027-03-15"); // 12 h in
  });
});
