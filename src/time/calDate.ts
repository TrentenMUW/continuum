import { TZDate } from "@date-fns/tz";
import type { CalDate } from "../data/types";

export function parseCalDate(d: CalDate): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`Invalid calendar date: ${d}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Local midnight at the start of `d` in `zone`, as epoch ms (D12, §5.12). */
export function startOfCalDate(d: CalDate, zone: string): number {
  const { year, month, day } = parseCalDate(d);
  return TZDate.tz(zone, year, month - 1, day).getTime();
}

/** The calendar date `t` falls on in `zone`. */
export function calDateOf(t: number, zone: string): CalDate {
  const z = new TZDate(t, zone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
}
