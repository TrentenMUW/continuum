import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "../data/defaults";
import type { Category } from "../data/types";
import { CSV_EXAMPLE, parseCsv } from "./csv";

const LA = "America/Los_Angeles";
const fixture = (name: string) => readFileSync(new URL(`../../tests/fixtures/${name}`, import.meta.url), "utf8");
const categories: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({ id: `c${i}`, name: c.name, color: c.color, order: i + 1, visible: true }));

describe("parseCsv (§5.9)", () => {
  it("parses the documented example exactly", () => {
    const p = parseCsv(CSV_EXAMPLE, categories, LA);
    expect(p.errors).toEqual([]);
    expect(p.rows).toHaveLength(3);
    expect(p.rows[0]).toMatchObject({
      row: 2,
      categoryNames: ["Health & Exercise"],
      fields: { title: "Morning run", allDay: false, start: "2026-10-20T14:00:00.000Z", end: "2026-10-20T14:45:00.000Z", location: "Green Lake" },
    });
    // All-day end is inclusive in the file and exclusive when stored.
    expect(p.rows[1]!.fields).toMatchObject({ allDay: true, startDate: "2026-11-03", endDate: "2026-11-04" });
    expect(p.rows[1]!.categoryNames).toEqual(["Life & Logistics", "Health & Exercise"]);
    expect(p.rows[2]!.fields.recurrence).toEqual({ rrule: "FREQ=WEEKLY;COUNT=10", exdates: [] });
  });

  it("matches category names case-insensitively and lists unknown ones", () => {
    const p = parseCsv(fixture("sample.csv"), categories, LA);
    expect(p.errors).toEqual([]);
    expect(p.rows).toHaveLength(5);
    expect(p.unknownCategories).toEqual(["pottery"]);
    expect(p.rows[4]!.fields).toMatchObject({ startDate: "2026-11-27", endDate: "2026-11-30" });
  });

  it("reports every bad row by its row number and accepts none of them", () => {
    const p = parseCsv(fixture("bad-row.csv"), categories, LA);
    expect(p.rows.map((r) => r.row)).toEqual([2]);
    expect(p.errors.map((e) => e.row)).toEqual([3, 4, 5, 6, 7]);
    const msg = Object.fromEntries(p.errors.map((e) => [e.row, e.message]));
    expect(msg[3]).toMatch(/offset/);
    expect(msg[4]).toMatch(/valid date/);
    expect(msg[5]).toMatch(/not after/);
    expect(msg[6]).toMatch(/title/);
    expect(msg[7]).toMatch(/FREQ/);
  });

  it("an empty end means a single all-day day", () => {
    const p = parseCsv("title,start,end,allDay\nDay off,2026-12-24,,true\n", categories, LA);
    expect(p.rows[0]!.fields).toMatchObject({ startDate: "2026-12-24", endDate: "2026-12-25" });
  });

  it("requires the header columns", () => {
    const p = parseCsv("name,when\nx,y\n", categories, LA);
    expect(p.errors[0]).toMatchObject({ row: 1 });
    expect(p.rows).toEqual([]);
  });

  it("handles quoted commas, a BOM, and blank lines", () => {
    const p = parseCsv('﻿title,start,end,allDay,description\n"Lunch, with Sam",2026-10-20T12:00:00Z,2026-10-20T13:00:00Z,false,"a, b"\n\n', categories, LA);
    expect(p.errors).toEqual([]);
    expect(p.rows[0]!.fields).toMatchObject({ title: "Lunch, with Sam", description: "a, b" });
  });
});
