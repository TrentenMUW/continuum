// .ics parsing into import candidates (§5.8). Nothing is written here; see preview.ts.

import ICAL from "ical.js";
import type { CalendarEvent, OccurrenceKey } from "../data/types";
import { addCalDays } from "../time/calDate";
import { wallToInstant, type WallTime } from "../time/localTime";
import { parseRRule } from "../time/rrule";
import { resolveTzid } from "../time/zones";

export type ImportFields = Pick<
  CalendarEvent,
  "title" | "description" | "location" | "allDay" | "start" | "end" | "startDate" | "endDate" | "timeZone" | "recurrence"
>;

export interface IcsCandidate {
  uid: string;
  /** Set on an exception to one occurrence of a series (an override or a cancellation). */
  recurrenceId?: OccurrenceKey;
  cancelled: boolean;
  fields: ImportFields;
  warnings: string[];
}

export interface SkippedItem {
  title: string;
  reason: string;
}

export interface IcsParse {
  candidates: IcsCandidate[];
  skipped: SkippedItem[];
  /** File-level notes, e.g. time zones resolved through VTIMEZONE. */
  warnings: string[];
}

/** The file can't be read at all. Nothing is imported. */
export class ImportError extends Error {}

const SUPPORTED_FREQ = new Set(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);
type ICALTime = InstanceType<typeof ICAL.Time>;
type ICALComponent = InstanceType<typeof ICAL.Component>;
type ICALProperty = InstanceType<typeof ICAL.Property>;

const pad = (n: number) => String(n).padStart(2, "0");
const dateOf = (t: ICALTime) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;
const wallOfTime = (t: ICALTime): WallTime => ({ year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute, second: t.second });

export function parseIcs(text: string, displayZone: string): IcsParse {
  let root: ICALComponent;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch (err) {
    throw new ImportError(`This doesn't look like a valid .ics file (${err instanceof Error ? err.message : String(err)}).`);
  }
  const calendar = root.name === "vcalendar" ? root : root.getFirstSubcomponent("vcalendar");
  if (!calendar) throw new ImportError("This file has no VCALENDAR, so it isn't a calendar export.");

  const vtimezones = new Map<string, ICALComponent>();
  for (const vtz of calendar.getAllSubcomponents("vtimezone")) {
    const id = vtz.getFirstPropertyValue("tzid");
    if (typeof id === "string") vtimezones.set(id, vtz);
  }

  const fileWarnings = new Set<string>();
  const out: IcsParse = { candidates: [], skipped: [], warnings: [] };

  /** Resolve a date-time property per D15. Returns the instant and the zone repeats should follow. */
  const resolve = (prop: ICALProperty | null, t: ICALTime): { instant: number; zone: string } => {
    if (t.zone?.tzid === "UTC") {
      return { instant: Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second), zone: "UTC" };
    }
    const tzid = prop?.getParameter("tzid");
    if (typeof tzid !== "string") return { instant: wallToInstant(wallOfTime(t), displayZone), zone: displayZone }; // floating
    const r = resolveTzid(tzid);
    if (r.zone) return { instant: wallToInstant(wallOfTime(t), r.zone), zone: r.zone };

    const vtz = vtimezones.get(tzid.replace(/^"|"$/g, ""));
    if (vtz) {
      const local = t.clone();
      local.zone = new ICAL.Timezone(vtz);
      fileWarnings.add(
        `Time zone “${tzid}” isn't a standard name. Times were converted with the file's own definition of it, and repeating events follow your display zone.`,
      );
      return { instant: local.toUnixTime() * 1000, zone: displayZone };
    }
    fileWarnings.add(`Time zone “${tzid}” is unknown and the file doesn't define it, so those times were read in your display zone.`);
    return { instant: wallToInstant(wallOfTime(t), displayZone), zone: displayZone };
  };

  for (const v of calendar.getAllSubcomponents("vevent")) {
    const title = String(v.getFirstPropertyValue("summary") ?? "").trim() || "(No title)";
    const warnings: string[] = [];
    const skip = (reason: string) => out.skipped.push({ title, reason });

    const dtstartProp = v.getFirstProperty("dtstart");
    const dtstart = dtstartProp?.getFirstValue() as ICALTime | undefined;
    if (!dtstartProp || !dtstart) {
      skip("It has no start time.");
      continue;
    }

    let uid = v.getFirstPropertyValue("uid");
    if (typeof uid !== "string" || !uid.trim()) {
      uid = `generated:${title}|${dtstart.toString()}`;
      warnings.push("It has no UID, so it's matched on re-import by its title and start time.");
    }

    const rrule = v.getFirstPropertyValue("rrule") as InstanceType<typeof ICAL.Recur> | null;
    const ruleText = rrule ? rrule.toString() : undefined;
    if (ruleText) {
      const freq = parseRRule(ruleText).get("FREQ");
      if (!freq || !SUPPORTED_FREQ.has(freq)) {
        skip(`It repeats ${freq ? `${freq.toLowerCase()}` : "with an unknown rule"}, and only daily, weekly, monthly, and yearly repeats are supported.`);
        continue;
      }
    }
    if (v.getAllProperties("rdate").length > 0) warnings.push("Its extra dates (RDATE) aren't supported and weren't imported.");

    const allDay = dtstart.isDate;
    const dtendProp = v.getFirstProperty("dtend");
    const dtend = dtendProp?.getFirstValue() as ICALTime | undefined;
    const duration = v.getFirstPropertyValue("duration") as InstanceType<typeof ICAL.Duration> | null;

    let fields: ImportFields;
    let zone: string;
    if (allDay) {
      const startDate = dateOf(dtstart);
      let endDate = dtend ? dateOf(dtend) : duration ? addCalDays(startDate, Math.max(1, Math.round(duration.toSeconds() / 86400))) : addCalDays(startDate, 1);
      if (endDate <= startDate) endDate = addCalDays(startDate, 1);
      zone = displayZone;
      fields = { title, allDay: true, startDate, endDate, timeZone: zone };
    } else {
      const start = resolve(dtstartProp, dtstart);
      zone = start.zone;
      const end = dtend ? resolve(dtendProp, dtend).instant : start.instant + (duration ? duration.toSeconds() * 1000 : 0);
      if (end < start.instant) {
        skip("It ends before it starts.");
        continue;
      }
      fields = {
        title,
        allDay: false,
        start: new Date(start.instant).toISOString(),
        end: new Date(end).toISOString(),
        timeZone: zone,
      };
    }

    const description = String(v.getFirstPropertyValue("description") ?? "").trim();
    const location = String(v.getFirstPropertyValue("location") ?? "").trim();
    if (description) fields.description = description;
    if (location) fields.location = location;

    /** An occurrence key for a date or date-time in this event's terms (§6). */
    const keyFor = (prop: ICALProperty, t: ICALTime): OccurrenceKey => {
      if (allDay) return dateOf(t);
      if (t.isDate) {
        // A date-only EXDATE on a timed series: the occurrence at the series' time of day.
        return new Date(wallToInstant({ ...wallOfTime(dtstart), year: t.year, month: t.month, day: t.day }, zone)).toISOString();
      }
      return new Date(resolve(prop, t).instant).toISOString();
    };

    if (ruleText) {
      const exdates = v.getAllProperties("exdate").flatMap((p) => p.getValues().map((t) => keyFor(p, t as ICALTime)));
      fields.recurrence = { rrule: ruleText, exdates: [...new Set(exdates)] };
    }

    const ridProp = v.getFirstProperty("recurrence-id");
    const rid = ridProp?.getFirstValue() as ICALTime | undefined;
    const status = String(v.getFirstPropertyValue("status") ?? "").toUpperCase();

    out.candidates.push({
      uid,
      recurrenceId: ridProp && rid ? keyFor(ridProp, rid) : undefined,
      cancelled: status === "CANCELLED",
      fields,
      warnings,
    });
  }

  out.warnings = [...fileWarnings];
  return out;
}
