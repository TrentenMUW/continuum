// In-memory interval index (D4). IndexedDB is for persistence; window queries run here.

import { startOfCalDate } from "../time/calDate";
import { ExpansionCache, seriesCoverage } from "../time/recurrence";
import type { CalendarEvent, OccurrenceKey } from "./types";

/** One placement of an event on the timeline. */
export interface Occurrence {
  event: CalendarEvent;
  start: number; // epoch ms
  end: number;
  /** Set for occurrences of a series, and for overrides (the occurrence they replace). */
  key?: OccurrenceKey;
  /**
   * Set on a whole-series coverage band used at very wide zoom (see seriesCoverage):
   * the average fraction of [start, end) the series covers. Drawn only as density.
   */
  coverage?: number;
}

/** A stable id for one occurrence: the event id, plus the occurrence key for series. */
export function occurrenceId(o: Occurrence): string {
  return o.event.recurrence && o.key ? `${o.event.id}@${o.key}` : o.event.id;
}

/** Resolve an event's instants. All-day events span local midnight → local midnight in the display zone (§5.12). */
export function eventBounds(e: CalendarEvent, zone: string): { start: number; end: number } | null {
  if (e.allDay) {
    if (!e.startDate || !e.endDate) return null;
    return { start: startOfCalDate(e.startDate, zone), end: startOfCalDate(e.endDate, zone) };
  }
  if (!e.start || !e.end) return null;
  return { start: Date.parse(e.start), end: Date.parse(e.end) };
}

export class EventIndex {
  /** One-off events and overrides, sorted by start. */
  private items: Occurrence[] = [];
  private maxDuration = 0;
  private byId = new Map<string, Occurrence>();
  /** Recurring series, expanded lazily per window (D3, §7). */
  private series = new Map<string, CalendarEvent>();
  /** Occurrence keys of each series that an override record replaces. */
  private overrideKeys = new Map<string, Set<string>>();
  private cache = new ExpansionCache();

  constructor(
    events: readonly CalendarEvent[],
    private readonly zone: string,
  ) {
    for (const e of events) this.place(e);
    this.items.sort((a, b) => a.start - b.start);
    this.recomputeMax();
  }

  /** One-off events and overrides (not series occurrences). */
  get size(): number {
    return this.items.length;
  }

  get seriesCount(): number {
    return this.series.size;
  }

  /**
   * Every occurrence overlapping [from, to). With `msPerPx`, dense simple series at very
   * wide zoom come back as one coverage band each instead of every occurrence.
   */
  query(from: number, to: number, msPerPx?: number): Occurrence[] {
    // Anything starting before from − maxDuration has already ended.
    let i = lowerBound(this.items, from - this.maxDuration);
    const out: Occurrence[] = [];
    for (; i < this.items.length; i++) {
      const o = this.items[i]!;
      if (o.start >= to) break;
      if (o.end > from) out.push(o);
    }
    for (const s of this.series.values()) {
      const band = msPerPx ? seriesCoverage(s, from, to, msPerPx, this.zone) : null;
      if (band) {
        if (band.end > band.start) out.push({ event: s, start: band.start, end: band.end, coverage: band.coverage });
        continue;
      }
      const skip = this.overrideKeys.get(s.id) ?? EMPTY;
      for (const x of this.cache.get(s, from, to, this.zone, skip)) {
        out.push({ event: s, start: x.start, end: x.end, key: x.key });
      }
    }
    return out;
  }

  upsert(e: CalendarEvent): void {
    this.remove(e.id);
    this.place(e, true);
  }

  remove(id: string): void {
    if (this.series.delete(id)) return;
    const o = this.byId.get(id);
    if (!o) return;
    this.byId.delete(id);
    const parent = o.event.recurrenceParentId;
    if (parent && o.event.recurrenceId) this.overrideKeys.get(parent)?.delete(o.event.recurrenceId);
    const i = this.items.indexOf(o);
    if (i >= 0) this.items.splice(i, 1);
    if (o.end - o.start >= this.maxDuration) this.recomputeMax();
  }

  private place(e: CalendarEvent, keepSorted = false): void {
    if (e.recurrence) {
      this.series.set(e.id, e);
      return;
    }
    const b = eventBounds(e, this.zone);
    if (!b) return;
    const o: Occurrence = { event: e, start: b.start, end: b.end, key: e.recurrenceId };
    if (e.recurrenceParentId && e.recurrenceId) {
      let keys = this.overrideKeys.get(e.recurrenceParentId);
      if (!keys) this.overrideKeys.set(e.recurrenceParentId, (keys = new Set()));
      keys.add(e.recurrenceId);
    }
    if (keepSorted) this.items.splice(lowerBound(this.items, o.start), 0, o);
    else this.items.push(o);
    this.byId.set(e.id, o);
    this.maxDuration = Math.max(this.maxDuration, o.end - o.start);
  }

  private recomputeMax(): void {
    this.maxDuration = this.items.reduce((m, o) => Math.max(m, o.end - o.start), 0);
  }
}

const EMPTY: ReadonlySet<string> = new Set();

/** First index whose start ≥ t. */
function lowerBound(items: Occurrence[], t: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (items[mid]!.start < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
