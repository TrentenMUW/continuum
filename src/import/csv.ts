// CSV parsing and validation (§5.9). Nothing is written here; see preview.ts.

import ICAL from "ical.js";
import Papa from "papaparse";
import type { Category } from "../data/types";
import { addCalDays, isCalDate } from "../time/calDate";
import { parseRRule } from "../time/rrule";
import type { ImportFields } from "./ics";

export const CSV_COLUMNS = ["title", "start", "end", "allDay", "description", "location", "categories", "rrule"] as const;

/** The documented format, shown in the import dialog (and the README). */
export const CSV_EXAMPLE = `title,start,end,allDay,description,location,categories,rrule
Morning run,2026-10-20T07:00:00-07:00,2026-10-20T07:45:00-07:00,false,,Green Lake,Health & Exercise,
Dentist,2026-11-03,2026-11-03,true,,,Life & Logistics;Health & Exercise,
Study group,2026-10-21T18:00:00-07:00,2026-10-21T20:00:00-07:00,false,Linear algebra,,Education;Social & Relationships,FREQ=WEEKLY;COUNT=10`;

export interface CsvRow {
  row: number; // spreadsheet-style: the header is row 1
  fields: ImportFields;
  /** Category names as written, matched case-insensitively later. Empty means Miscellaneous. */
  categoryNames: string[];
}

export interface CsvError {
  row: number;
  message: string;
}

export interface CsvParse {
  rows: CsvRow[];
  errors: CsvError[];
  /** Names that match no existing category (first spelling seen). */
  unknownCategories: string[];
}

const TIMED = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const SUPPORTED_FREQ = new Set(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);

export function parseCsv(text: string, categories: readonly Category[], displayZone: string): CsvParse {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: false });
  const out: CsvParse = { rows: [], errors: [], unknownCategories: [] };
  const lines = parsed.data;
  const header = (lines[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  for (const required of ["title", "start", "end"]) {
    if (col(required) < 0) {
      out.errors.push({ row: 1, message: `The header row needs a “${required}” column. Expected: ${CSV_COLUMNS.join(",")}` });
    }
  }
  if (out.errors.length) return out;

  const known = new Map(categories.map((c) => [c.name.toLowerCase(), c.name]));
  const unknown = new Map<string, string>();

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!;
    const row = i + 1;
    if (cells.every((c) => !c.trim())) continue; // blank line
    const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? "").trim() : "");
    const fail = (message: string) => out.errors.push({ row, message });

    const title = get("title");
    const start = get("start");
    const end = get("end");
    const allDayText = get("allDay").toLowerCase();
    if (!title) {
      fail("The title is empty.");
      continue;
    }
    if (allDayText && allDayText !== "true" && allDayText !== "false") {
      fail(`allDay must be true or false, not “${get("allDay")}”.`);
      continue;
    }
    const allDay = allDayText ? allDayText === "true" : isCalDate(start);

    let fields: ImportFields;
    if (allDay) {
      const endInclusive = end || start;
      if (!isCalDate(start)) {
        fail(`“${start}” isn't a valid date (use YYYY-MM-DD for all-day rows).`);
        continue;
      }
      if (!isCalDate(endInclusive)) {
        fail(`“${end}” isn't a valid end date (use YYYY-MM-DD, or leave it empty for one day).`);
        continue;
      }
      if (endInclusive < start) {
        fail("The end date is before the start date.");
        continue;
      }
      fields = { title, allDay: true, startDate: start, endDate: addCalDays(endInclusive, 1), timeZone: displayZone };
    } else {
      const s = timed(start);
      const e = timed(end);
      if (s === null) {
        fail(`“${start}” isn't a valid start. Timed rows need ISO 8601 with an offset, like 2026-10-20T07:00:00-07:00.`);
        continue;
      }
      if (e === null) {
        fail(`“${end}” isn't a valid end. Timed rows need ISO 8601 with an offset, like 2026-10-20T07:45:00-07:00.`);
        continue;
      }
      if (e <= s) {
        fail("The end is not after the start.");
        continue;
      }
      fields = { title, allDay: false, start: new Date(s).toISOString(), end: new Date(e).toISOString(), timeZone: displayZone };
    }

    const description = get("description");
    const location = get("location");
    if (description) fields.description = description;
    if (location) fields.location = location;

    const rrule = get("rrule").replace(/^RRULE:/i, "");
    if (rrule) {
      const problem = ruleProblem(rrule);
      if (problem) {
        fail(problem);
        continue;
      }
      fields.recurrence = { rrule: ICAL.Recur.fromString(rrule).toString(), exdates: [] };
    }

    const names = get("categories")
      .split(";")
      .map((n) => n.trim())
      .filter(Boolean);
    for (const n of names) if (!known.has(n.toLowerCase()) && !unknown.has(n.toLowerCase())) unknown.set(n.toLowerCase(), n);

    out.rows.push({ row, fields, categoryNames: names });
  }
  out.unknownCategories = [...unknown.values()];
  return out;
}

/** Epoch ms for an ISO 8601 date-time with an offset, or null. Impossible dates are rejected. */
function timed(value: string): number | null {
  const m = TIMED.exec(value);
  if (!m || !isCalDate(m[1]!)) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function ruleProblem(rrule: string): string | null {
  const freq = parseRRule(rrule).get("FREQ");
  if (!freq || !SUPPORTED_FREQ.has(freq)) return `The rrule “${rrule}” needs FREQ=DAILY, WEEKLY, MONTHLY, or YEARLY.`;
  try {
    ICAL.Recur.fromString(rrule);
    return null;
  } catch (err) {
    return `The rrule “${rrule}” isn't valid (${err instanceof Error ? err.message : String(err)}).`;
  }
}
