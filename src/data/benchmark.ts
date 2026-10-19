// §7 benchmark data: 1,000 one-off events plus 50 recurring series, including daily ones
// that never end. Opened with ?benchmark, in its own database, never the user's.

import type { CalendarEvent, Category } from "./types";

export const BENCHMARK_DB_NAME = "continuum-benchmark";

export function isBenchmarkMode(search: string = typeof location === "undefined" ? "" : location.search): boolean {
  return new URLSearchParams(search).has("benchmark");
}

/** Small deterministic PRNG (mulberry32), so every run sees the same data. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MIN = 60_000;
const DAY = 86_400_000;

export function generateBenchmark(categories: readonly Category[], zone: string, now: number): CalendarEvent[] {
  const rand = rng(490);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
  const ids = categories.map((c) => c.id);
  const stamp = new Date(now).toISOString();
  const out: CalendarEvent[] = [];
  const base = (title: string, i: number): Pick<CalendarEvent, "id" | "title" | "timeZone" | "source" | "createdAt" | "updatedAt"> => ({
    id: `bench-${i}`,
    title,
    timeZone: zone,
    source: "manual",
    createdAt: stamp,
    updatedAt: stamp,
  });

  // 1,000 one-off events, densest near now and thinning into the future (principle 6).
  for (let i = 0; i < 1000; i++) {
    const offsetDays = i < 600 ? (rand() - 0.2) * 120 : i < 900 ? rand() * 3650 : rand() * 40 * 365;
    const start = Math.round((now + offsetDays * DAY) / (15 * MIN)) * 15 * MIN;
    const minutes = pick([15, 30, 45, 60, 90, 120, 180, 240, 480]);
    const cats = rand() < 0.15 ? [pick(ids), pick(ids)] : [pick(ids)];
    out.push({
      ...base(`Event ${i + 1}`, i),
      allDay: false,
      start: new Date(start).toISOString(),
      end: new Date(start + minutes * MIN).toISOString(),
      categoryIds: [...new Set(cats)],
    });
  }

  // 50 series. Times are wall-clock in `zone`, starting this week.
  const day0 = new Date(Math.floor(now / DAY) * DAY);
  const at = (h: number, m = 0) => new Date(day0.getTime() + (h * 60 + m) * MIN).toISOString();
  const series = (i: number, title: string, rrule: string, startH: number, minutes: number) => {
    out.push({
      ...base(title, 1000 + i),
      allDay: false,
      start: at(startH),
      end: new Date(Date.parse(at(startH)) + minutes * MIN).toISOString(),
      categoryIds: [ids[i % ids.length]!],
      recurrence: { rrule, exdates: [] },
    });
  };
  let i = 0;
  for (let k = 0; k < 10; k++) series(i++, `Daily habit ${k + 1}`, "FREQ=DAILY", 6 + k, 30 + 15 * (k % 4)); // never end
  for (let k = 0; k < 15; k++) series(i++, `Weekly ${k + 1}`, pick(["FREQ=WEEKLY;BYDAY=MO,WE,FR", "FREQ=WEEKLY;BYDAY=TU,TH", "FREQ=WEEKLY;BYDAY=SA"]), 8 + (k % 10), 60);
  for (let k = 0; k < 5; k++) series(i++, `Biweekly ${k + 1}`, "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO", 13 + k, 90);
  for (let k = 0; k < 8; k++) series(i++, `Monthly ${k + 1}`, `FREQ=MONTHLY;BYMONTHDAY=${1 + k * 3}`, 18, 120);
  for (let k = 0; k < 7; k++) series(i++, `Yearly ${k + 1}`, "FREQ=YEARLY", 12, 240);
  for (let k = 0; k < 5; k++) series(i++, `Course ${k + 1}`, "FREQ=DAILY;COUNT=500", 15 + k, 50);
  return out;
}
