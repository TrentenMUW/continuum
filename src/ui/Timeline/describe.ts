import type { Occurrence } from "../../data/index";
import { addCalDays, parseCalDate } from "../../time/calDate";
import { offsetAt } from "../../time/localTime";

// Labels are built for every visible event on every layout (hundreds at once), so this
// formats from cached zone offsets instead of date-fns + TZDate, which is ~40× slower.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

function local(t: number, zone: string): Date {
  return new Date(t + offsetAt(zone, t) * 60_000); // read with getUTC*
}
/** "Sat 24 Oct 2026" */
function day(d: Date): string {
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** "09:00" */
function time(d: Date): string {
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "Hike, Sat 24 Oct 2026, 09:00 – 11:00": the tooltip and accessible name of an event (§5.11). */
export function describeOccurrence(o: Occurrence, zone: string): string {
  return `${o.event.title}, ${describeRange(o, zone)}`;
}

export function describeRange(o: Occurrence, zone: string): string {
  const e = o.event;
  if (e.allDay && (o.key ?? e.startDate) && e.startDate && e.endDate) {
    // A series occurrence starts on its key's date; keep the series' length.
    const first = e.recurrence && o.key ? o.key : e.startDate;
    const lengthDays = Math.round((dateMs(e.endDate) - dateMs(e.startDate)) / 86_400_000);
    const last = addCalDays(first, Math.max(1, lengthDays) - 1); // stored end is exclusive
    const d = (cal: string) => {
      const { year, month, day: dd } = parseCalDate(cal);
      return day(new Date(Date.UTC(year, month - 1, dd)));
    };
    return last === first ? `${d(first)}, all day` : `${d(first)} – ${d(last)}, all day`;
  }
  const s = local(o.start, zone);
  const en = local(o.end, zone);
  const sameDay = s.getUTCFullYear() === en.getUTCFullYear() && s.getUTCMonth() === en.getUTCMonth() && s.getUTCDate() === en.getUTCDate();
  return sameDay ? `${day(s)}, ${time(s)} – ${time(en)}` : `${day(s)}, ${time(s)} – ${day(en)}, ${time(en)}`;
}

function dateMs(cal: string): number {
  const { year, month, day: d } = parseCalDate(cal);
  return Date.UTC(year, month - 1, d);
}
