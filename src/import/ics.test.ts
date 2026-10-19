import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ImportError, parseIcs } from "./ics";

const LA = "America/Los_Angeles";
const fixture = (name: string) => readFileSync(new URL(`../../tests/fixtures/${name}`, import.meta.url), "utf8");
const byTitle = (p: ReturnType<typeof parseIcs>, title: string) => p.candidates.filter((c) => c.fields.title === title);

describe("parseIcs: Google Calendar export", () => {
  const p = parseIcs(fixture("google.ics"), LA);

  it("reads timed, UTC, and all-day events with their details", () => {
    expect(byTitle(p, "Dentist appointment")[0]).toMatchObject({
      uid: "fake-dentist-001@google.com",
      cancelled: false,
      fields: {
        allDay: false,
        start: "2026-11-05T18:00:00.000Z", // 10:00 PST
        end: "2026-11-05T19:00:00.000Z",
        timeZone: LA,
        location: "123 Example Street, Springfield",
        description: "Cleaning. Bring the insurance card.",
      },
    });
    expect(byTitle(p, "Team sync")[0]!.fields).toMatchObject({ start: "2026-11-06T18:00:00.000Z", timeZone: "UTC" });
    expect(byTitle(p, "Library book due")[0]!.fields).toMatchObject({ allDay: true, startDate: "2026-11-10", endDate: "2026-11-11" });
  });

  it("keeps the RRULE and turns EXDATEs into occurrence keys", () => {
    const [series] = byTitle(p, "Study group").filter((c) => !c.recurrenceId);
    expect(series!.fields.recurrence).toEqual({ rrule: "FREQ=WEEKLY;COUNT=10;BYDAY=WE", exdates: ["2026-11-12T02:00:00.000Z"] });
  });

  it("reads overrides and cancelled occurrences as exceptions to the series", () => {
    const moved = byTitle(p, "Study group (moved)")[0]!;
    expect(moved).toMatchObject({ uid: "fake-study-004@google.com", recurrenceId: "2026-11-19T02:00:00.000Z", cancelled: false });
    expect(moved.fields.start).toBe("2026-11-19T03:00:00.000Z");
    const cancelled = p.candidates.find((c) => c.cancelled)!;
    expect(cancelled.recurrenceId).toBe("2026-11-26T02:00:00.000Z");
  });

  it("has nothing skipped and no warnings", () => {
    expect(p.skipped).toEqual([]);
    expect(p.warnings).toEqual([]);
  });
});

describe("parseIcs: Outlook export with Windows zone names (D15)", () => {
  const p = parseIcs(fixture("outlook.ics"), "Asia/Tokyo");

  it("maps a quoted Windows name to IANA", () => {
    const c = byTitle(p, "Weekly 1:1")[0]!;
    expect(c.fields).toMatchObject({ timeZone: LA, start: "2026-11-09T17:00:00.000Z" });
    // ical.js normalizes the rule, dropping the redundant INTERVAL=1.
    expect(c.fields.recurrence!.rrule).toBe("FREQ=WEEKLY;BYDAY=MO");
  });

  it("maps an unquoted Windows name", () => {
    expect(byTitle(p, "Call with the East Coast office")[0]!.fields).toMatchObject({ timeZone: "America/New_York", start: "2026-11-12T18:00:00.000Z" });
  });

  it("falls back to the file's VTIMEZONE for an unknown name, with a warning", () => {
    const c = byTitle(p, "Meeting in a custom zone")[0]!;
    expect(c.fields.start).toBe("2026-11-13T04:30:00.000Z"); // 10:00 at +05:30
    expect(c.fields.timeZone).toBe("Asia/Tokyo"); // repeats would follow the display zone
    expect(p.warnings.join(" ")).toMatch(/Fake Custom Zone/);
  });
});

describe("parseIcs: recurring series with exceptions", () => {
  const p = parseIcs(fixture("recurring-exceptions.ics"), LA);

  it("collects EXDATEs from several lines and values", () => {
    const series = p.candidates.find((c) => !c.recurrenceId)!;
    expect(series.fields.recurrence!.exdates.sort()).toEqual([
      "2026-10-21T14:00:00.000Z",
      "2026-10-24T14:00:00.000Z",
      "2026-10-25T14:00:00.000Z",
    ]);
    expect(series.fields.recurrence!.rrule).toBe("FREQ=DAILY;UNTIL=20261031T235959Z");
  });

  it("lists RDATE as unsupported", () => {
    expect(p.candidates.find((c) => !c.recurrenceId)!.warnings.join(" ")).toMatch(/RDATE/);
  });

  it("reads two overrides", () => {
    expect(p.candidates.filter((c) => c.recurrenceId).map((c) => [c.recurrenceId, c.fields.title])).toEqual([
      ["2026-10-22T14:00:00.000Z", "Long run"],
      ["2026-10-27T14:00:00.000Z", "Early run"],
    ]);
  });
});

describe("parseIcs: all-day and multi-day", () => {
  const p = parseIcs(fixture("allday-multiday.ics"), LA);

  it("keeps the exclusive DTEND of a multi-day all-day event", () => {
    expect(byTitle(p, "Weekend trip")[0]!.fields).toMatchObject({ allDay: true, startDate: "2026-10-30", endDate: "2026-11-02" });
  });

  it("gives an all-day event without DTEND one day", () => {
    expect(byTitle(p, "Holiday (no end date)")[0]!.fields).toMatchObject({ startDate: "2026-11-26", endDate: "2026-11-27" });
  });

  it("keeps a yearly all-day series and a timed overnight event", () => {
    expect(byTitle(p, "Leap day party")[0]!.fields.recurrence!.rrule).toBe("FREQ=YEARLY");
    expect(byTitle(p, "Conference (overnight, timed)")[0]!.fields).toMatchObject({ allDay: false, end: "2026-12-05T01:00:00.000Z" });
  });
});

describe("parseIcs: problems", () => {
  it("skips what it can't import, with a reason", () => {
    const p = parseIcs(fixture("skips.ics"), LA);
    const reasons = Object.fromEntries(p.skipped.map((s) => [s.title, s.reason]));
    expect(reasons["No start time"]).toMatch(/no start/);
    expect(reasons["Every hour"]).toMatch(/hourly/);
    expect(reasons["Ends before it starts"]).toMatch(/ends before/);
    // Orphan exceptions and cancellations are judged later, against existing data.
    expect(byTitle(p, "Exception without its series")[0]!.recurrenceId).toBe("2026-11-01T09:00:00.000Z");
    expect(byTitle(p, "Cancelled and never imported")[0]!.cancelled).toBe(true);
    expect(byTitle(p, "Missing UID")[0]!.warnings.join(" ")).toMatch(/no UID/);
  });

  it("rejects a malformed file outright", () => {
    expect(() => parseIcs(fixture("malformed.ics"), LA)).toThrow(ImportError);
    expect(() => parseIcs("hello, world", LA)).toThrow(ImportError);
  });
});
