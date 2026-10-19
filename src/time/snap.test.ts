import { describe, expect, it } from "vitest";
import { snapTarget } from "./snap";
import { DAY_MS } from "./viewport";

describe("snapTarget (D8)", () => {
  it("snaps to a target within the threshold", () => {
    expect(snapTarget(1.1 * DAY_MS, 0.15)).toBe(DAY_MS);
    expect(snapTarget(6.2 * DAY_MS, 0.15)).toBe(7 * DAY_MS);
    expect(snapTarget(33 * DAY_MS, 0.15)).toBe(30.44 * DAY_MS);
    expect(snapTarget(400 * DAY_MS, 0.15)).toBe(365.25 * DAY_MS);
  });

  it("does nothing outside the threshold", () => {
    expect(snapTarget(1.2 * DAY_MS, 0.15)).toBeNull();
    expect(snapTarget(3 * DAY_MS, 0.15)).toBeNull();
    expect(snapTarget(100 * DAY_MS, 0.15)).toBeNull();
    expect(snapTarget(20 * 365 * DAY_MS, 0.15)).toBeNull();
  });

  it("respects a custom threshold", () => {
    expect(snapTarget(1.2 * DAY_MS, 0.25)).toBe(DAY_MS);
    expect(snapTarget(1.05 * DAY_MS, 0.01)).toBeNull();
  });
});
