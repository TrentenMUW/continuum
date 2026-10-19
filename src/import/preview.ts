// Import preview and commit (§5.8, §5.9, D14). Planning is pure; committing happens in
// ONE Dexie transaction, so an import either fully succeeds or changes nothing.

import type { ContinuumDB } from "../data/db";
import { eventBounds } from "../data/index";
import type { CalendarEvent, Category } from "../data/types";
import { expandSeries } from "../time/recurrence";
import { parseRRule } from "../time/rrule";
import type { CsvParse } from "./csv";
import type { IcsCandidate, IcsParse } from "./ics";

export type Outcome = "new" | "updated" | "unchanged" | "skipped";

export interface PlanItem {
  outcome: Outcome;
  title: string;
  /** Why it's skipped, or what an update does (e.g. a cancellation). */
  reason?: string;
  start?: number;
  end?: number;
  candidate?: IcsCandidate;
  existing?: CalendarEvent;
}

export interface ImportPlan {
  items: PlanItem[];
  counts: Record<Outcome, number>;
  /** First start to last end. `openEnded` when some series repeats forever. */
  range: { start: number; end: number; openEnded: boolean } | null;
  /** A few of the events that will change, earliest first. */
  sample: PlanItem[];
  warnings: string[];
}

const identity = (uid: string, recurrenceId?: string) => `${uid}|${recurrenceId ?? ""}`;

function summarize(items: PlanItem[], warnings: string[]): ImportPlan {
  const counts: Record<Outcome, number> = { new: 0, updated: 0, unchanged: 0, skipped: 0 };
  let start = Infinity;
  let end = -Infinity;
  let openEnded = false;
  for (const it of items) {
    counts[it.outcome]++;
    if (it.outcome !== "skipped" && it.start !== undefined && it.end !== undefined) {
      start = Math.min(start, it.start);
      if (it.end === Infinity) openEnded = true;
      else end = Math.max(end, it.end);
    }
  }
  const sample = items
    .filter((i) => i.outcome === "new" || i.outcome === "updated")
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
    .slice(0, 6);
  return { items, counts, range: Number.isFinite(start) ? { start, end: Math.max(end, start), openEnded } : null, sample, warnings };
}

const CENTURY = 100 * 365.25 * 86_400_000;

/**
 * Where an event's occurrences end: its own end, the last occurrence of a series with
 * COUNT or UNTIL, or Infinity for a series that repeats forever.
 */
function lastEnd(fields: IcsCandidate["fields"], start: number, end: number, displayZone: string): number {
  if (!fields.recurrence) return end;
  const parts = parseRRule(fields.recurrence.rrule);
  if (!parts.has("COUNT") && !parts.has("UNTIL")) return Infinity;
  const occ = expandSeries({ ...fields, id: "preview", categoryIds: [], source: "ics", createdAt: "", updatedAt: "" } as CalendarEvent, start, start + CENTURY, displayZone);
  return occ.length ? occ[occ.length - 1]!.end : end;
}

/** Fields the file controls, normalized for comparison. */
function contentSignature(f: Partial<CalendarEvent>, exdates: readonly string[]): string {
  return JSON.stringify([
    f.title,
    f.description ?? "",
    f.location ?? "",
    f.allDay,
    f.start ?? "",
    f.end ?? "",
    f.startDate ?? "",
    f.endDate ?? "",
    f.timeZone,
    f.recurrence?.rrule ?? "",
    [...exdates].sort(),
  ]);
}

/** Local EXDATEs (deleted occurrences) survive a re-import alongside the file's own. */
function mergedExdates(c: IcsCandidate, existing?: CalendarEvent): string[] {
  return [...new Set([...(c.fields.recurrence?.exdates ?? []), ...(existing?.recurrence?.exdates ?? [])])];
}

/** D14: classify every .ics candidate against what's already stored. */
export function buildIcsPlan(parse: IcsParse, existingEvents: Iterable<CalendarEvent>, displayZone: string): ImportPlan {
  const existing = new Map<string, CalendarEvent>();
  for (const e of existingEvents) if (e.externalUid) existing.set(identity(e.externalUid, e.recurrenceId), e);

  const fileSeries = new Set(parse.candidates.filter((c) => !c.recurrenceId && !c.cancelled && c.fields.recurrence).map((c) => c.uid));
  const hasSeries = (uid: string) => fileSeries.has(uid) || !!existing.get(identity(uid))?.recurrence;

  const items: PlanItem[] = parse.skipped.map((s) => ({ outcome: "skipped", title: s.title, reason: s.reason }));
  for (const c of parse.candidates) {
    const b = eventBounds({ ...c.fields } as CalendarEvent, displayZone);
    const base = { title: c.fields.title, start: b?.start, end: b ? lastEnd(c.fields, b.start, b.end, displayZone) : undefined, candidate: c };
    const match = existing.get(identity(c.uid, c.recurrenceId));

    if (c.cancelled) {
      if (c.recurrenceId) {
        if (!hasSeries(c.uid)) {
          items.push({ ...base, outcome: "skipped", reason: "It cancels one occurrence of a repeating event that isn't here." });
          continue;
        }
        const master = existing.get(identity(c.uid));
        const alreadyGone = !match && (master?.recurrence?.exdates.includes(c.recurrenceId) ?? false);
        items.push({ ...base, outcome: alreadyGone ? "unchanged" : "updated", existing: match, reason: "One occurrence was cancelled." });
      } else if (match) {
        items.push({ ...base, outcome: "updated", existing: match, reason: "It was cancelled, so it will be removed." });
      } else {
        items.push({ ...base, outcome: "skipped", reason: "It's cancelled." });
      }
      continue;
    }

    if (c.recurrenceId && !hasSeries(c.uid)) {
      items.push({ ...base, outcome: "skipped", reason: "It changes one occurrence of a repeating event that isn't in this file or your calendar." });
      continue;
    }

    if (!match) {
      items.push({ ...base, outcome: "new" });
      continue;
    }
    const same =
      contentSignature(c.fields, mergedExdates(c, match)) === contentSignature(match, match.recurrence?.exdates ?? []);
    items.push({ ...base, outcome: same ? "unchanged" : "updated", existing: match });
  }

  const warnings = [...parse.warnings, ...new Set(parse.candidates.flatMap((c) => c.warnings.map((w) => `“${c.fields.title}”: ${w}`)))];
  return summarize(items, warnings);
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Fields an import replaces wholesale (absent in the file means removed). */
const FILE_FIELDS = { description: undefined, location: undefined, start: undefined, end: undefined, startDate: undefined, endDate: undefined, recurrence: undefined };

/**
 * Apply an .ics plan in one transaction. New events go into `categoryId`; updated ones
 * keep the categories they already have. Returns the import batch id.
 */
export async function commitIcsPlan(db: ContinuumDB, plan: ImportPlan, categoryId: string, now: Date = new Date()): Promise<string> {
  const batch = crypto.randomUUID();
  const stamp = now.toISOString();
  await db.transaction("rw", db.events, async () => {
    const seriesId = new Map<string, string>(); // uid → stored series id
    for (const e of await db.events.where("externalUid").notEqual("").toArray()) {
      if (e.externalUid && !e.recurrenceId && !e.recurrenceParentId) seriesId.set(e.externalUid, e.id);
    }

    // 1. Whole events and series first, so exceptions can find their series.
    for (const it of plan.items) {
      const c = it.candidate;
      if (!c || c.recurrenceId || c.cancelled || it.outcome === "skipped") continue;
      if (it.outcome === "new") {
        const id = crypto.randomUUID();
        await db.events.add(
          stripUndefined({ ...c.fields, id, categoryIds: [categoryId], source: "ics", externalUid: c.uid, importBatchId: batch, createdAt: stamp, updatedAt: stamp }),
        );
        seriesId.set(c.uid, id);
      } else if (it.outcome === "updated" && it.existing) {
        const recurrence = c.fields.recurrence ? { rrule: c.fields.recurrence.rrule, exdates: mergedExdates(c, it.existing) } : undefined;
        await db.events.put(stripUndefined({ ...it.existing, ...FILE_FIELDS, ...c.fields, recurrence, importBatchId: batch, updatedAt: stamp }));
      }
    }

    // 2. Exceptions to one occurrence, and cancellations.
    for (const it of plan.items) {
      const c = it.candidate;
      if (!c || it.outcome === "skipped" || it.outcome === "unchanged") continue;

      if (c.cancelled && !c.recurrenceId) {
        if (it.existing) {
          const overrides = await db.events.where("recurrenceParentId").equals(it.existing.id).primaryKeys();
          await db.events.bulkDelete([it.existing.id, ...overrides]);
        }
        continue;
      }
      if (!c.recurrenceId) continue;

      const parentId = seriesId.get(c.uid);
      const parent = parentId ? await db.events.get(parentId) : undefined;
      if (!parent?.recurrence) throw new Error(`The repeating event for “${c.fields.title}” is missing.`);

      if (c.cancelled) {
        const exdates = [...new Set([...parent.recurrence.exdates, c.recurrenceId])];
        await db.events.update(parent.id, { recurrence: { ...parent.recurrence, exdates }, updatedAt: stamp });
        if (it.existing) await db.events.delete(it.existing.id);
        continue;
      }
      const record = stripUndefined({
        ...(it.existing ?? {}),
        ...FILE_FIELDS,
        ...c.fields,
        recurrence: undefined,
        id: it.existing?.id ?? crypto.randomUUID(),
        categoryIds: it.existing?.categoryIds ?? parent.categoryIds,
        recurrenceParentId: parent.id,
        recurrenceId: c.recurrenceId,
        source: "ics" as const,
        externalUid: c.uid,
        importBatchId: batch,
        createdAt: it.existing?.createdAt ?? stamp,
        updatedAt: stamp,
      }) as CalendarEvent;
      await db.events.put(record);
    }
  });
  return batch;
}

/** CSV rows have no stable UID, so every valid row is new (and re-importing duplicates). */
export function buildCsvPlan(parse: CsvParse, displayZone: string): ImportPlan {
  const items: PlanItem[] = parse.rows.map((r) => {
    const b = eventBounds({ ...r.fields } as CalendarEvent, displayZone);
    return { outcome: "new", title: r.fields.title, start: b?.start, end: b?.end };
  });
  return summarize(items, ["CSV rows have no stable ID, so importing the same file again will duplicate its events."]);
}

const NEW_CATEGORY_COLORS = ["#7FB8D8", "#C9A26B", "#A3C76D", "#D98C8C", "#8C8CD9", "#6BC9B5"];

/**
 * Import valid CSV rows in one transaction. Unknown category names are created
 * ("create") or mapped to Miscellaneous ("misc"); rows naming no category go to Miscellaneous.
 */
export async function commitCsv(
  db: ContinuumDB,
  parse: CsvParse,
  unknownCategories: "create" | "misc",
  now: Date = new Date(),
): Promise<string> {
  if (parse.errors.length) throw new Error("Fix the rows with errors before importing.");
  const batch = crypto.randomUUID();
  const stamp = now.toISOString();
  await db.transaction("rw", [db.events, db.categories], async () => {
    const categories = await db.categories.orderBy("order").toArray();
    const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
    const misc = byName.get("miscellaneous") ?? categories[categories.length - 1]?.id;
    if (!misc) throw new Error("There are no categories to import into.");

    if (unknownCategories === "create") {
      let order = (categories[categories.length - 1]?.order ?? 0) + 1;
      for (const [i, name] of parse.unknownCategories.entries()) {
        const c: Category = { id: crypto.randomUUID(), name, color: NEW_CATEGORY_COLORS[i % NEW_CATEGORY_COLORS.length]!, order: order++, visible: true };
        await db.categories.add(c);
        byName.set(name.toLowerCase(), c.id);
      }
    }

    for (const r of parse.rows) {
      const ids = [...new Set(r.categoryNames.map((n) => byName.get(n.toLowerCase()) ?? misc))];
      await db.events.add(
        stripUndefined({
          ...r.fields,
          id: crypto.randomUUID(),
          categoryIds: ids.length ? ids : [misc],
          source: "csv",
          importBatchId: batch,
          createdAt: stamp,
          updatedAt: stamp,
        }),
      );
    }
  });
  return batch;
}
