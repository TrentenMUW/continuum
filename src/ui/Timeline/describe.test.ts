import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { describe, expect, it } from "vitest";
import type { Occurrence } from "../../data/index";
import type { CalendarEvent } from "../../data/types";
import { describeOccurrence } from "./describe";

const LA = "America/Los_Angeles";
const ev = (patch: Partial<CalendarEvent>) => ({ id: "e", title: "Hike", allDay: false, categoryIds: ["c"], timeZone: LA, source: "manual", createdAt: "", updatedAt: "", ...patch }) as CalendarEvent;
const occ = (e: CalendarEvent, start: string, end: string, key?: string): Occurrence => ({ event: e, start: Date.parse(start), end: Date.parse(end), key });

describe("describeOccurrence", () => {
  it("formats timed events the same way date-fns would, across DST", () => {
    let seed = 3;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 500; i++) {
      const start = Date.UTC(2020, 0, 1) + Math.floor(rand() * 15 * 365) * 86_400_000 + Math.floor(rand() * 96) * 900_000;
      const end = start + Math.floor(rand() * 40) * 900_000 + 900_000;
      const zone = ["America/Los_Angeles", "Australia/Sydney", "Asia/Kolkata"][i % 3]!;
      const s = new TZDate(start, zone);
      const e = new TZDate(end, zone);
      const same = format(s, "yyyy-MM-dd") === format(e, "yyyy-MM-dd");
      const expected = same
        ? `Hike, ${format(s, "EEE d MMM yyyy, HH:mm")} – ${format(e, "HH:mm")}`
        : `Hike, ${format(s, "EEE d MMM yyyy, HH:mm")} – ${format(e, "EEE d MMM yyyy, HH:mm")}`;
      expect(describeOccurrence(occ(ev({}), new Date(start).toISOString(), new Date(end).toISOString()), zone)).toBe(expected);
    }
  });

  it("describes all-day events with an inclusive last day, and series occurrences by their own date", () => {
    const trip = ev({ allDay: true, startDate: "2026-10-30", endDate: "2026-11-02" });
    expect(describeOccurrence(occ(trip, "2026-10-30T07:00:00Z", "2026-11-02T08:00:00Z"), LA)).toBe("Hike, Fri 30 Oct 2026 – Sun 1 Nov 2026, all day");
    const daily = ev({ allDay: true, startDate: "2026-10-30", endDate: "2026-10-31", recurrence: { rrule: "FREQ=DAILY", exdates: [] } });
    expect(describeOccurrence(occ(daily, "2026-11-05T08:00:00Z", "2026-11-06T08:00:00Z", "2026-11-05"), LA)).toBe("Hike, Thu 5 Nov 2026, all day");
  });
});
