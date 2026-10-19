import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import type { Occurrence } from "../../data/index";
import { addCalDays, startOfCalDate } from "../../time/calDate";

/** "Hike, Sat 24 Oct 2026, 09:00 – 11:00": the tooltip and accessible name of an event (§5.11). */
export function describeOccurrence(o: Occurrence, zone: string): string {
  return `${o.event.title}, ${describeRange(o, zone)}`;
}

export function describeRange(o: Occurrence, zone: string): string {
  const e = o.event;
  if (e.allDay && e.startDate && e.endDate) {
    const lastDay = addCalDays(e.endDate, -1); // stored end is exclusive
    const d = (cal: string) => format(new TZDate(startOfCalDate(cal, zone), zone), "EEE d MMM yyyy");
    return lastDay === e.startDate ? `${d(e.startDate)}, all day` : `${d(e.startDate)} – ${d(lastDay)}, all day`;
  }
  const s = new TZDate(o.start, zone);
  const en = new TZDate(o.end, zone);
  const sameDay = format(s, "yyyy-MM-dd") === format(en, "yyyy-MM-dd");
  return sameDay
    ? `${format(s, "EEE d MMM yyyy, HH:mm")} – ${format(en, "HH:mm")}`
    : `${format(s, "EEE d MMM yyyy, HH:mm")} – ${format(en, "EEE d MMM yyyy, HH:mm")}`;
}
