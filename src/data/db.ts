import Dexie, { type EntityTable } from "dexie";
import { MIGRATIONS } from "./migrations";
import type { CalendarEvent, Category, MetaRow, Milestone, SettingsRow } from "./types";

export const DB_NAME = "continuum";

export class ContinuumDB extends Dexie {
  events!: EntityTable<CalendarEvent, "id">;
  categories!: EntityTable<Category, "id">;
  milestones!: EntityTable<Milestone, "id">;
  settings!: EntityTable<SettingsRow, "id">;
  meta!: EntityTable<MetaRow, "id">;

  constructor(name: string = DB_NAME) {
    super(name);
    for (const m of MIGRATIONS) {
      const v = this.version(m.version).stores(m.stores);
      if (m.upgrade) v.upgrade(m.upgrade);
    }
  }
}

let instance: ContinuumDB | undefined;

/**
 * The app's database (or, with a name, e.g. the separate benchmark database).
 * Tests construct their own ContinuumDB with a unique name instead.
 */
export function getDb(name: string = DB_NAME): ContinuumDB {
  instance ??= new ContinuumDB(name);
  return instance;
}
