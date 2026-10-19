// In-memory interval index (D4). IndexedDB is for persistence; window queries run here.

import { startOfCalDate } from "../time/calDate";
import type { CalendarEvent } from "./types";

/** One placement of an event on the timeline. Recurring series add more in Stage 5. */
export interface Occurrence {
  event: CalendarEvent;
  start: number; // epoch ms
  end: number;
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
  /** One-off events sorted by start. */
  private items: Occurrence[] = [];
  private maxDuration = 0;
  private byId = new Map<string, Occurrence>();

  constructor(
    events: readonly CalendarEvent[],
    private readonly zone: string,
  ) {
    for (const e of events) this.place(e);
    this.items.sort((a, b) => a.start - b.start);
    this.recomputeMax();
  }

  get size(): number {
    return this.items.length;
  }

  /** Every occurrence overlapping [from, to). */
  query(from: number, to: number): Occurrence[] {
    // Anything starting before from − maxDuration has already ended.
    let i = lowerBound(this.items, from - this.maxDuration);
    const out: Occurrence[] = [];
    for (; i < this.items.length; i++) {
      const o = this.items[i]!;
      if (o.start >= to) break;
      if (o.end > from) out.push(o);
    }
    return out;
  }

  upsert(e: CalendarEvent): void {
    this.remove(e.id);
    const o = this.occurrenceOf(e);
    if (!o) return;
    this.items.splice(lowerBound(this.items, o.start), 0, o);
    this.byId.set(e.id, o);
    this.maxDuration = Math.max(this.maxDuration, o.end - o.start);
  }

  remove(id: string): void {
    const o = this.byId.get(id);
    if (!o) return;
    this.byId.delete(id);
    const i = this.items.indexOf(o);
    if (i >= 0) this.items.splice(i, 1);
    if (o.end - o.start >= this.maxDuration) this.recomputeMax();
  }

  private place(e: CalendarEvent): void {
    const o = this.occurrenceOf(e);
    if (!o) return;
    this.items.push(o);
    this.byId.set(e.id, o);
  }

  private occurrenceOf(e: CalendarEvent): Occurrence | null {
    // Recurring series and their overrides are expanded separately (Stage 5).
    if (e.recurrence || e.recurrenceParentId) return null;
    const b = eventBounds(e, this.zone);
    return b ? { event: e, start: b.start, end: b.end } : null;
  }

  private recomputeMax(): void {
    this.maxDuration = this.items.reduce((m, o) => Math.max(m, o.end - o.start), 0);
  }
}

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
