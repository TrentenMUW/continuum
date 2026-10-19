// Event draft validation and conversion to a stored record (§5.6).

import { addCalDays, fromLocalInput, isCalDate } from "../time/calDate";
import type { CalendarEvent } from "./types";

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
}

export type DraftErrors = Partial<Record<"title" | "start" | "end" | "categories", string>>;

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
  return errors;
}

/**
 * Turn a valid draft into the record fields it controls. Timed values become UTC
 * instants; all-day dates stay calendar dates with an EXCLUSIVE end (§6).
 */
export function draftToFields(
  d: EventDraft,
  zone: string,
): Pick<CalendarEvent, "title" | "allDay" | "start" | "end" | "startDate" | "endDate" | "categoryIds" | "description" | "location"> {
  const optional = (s: string) => (s.trim() ? s.trim() : undefined);
  const base = {
    title: d.title.trim(),
    allDay: d.allDay,
    categoryIds: [...new Set(d.categoryIds)],
    description: optional(d.description),
    location: optional(d.location),
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
