// Small helpers for RFC 5545 RRULE strings ("FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10").
// Iteration itself is ical.js's job (D3); this only reads and edits the text.

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export function parseRRule(rrule: string): Map<string, string> {
  const parts = new Map<string, string>();
  for (const piece of rrule.replace(/^RRULE:/i, "").split(";")) {
    const eq = piece.indexOf("=");
    if (eq > 0) parts.set(piece.slice(0, eq).trim().toUpperCase(), piece.slice(eq + 1).trim().toUpperCase());
  }
  return parts;
}

/** FREQ first, then the rest in their original order. */
export function buildRRule(parts: Map<string, string>): string {
  const keys = [...parts.keys()].sort((a, b) => (a === "FREQ" ? -1 : b === "FREQ" ? 1 : 0));
  return keys.map((k) => `${k}=${parts.get(k)}`).join(";");
}

export function withParts(rrule: string, set: Record<string, string | null>): string {
  const parts = parseRRule(rrule);
  for (const [k, v] of Object.entries(set)) {
    if (v === null) parts.delete(k);
    else parts.set(k, v);
  }
  return buildRRule(parts);
}

export type Until = { kind: "date"; date: string } | { kind: "instant"; t: number } | { kind: "floating"; wall: string };

/** UNTIL as a date (YYYYMMDD), a UTC instant (…Z), or a floating local date-time. */
export function parseUntil(value: string | undefined): Until | null {
  if (!value) return null;
  const d = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (d) return { kind: "date", date: `${d[1]}-${d[2]}-${d[3]}` };
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!dt) return null;
  const [y, mo, da, h, mi, s] = dt.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  if (dt[7] === "Z") return { kind: "instant", t: Date.UTC(y, mo - 1, da, h, mi, s) };
  return { kind: "floating", wall: `${dt[1]}-${dt[2]}-${dt[3]}T${dt[4]}:${dt[5]}:${dt[6]}` };
}

/** UNTIL value for a UTC instant: "20261019T160000Z". */
export function formatUntilInstant(t: number): string {
  return new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** UNTIL value for a calendar date: "20261019". */
export function formatUntilDate(calDate: string): string {
  return calDate.replace(/-/g, "");
}
