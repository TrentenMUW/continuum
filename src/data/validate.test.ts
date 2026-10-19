import { describe, expect, it } from "vitest";
import { draftToFields, validateDraft, type EventDraft } from "./validate";

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
};

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
