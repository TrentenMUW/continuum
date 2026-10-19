// Editing and deleting recurring events with the three D13 scopes:
//   "this"      – an edit creates (or updates) an override record; a delete adds an EXDATE.
//   "following" – the original series ends with an UNTIL and a new series starts here.
//   "all"       – the series itself changes.

import { addCalDays, parseCalDate } from "../../time/calDate";
import { wallAsUtc, wallFromUtc, wallOf, wallToInstant } from "../../time/localTime";
import { expandSeries } from "../../time/recurrence";
import { formatUntilDate, formatUntilInstant, parseRRule, withParts } from "../../time/rrule";
import type { ContinuumDB } from "../db";
import type { CalendarEvent, OccurrenceKey } from "../types";

export type Scope = "this" | "following" | "all";

/** What the editor produces for the occurrence being edited. */
export type OccurrenceFields = Pick<
  CalendarEvent,
  "title" | "allDay" | "start" | "end" | "startDate" | "endDate" | "categoryIds" | "description" | "location" | "recurrence"
>;

const DAY_MS = 86_400_000;

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

async function overridesOf(db: ContinuumDB, seriesId: string): Promise<CalendarEvent[]> {
  return db.events.where("recurrenceParentId").equals(seriesId).toArray();
}

/** Shift an occurrence key by the change made to the clicked occurrence ("all" edits). */
function keyShifter(series: CalendarEvent, oldKey: OccurrenceKey, fields: OccurrenceFields): (k: OccurrenceKey) => OccurrenceKey {
  if (series.allDay) {
    const days = Math.round((dateMs(fields.startDate!) - dateMs(oldKey)) / DAY_MS);
    return (k) => addCalDays(k, days);
  }
  const delta = wallAsUtc(wallOf(Date.parse(fields.start!), series.timeZone)) - wallAsUtc(wallOf(Date.parse(oldKey), series.timeZone));
  return (k) => new Date(wallToInstant(wallFromUtc(wallAsUtc(wallOf(Date.parse(k), series.timeZone)) + delta), series.timeZone)).toISOString();
}

function dateMs(d: string): number {
  const { year, month, day } = parseCalDate(d);
  return Date.UTC(year, month - 1, day);
}

/** Occurrences generated before `key`, counting EXDATEs (COUNT includes them, RFC 5545). */
function countBefore(series: CalendarEvent, key: OccurrenceKey, displayZone: string): number {
  const bare = { ...series, recurrence: { ...series.recurrence!, exdates: [] } };
  const start = series.allDay ? dateMs(series.startDate!) - 2 * DAY_MS : Date.parse(series.start!) - DAY_MS;
  // Generous window; the key comparison makes the exact cut.
  const end = series.allDay ? dateMs(key) + DAY_MS : Date.parse(key) + 1;
  return expandSeries(bare, start, end, displayZone).filter((o) => o.key < key).length;
}

/** UNTIL that ends a series just before the occurrence `key`. */
function untilBefore(series: CalendarEvent, key: OccurrenceKey): string {
  return series.allDay ? formatUntilDate(addCalDays(key, -1)) : formatUntilInstant(Date.parse(key) - 1000);
}

function isFirstOccurrence(series: CalendarEvent, key: OccurrenceKey): boolean {
  return series.allDay ? key <= series.startDate! : Date.parse(key) <= Date.parse(series.start!);
}

/** Save an edit made to occurrence `key` of `series`. `override` is the existing override record, if any. */
export async function saveOccurrence(
  db: ContinuumDB,
  series: CalendarEvent,
  key: OccurrenceKey,
  fields: OccurrenceFields,
  scope: Scope,
  displayZone: string,
  override?: CalendarEvent,
  now: Date = new Date(),
): Promise<void> {
  const stamp = now.toISOString();
  await db.transaction("rw", db.events, async () => {
    if (scope === "this") {
      const { recurrence: _ignored, ...single } = fields;
      const record: CalendarEvent = stripUndefined({
        ...single,
        id: override?.id ?? crypto.randomUUID(),
        timeZone: series.timeZone,
        recurrenceParentId: series.id,
        recurrenceId: key,
        source: series.source,
        externalUid: series.externalUid,
        importBatchId: series.importBatchId,
        createdAt: override?.createdAt ?? stamp,
        updatedAt: stamp,
      });
      await db.events.put(record);
      return;
    }

    if (scope === "following" && !isFirstOccurrence(series, key)) {
      const rule = series.recurrence!.rrule;
      const count = parseRRule(rule).get("COUNT");
      const before = count ? countBefore(series, key, displayZone) : 0;
      await db.events.put(
        stripUndefined({
          ...series,
          recurrence: {
            rrule: withParts(rule, { UNTIL: untilBefore(series, key), COUNT: null }),
            exdates: series.recurrence!.exdates.filter((k) => k < key),
          },
          updatedAt: stamp,
        }),
      );

      // The new series starts at the edited occurrence. An unchanged rule keeps what's left of COUNT.
      const sameRule = fields.recurrence?.rrule === rule;
      const tailRule = fields.recurrence
        ? sameRule && count
          ? withParts(rule, { COUNT: String(Math.max(1, Number(count) - before)) })
          : fields.recurrence.rrule
        : undefined;
      const shift = keyShifter(series, key, fields);
      const tail: CalendarEvent = stripUndefined({
        ...fields,
        id: crypto.randomUUID(),
        timeZone: series.timeZone,
        recurrence: tailRule
          ? { rrule: tailRule, exdates: series.recurrence!.exdates.filter((k) => k >= key).map(shift) }
          : undefined,
        source: series.source,
        createdAt: stamp,
        updatedAt: stamp,
      });
      await db.events.add(tail);
      for (const o of await overridesOf(db, series.id)) {
        if (o.recurrenceId! < key) continue;
        if (tailRule) await db.events.update(o.id, { recurrenceParentId: tail.id, recurrenceId: shift(o.recurrenceId!), updatedAt: stamp });
        else await db.events.delete(o.id);
      }
      return;
    }

    // "all" (or "following" from the first occurrence, which is the same thing).
    const shift = keyShifter(series, key, fields);
    let startFields: Partial<CalendarEvent>;
    if (series.allDay) {
      const lengthDays = Math.round((dateMs(fields.endDate!) - dateMs(fields.startDate!)) / DAY_MS);
      const startDate = shift(series.startDate!);
      startFields = { startDate, endDate: addCalDays(startDate, lengthDays) };
    } else {
      const zone = series.timeZone;
      const newStart = shift(series.start!);
      const wallLength = wallAsUtc(wallOf(Date.parse(fields.end!), zone)) - wallAsUtc(wallOf(Date.parse(fields.start!), zone));
      const endWall = wallFromUtc(wallAsUtc(wallOf(Date.parse(newStart), zone)) + wallLength);
      startFields = { start: newStart, end: new Date(wallToInstant(endWall, zone)).toISOString() };
    }
    const overrides = await overridesOf(db, series.id);
    await db.events.put(
      stripUndefined({
        ...series,
        ...fields,
        ...startFields,
        recurrence: fields.recurrence ? { rrule: fields.recurrence.rrule, exdates: series.recurrence!.exdates.map(shift) } : undefined,
        updatedAt: stamp,
      }),
    );
    for (const o of overrides) {
      if (fields.recurrence) await db.events.update(o.id, { recurrenceId: shift(o.recurrenceId!), updatedAt: stamp });
      else await db.events.delete(o.id); // no longer a series: its exceptions go too
    }
  });
}

/** Delete occurrence `key` of `series` with the given scope. */
export async function deleteOccurrence(
  db: ContinuumDB,
  series: CalendarEvent,
  key: OccurrenceKey,
  scope: Scope,
  now: Date = new Date(),
): Promise<void> {
  const stamp = now.toISOString();
  await db.transaction("rw", db.events, async () => {
    const overrides = await overridesOf(db, series.id);
    if (scope === "all" || (scope === "following" && isFirstOccurrence(series, key))) {
      await db.events.bulkDelete([series.id, ...overrides.map((o) => o.id)]);
      return;
    }
    if (scope === "this") {
      const exdates = [...new Set([...series.recurrence!.exdates, key])];
      await db.events.update(series.id, { recurrence: { ...series.recurrence!, exdates }, updatedAt: stamp });
      await db.events.bulkDelete(overrides.filter((o) => o.recurrenceId === key).map((o) => o.id));
      return;
    }
    // "following": end the series just before this occurrence.
    await db.events.update(series.id, {
      recurrence: {
        rrule: withParts(series.recurrence!.rrule, { UNTIL: untilBefore(series, key), COUNT: null }),
        exdates: series.recurrence!.exdates.filter((k) => k < key),
      },
      updatedAt: stamp,
    });
    await db.events.bulkDelete(overrides.filter((o) => o.recurrenceId! >= key).map((o) => o.id));
  });
}
