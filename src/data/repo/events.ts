import type { ContinuumDB } from "../db";
import type { CalendarEvent } from "../types";

export function listEvents(db: ContinuumDB): Promise<CalendarEvent[]> {
  return db.events.toArray();
}

type NewEvent = Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">;

export async function createEvent(db: ContinuumDB, fields: NewEvent, now: Date = new Date()): Promise<CalendarEvent> {
  if (fields.categoryIds.length === 0) throw new Error("An event needs at least one category.");
  const stamp = now.toISOString();
  const event: CalendarEvent = { ...fields, id: crypto.randomUUID(), createdAt: stamp, updatedAt: stamp };
  await db.events.add(stripUndefined(event));
  return event;
}

export async function updateEvent(
  db: ContinuumDB,
  id: string,
  patch: Partial<Omit<CalendarEvent, "id" | "createdAt">>,
  now: Date = new Date(),
): Promise<CalendarEvent> {
  return db.transaction("rw", db.events, async () => {
    const existing = await db.events.get(id);
    if (!existing) throw new Error(`No event ${id}`);
    const next = stripUndefined({ ...existing, ...patch, id, updatedAt: now.toISOString() });
    if (next.categoryIds.length === 0) throw new Error("An event needs at least one category.");
    await db.events.put(next);
    return next;
  });
}

export function deleteEvent(db: ContinuumDB, id: string): Promise<void> {
  return db.events.delete(id);
}

/** Drop keys whose value is undefined, so switching timed ↔ all-day leaves no stale fields. */
function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
