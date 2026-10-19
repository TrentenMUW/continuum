import { describe, expect, it } from "vitest";
import { buildRepeatRule, draftToFields, NO_REPEAT, repeatFromRule, validateDraft, type EventDraft, type RepeatDraft } from "./validate";

const LA = "America/Los_Angeles";
const base: EventDraft = {
  title: "Hike",
  allDay: false,
  startLocal: "2026-10-24T09:00",
  endLocal: "2026-10-24T11:00",
  startDate: "",
  endDate: "",
  categoryIds: ["health"],
  description: "",
  location: "",
  repeat: NO_REPEAT,
};

const repeat = (patch: Partial<RepeatDraft>): EventDraft => ({ ...base, repeat: { ...NO_REPEAT, touched: true, ...patch } });

describe("repeat rules (§5.6)", () => {
  it("builds daily, weekly, monthly, and yearly rules with an interval", () => {
    expect(buildRepeatRule(repeat({ freq: "DAILY" }), LA)).toBe("FREQ=DAILY");
    expect(buildRepeatRule(repeat({ freq: "WEEKLY", interval: "2", weekdays: ["WE", "MO"] }), LA)).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE");
    expect(buildRepeatRule(repeat({ freq: "MONTHLY" }), LA)).toBe("FREQ=MONTHLY;BYMONTHDAY=24");
    expect(buildRepeatRule(repeat({ freq: "YEARLY" }), LA)).toBe("FREQ=YEARLY");
    expect(buildRepeatRule(base, LA)).toBeUndefined();
  });

  it("ends on a date (inclusive, through the end of that local day) or after a count", () => {
    expect(buildRepeatRule(repeat({ freq: "DAILY", ends: "on", untilDate: "2026-12-31" }), LA)).toBe("FREQ=DAILY;UNTIL=20270101T075959Z");
    expect(buildRepeatRule({ ...repeat({ freq: "DAILY", ends: "on", untilDate: "2026-12-31" }), allDay: true, startDate: "2026-10-24", endDate: "2026-10-24" }, LA)).toBe(
      "FREQ=DAILY;UNTIL=20261231",
    );
    expect(buildRepeatRule(repeat({ freq: "DAILY", ends: "after", count: "10" }), LA)).toBe("FREQ=DAILY;COUNT=10");
  });

  it("keeps a stored rule verbatim when the controls weren't touched", () => {
    const stored = "FREQ=WEEKLY;WKST=SU;BYDAY=TU";
    const r = repeatFromRule(stored, LA);
    expect(r).toMatchObject({ freq: "WEEKLY", weekdays: ["TU"], touched: false, custom: false });
    expect(buildRepeatRule({ ...base, repeat: r }, LA)).toBe(stored);
  });

  it("reads UNTIL and COUNT back into the controls", () => {
    expect(repeatFromRule("FREQ=DAILY;UNTIL=20270101T075959Z", LA)).toMatchObject({ ends: "on", untilDate: "2026-12-31" });
    expect(repeatFromRule("FREQ=DAILY;COUNT=7", LA)).toMatchObject({ ends: "after", count: "7" });
  });

  it("marks rules the controls can't show as custom", () => {
    expect(repeatFromRule("FREQ=MONTHLY;BYDAY=2TU", LA).custom).toBe(true);
    expect(repeatFromRule("FREQ=YEARLY;BYMONTH=3", LA).custom).toBe(true);
    expect(repeatFromRule("FREQ=WEEKLY;BYDAY=MO,FR", LA).custom).toBe(false);
  });

  it("validates interval, weekdays, end date, and count", () => {
    expect(validateDraft(repeat({ freq: "DAILY", interval: "0" }), LA).repeat).toBeTruthy();
    expect(validateDraft(repeat({ freq: "WEEKLY", weekdays: [] }), LA).repeat).toMatch(/day of the week/);
    expect(validateDraft(repeat({ freq: "DAILY", ends: "on", untilDate: "2026-10-01" }), LA).repeat).toMatch(/before it starts/);
    expect(validateDraft(repeat({ freq: "DAILY", ends: "after", count: "x" }), LA).repeat).toBeTruthy();
    expect(validateDraft(repeat({ freq: "WEEKLY", weekdays: ["SA"] }), LA)).toEqual({});
  });

  it("draftToFields carries the rule with no EXDATEs", () => {
    expect(draftToFields(repeat({ freq: "DAILY" }), LA).recurrence).toEqual({ rrule: "FREQ=DAILY", exdates: [] });
    expect(draftToFields(base, LA).recurrence).toBeUndefined();
  });
});

describe("validateDraft (§5.6)", () => {
  it("accepts a valid timed event", () => {
    expect(validateDraft(base, LA)).toEqual({});
  });

  it("requires a title and at least one category", () => {
    const e = validateDraft({ ...base, title: "  ", categoryIds: [] }, LA);
    expect(e.title).toBeTruthy();
    expect(e.categories).toBeTruthy();
  });

  it("requires a timed end after its start", () => {
    expect(validateDraft({ ...base, endLocal: "2026-10-24T09:00" }, LA).end).toMatch(/after/);
    expect(validateDraft({ ...base, endLocal: "2026-10-24T08:00" }, LA).end).toMatch(/after/);
  });

  it("rejects malformed or impossible dates", () => {
    expect(validateDraft({ ...base, startLocal: "2026-02-30T09:00" }, LA).start).toBeTruthy();
    expect(validateDraft({ ...base, endLocal: "" }, LA).end).toBeTruthy();
  });

  it("all-day: a single day is valid; an end before the start is not", () => {
    const d = { ...base, allDay: true, startDate: "2026-11-03", endDate: "2026-11-03" };
    expect(validateDraft(d, LA)).toEqual({});
    expect(validateDraft({ ...d, endDate: "2026-11-02" }, LA).end).toBeTruthy();
  });
});

describe("draftToFields", () => {
  it("stores timed events as UTC instants interpreted in the display zone", () => {
    const f = draftToFields(base, LA);
    expect(f.start).toBe("2026-10-24T16:00:00.000Z");
    expect(f.end).toBe("2026-10-24T18:00:00.000Z");
    expect(f.startDate).toBeUndefined();
  });

  it("converts the inclusive all-day end to an exclusive stored end", () => {
    const f = draftToFields({ ...base, allDay: true, startDate: "2028-02-28", endDate: "2028-02-29" }, LA);
    expect(f.startDate).toBe("2028-02-28");
    expect(f.endDate).toBe("2028-03-01");
    expect(f.start).toBeUndefined();
  });

  it("trims text, drops empty optional fields, and dedupes categories", () => {
    const f = draftToFields({ ...base, title: " Hike ", description: "  ", location: " Rattlesnake Ledge ", categoryIds: ["a", "b", "a"] }, LA);
    expect(f.title).toBe("Hike");
    expect(f.description).toBeUndefined();
    expect(f.location).toBe("Rattlesnake Ledge");
    expect(f.categoryIds).toEqual(["a", "b"]);
  });
});
