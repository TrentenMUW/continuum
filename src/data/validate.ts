// Event draft validation and conversion to a stored record (§5.6).

import { addCalDays, calDateOf, fromLocalInput, isCalDate, parseCalDate, startOfCalDate } from "../time/calDate";
import { formatUntilDate, formatUntilInstant, parseRRule, parseUntil, WEEKDAYS, type Freq, type Weekday } from "../time/rrule";
import type { CalendarEvent } from "./types";

/** The repeat controls (§5.6): daily, weekly on chosen days, monthly by day of month, or yearly. */
export interface RepeatDraft {
  freq: "NONE" | Freq;
  interval: string;
  weekdays: Weekday[];
  ends: "never" | "on" | "after";
  untilDate: string; // inclusive, YYYY-MM-DD
  count: string;
  /** The stored rule, kept verbatim unless the controls are touched. */
  original?: string;
  touched: boolean;
  /** The stored rule uses parts these controls can't show (e.g. from an import). */
  custom: boolean;
}

/** What the editor form holds. All-day `endDate` is INCLUSIVE here. */
export interface EventDraft {
  title: string;
  allDay: boolean;
  startLocal: string; // datetime-local value, timed events
  endLocal: string;
  startDate: string; // YYYY-MM-DD, all-day events
  endDate: string; // inclusive
  categoryIds: string[];
  description: string;
  location: string;
  repeat: RepeatDraft;
}

export const NO_REPEAT: RepeatDraft = {
  freq: "NONE",
  interval: "1",
  weekdays: [],
  ends: "never",
  untilDate: "",
  count: "10",
  touched: false,
  custom: false,
};

export type DraftErrors = Partial<Record<"title" | "start" | "end" | "categories" | "repeat", string>>;

const positiveInt = (s: string) => /^\d+$/.test(s.trim()) && Number(s) >= 1;

/** The draft's start date (YYYY-MM-DD), whichever kind of event it is. */
export function draftStartDate(d: EventDraft): string {
  return d.allDay ? d.startDate : d.startLocal.slice(0, 10);
}

export function validateDraft(d: EventDraft, zone: string): DraftErrors {
  const errors: DraftErrors = {};
  if (!d.title.trim()) errors.title = "Enter a title.";
  if (d.categoryIds.length === 0) errors.categories = "Choose at least one category.";

  if (d.allDay) {
    if (!isCalDate(d.startDate)) errors.start = "Enter a start date.";
    if (!isCalDate(d.endDate)) errors.end = "Enter an end date.";
    else if (isCalDate(d.startDate) && d.endDate < d.startDate) errors.end = "The end date can't be before the start date.";
  } else {
    const start = fromLocalInput(d.startLocal, zone);
    const end = fromLocalInput(d.endLocal, zone);
    if (start === null) errors.start = "Enter a start date and time.";
    if (end === null) errors.end = "Enter an end date and time.";
    else if (start !== null && end <= start) errors.end = "The end must be after the start.";
  }

  const r = d.repeat;
  if (r.freq !== "NONE" && !(r.custom && !r.touched)) {
    if (!positiveInt(r.interval)) errors.repeat = "Repeat every must be a whole number of at least 1.";
    else if (r.freq === "WEEKLY" && r.weekdays.length === 0) errors.repeat = "Choose at least one day of the week.";
    else if (r.ends === "on" && !isCalDate(r.untilDate)) errors.repeat = "Enter the date the series ends.";
    else if (r.ends === "on" && r.untilDate < draftStartDate(d)) errors.repeat = "The series can't end before it starts.";
    else if (r.ends === "after" && !positiveInt(r.count)) errors.repeat = "Enter how many times it repeats.";
  }
  return errors;
}

/** Build the RRULE for the repeat controls, or keep the stored one if they weren't touched. */
export function buildRepeatRule(d: EventDraft, zone: string): string | undefined {
  const r = d.repeat;
  if (r.freq === "NONE") return undefined;
  if (r.original && !r.touched) return r.original;
  const parts = [`FREQ=${r.freq}`];
  if (Number(r.interval) > 1) parts.push(`INTERVAL=${Number(r.interval)}`);
  if (r.freq === "WEEKLY") parts.push(`BYDAY=${WEEKDAYS.filter((w) => r.weekdays.includes(w)).join(",")}`);
  if (r.freq === "MONTHLY") parts.push(`BYMONTHDAY=${parseCalDate(draftStartDate(d)).day}`);
  if (r.ends === "on") {
    // The end date is inclusive: through the end of that local day.
    parts.push(
      `UNTIL=${d.allDay ? formatUntilDate(r.untilDate) : formatUntilInstant(startOfCalDate(addCalDays(r.untilDate, 1), zone) - 1000)}`,
    );
  }
  if (r.ends === "after") parts.push(`COUNT=${Number(r.count)}`);
  return parts.join(";");
}

/** Repeat controls for a stored rule. Rules the controls can't express are marked custom. */
export function repeatFromRule(rrule: string | undefined, zone: string): RepeatDraft {
  if (!rrule) return { ...NO_REPEAT };
  const p = parseRRule(rrule);
  const freq = p.get("FREQ") as Freq | undefined;
  const known = new Set(["FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY", "UNTIL", "COUNT", "WKST"]);
  const byday = p.get("BYDAY")?.split(",") ?? [];
  const custom =
    !freq ||
    !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq) ||
    [...p.keys()].some((k) => !known.has(k)) ||
    (p.has("BYDAY") && (freq !== "WEEKLY" || byday.some((d) => !(WEEKDAYS as readonly string[]).includes(d)))) ||
    (p.has("BYMONTHDAY") && (freq !== "MONTHLY" || p.get("BYMONTHDAY")!.includes(",")));

  const until = parseUntil(p.get("UNTIL"));
  const untilDate = !until ? "" : until.kind === "date" ? until.date : until.kind === "instant" ? calDateOf(until.t, zone) : until.wall.slice(0, 10);
  return {
    freq: freq && !custom ? freq : (freq as Freq) ?? "NONE",
    interval: p.get("INTERVAL") ?? "1",
    weekdays: byday.filter((d): d is Weekday => (WEEKDAYS as readonly string[]).includes(d)),
    ends: p.has("UNTIL") ? "on" : p.has("COUNT") ? "after" : "never",
    untilDate,
    count: p.get("COUNT") ?? "10",
    original: rrule,
    touched: false,
    custom,
  };
}

type DraftFields = Pick<
  CalendarEvent,
  "title" | "allDay" | "start" | "end" | "startDate" | "endDate" | "categoryIds" | "description" | "location" | "recurrence"
>;

/**
 * Turn a valid draft into the record fields it controls. Timed values become UTC
 * instants; all-day dates stay calendar dates with an EXCLUSIVE end (§6). The
 * returned recurrence has no EXDATEs; callers keep the stored ones where they apply.
 */
export function draftToFields(d: EventDraft, zone: string): DraftFields {
  const optional = (s: string) => (s.trim() ? s.trim() : undefined);
  const rrule = buildRepeatRule(d, zone);
  const base = {
    title: d.title.trim(),
    allDay: d.allDay,
    categoryIds: [...new Set(d.categoryIds)],
    description: optional(d.description),
    location: optional(d.location),
    recurrence: rrule ? { rrule, exdates: [] } : undefined,
  };
  if (d.allDay) {
    return { ...base, start: undefined, end: undefined, startDate: d.startDate, endDate: addCalDays(d.endDate, 1) };
  }
  return {
    ...base,
    start: new Date(fromLocalInput(d.startLocal, zone)!).toISOString(),
    end: new Date(fromLocalInput(d.endLocal, zone)!).toISOString(),
    startDate: undefined,
    endDate: undefined,
  };
}
