import { TZDate } from "@date-fns/tz";
import type { CalDate } from "../data/types";

const pad = (n: number) => String(n).padStart(2, "0");

export function parseCalDate(d: CalDate): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`Invalid calendar date: ${d}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function isCalDate(d: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return false;
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, da));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === da;
}

/** Local midnight at the start of `d` in `zone`, as epoch ms (D12, §5.12). */
export function startOfCalDate(d: CalDate, zone: string): number {
  const { year, month, day } = parseCalDate(d);
  return TZDate.tz(zone, year, month - 1, day).getTime();
}

/** The calendar date `t` falls on in `zone`. */
export function calDateOf(t: number, zone: string): CalDate {
  const z = new TZDate(t, zone);
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
}

/** Calendar-date arithmetic (no zone involved: a date is a date). */
export function addCalDays(d: CalDate, n: number): CalDate {
  const { year, month, day } = parseCalDate(d);
  const u = new Date(Date.UTC(year, month - 1, day + n));
  return `${u.getUTCFullYear()}-${pad(u.getUTCMonth() + 1)}-${pad(u.getUTCDate())}`;
}

/** "YYYY-MM-DDTHH:mm" for an <input type="datetime-local">, showing `t` in `zone`. */
export function toLocalInput(t: number, zone: string): string {
  const z = new TZDate(t, zone);
  return `${calDateOf(t, zone)}T${pad(z.getHours())}:${pad(z.getMinutes())}`;
}

/** Parse a datetime-local value as wall-clock time in `zone`. Returns null if malformed. */
export function fromLocalInput(value: string, zone: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m || !isCalDate(`${m[1]}-${m[2]}-${m[3]}`)) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  if (h > 23 || mi > 59) return null;
  return TZDate.tz(zone, y, mo - 1, d, h, mi).getTime();
}
