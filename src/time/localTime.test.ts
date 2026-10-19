import { describe, expect, it } from "vitest";
import { wallOf, wallToInstant, type WallTime } from "./localTime";

const LA = "America/Los_Angeles";
const w = (year: number, month: number, day: number, hour: number, minute = 0): WallTime => ({ year, month, day, hour, minute, second: 0 });
const iso = (t: number) => new Date(t).toISOString();

describe("wallToInstant (D3)", () => {
  it("converts ordinary times in standard and daylight time", () => {
    expect(iso(wallToInstant(w(2026, 10, 19, 9), LA))).toBe("2026-10-19T16:00:00.000Z"); // PDT
    expect(iso(wallToInstant(w(2026, 11, 2, 9), LA))).toBe("2026-11-02T17:00:00.000Z"); // PST
  });

  it("moves a nonexistent spring-forward time forward by the gap", () => {
    // 02:30 on Sun Mar 14, 2027 doesn't exist in Pacific time; it becomes 03:30 PDT.
    const t = wallToInstant(w(2027, 3, 14, 2, 30), LA);
    expect(iso(t)).toBe("2027-03-14T10:30:00.000Z");
    expect(wallOf(t, LA)).toMatchObject({ hour: 3, minute: 30 });
  });

  it("uses the first occurrence of an ambiguous fall-back time", () => {
    // 01:30 on Sun Nov 1, 2026 happens twice: first in PDT (08:30Z), then in PST (09:30Z).
    expect(iso(wallToInstant(w(2026, 11, 1, 1, 30), LA))).toBe("2026-11-01T08:30:00.000Z");
  });

  it("round-trips through wallOf for every hour across both transitions", () => {
    for (const [y, m, d] of [[2026, 11, 1], [2027, 3, 14]] as const) {
      for (let h = 0; h < 24; h++) {
        if (y === 2027 && h === 2) continue; // the missing hour
        const t = wallToInstant(w(y, m, d, h), LA);
        expect(wallOf(t, LA)).toMatchObject({ year: y, month: m, day: d, hour: h, minute: 0 });
      }
    }
  });

  it("handles half-hour zones and zones with no DST", () => {
    expect(iso(wallToInstant(w(2026, 10, 19, 9), "Asia/Kolkata"))).toBe("2026-10-19T03:30:00.000Z");
    expect(iso(wallToInstant(w(2026, 10, 19, 9), "UTC"))).toBe("2026-10-19T09:00:00.000Z");
  });

  it("handles a southern-hemisphere transition (Sydney, first Sunday of April 2027)", () => {
    // 02:30 on Apr 4, 2027 happens twice in Sydney; the first is still AEDT (+11).
    expect(iso(wallToInstant(w(2027, 4, 4, 2, 30), "Australia/Sydney"))).toBe("2027-04-03T15:30:00.000Z");
  });
});
