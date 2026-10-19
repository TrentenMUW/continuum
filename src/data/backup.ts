// Full JSON backup and restore (§5.10).

import type { ContinuumDB } from "./db";
import { DEFAULT_SETTINGS } from "./defaults";
import { CURRENT_SCHEMA_VERSION } from "./migrations";
import type { AppSettings, CalendarEvent, Category, Milestone } from "./types";

export interface Backup {
  app: "continuum";
  schemaVersion: number;
  exportedAt: string;
  events: CalendarEvent[];
  categories: Category[];
  milestones: Milestone[];
  settings: AppSettings;
}

export async function exportBackup(db: ContinuumDB, now: Date = new Date()): Promise<Backup> {
  return db.transaction("r", [db.events, db.categories, db.milestones, db.settings], async () => {
    const row = await db.settings.get("app");
    const { id: _id, ...settings } = row ?? { id: "app", ...DEFAULT_SETTINGS };
    return {
      app: "continuum",
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      events: await db.events.toArray(),
      categories: await db.categories.orderBy("order").toArray(),
      milestones: await db.milestones.orderBy("targetDate").toArray(),
      settings,
    };
  });
}

/** "continuum-backup-2026-10-19.json", in the user's local date. */
export function backupFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `continuum-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export type BackupCheck =
  | { ok: true; backup: Backup; counts: { events: number; categories: number; milestones: number } }
  | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/** Validate a backup's shape and schema version before anything is replaced. */
export function checkBackup(text: string): BackupCheck {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON." };
  }
  if (!isObj(data) || data.app !== "continuum") return { ok: false, error: "This isn't a Continuum backup." };
  if (typeof data.schemaVersion !== "number" || !Number.isInteger(data.schemaVersion)) {
    return { ok: false, error: "The backup has no schema version." };
  }
  if (data.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return { ok: false, error: `This backup is from a newer version of Continuum (schema ${data.schemaVersion}; this app reads up to ${CURRENT_SCHEMA_VERSION}).` };
  }
  for (const key of ["events", "categories", "milestones"] as const) {
    if (!Array.isArray(data[key])) return { ok: false, error: `The backup is missing its ${key}.` };
  }
  if (!isObj(data.settings)) return { ok: false, error: "The backup is missing its settings." };

  const categories = data.categories as unknown[];
  if (!categories.every((c) => isObj(c) && isStr(c.id) && isStr(c.name) && isStr(c.color) && typeof c.order === "number")) {
    return { ok: false, error: "A category in the backup is incomplete." };
  }
  if (categories.length === 0) return { ok: false, error: "The backup has no categories." };
  const categoryIds = new Set((categories as Category[]).map((c) => c.id));

  const events = data.events as unknown[];
  for (const e of events) {
    if (!isObj(e) || !isStr(e.id) || !isStr(e.title) || !Array.isArray(e.categoryIds) || e.categoryIds.length === 0) {
      return { ok: false, error: "An event in the backup is incomplete." };
    }
    if (!(e.categoryIds as unknown[]).every((id) => isStr(id) && categoryIds.has(id))) {
      return { ok: false, error: `The event “${e.title}” uses a category that isn't in the backup.` };
    }
    const timedOk = e.allDay === false && isStr(e.start) && isStr(e.end);
    const allDayOk = e.allDay === true && isStr(e.startDate) && isStr(e.endDate);
    if (!timedOk && !allDayOk) return { ok: false, error: `The event “${e.title}” has no valid start and end.` };
  }
  const milestones = data.milestones as unknown[];
  if (!milestones.every((m) => isObj(m) && isStr(m.id) && isStr(m.title) && isStr(m.targetDate))) {
    return { ok: false, error: "A milestone in the backup is incomplete." };
  }

  const backup = data as unknown as Backup;
  return { ok: true, backup, counts: { events: events.length, categories: categories.length, milestones: milestones.length } };
}

/** Replace ALL data with the backup, in one transaction (§5.10). */
export async function restoreBackup(db: ContinuumDB, backup: Backup): Promise<void> {
  await db.transaction("rw", [db.events, db.categories, db.milestones, db.settings, db.meta], async () => {
    await Promise.all([db.events.clear(), db.categories.clear(), db.milestones.clear(), db.settings.clear()]);
    await db.categories.bulkAdd(backup.categories);
    await db.events.bulkAdd(backup.events);
    await db.milestones.bulkAdd(backup.milestones);
    await db.settings.put({ id: "app", ...DEFAULT_SETTINGS, ...backup.settings });
    // A restored database counts as seeded: deleted seed data must not come back (D2).
    await db.meta.put({ id: "meta", schemaVersion: CURRENT_SCHEMA_VERSION, seeded: true });
  });
}
