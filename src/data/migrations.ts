import type { Transaction } from "dexie";

export interface Migration {
  version: number;
  /** Dexie store definitions for this version. Omitted tables are kept as they were. */
  stores: Record<string, string | null>;
  /** Optional data transform run when upgrading an existing database to this version. */
  upgrade?: (tx: Transaction) => Promise<void>;
}

/**
 * Every schema version, oldest first. Never edit a version once it has shipped;
 * add a new entry and bump CURRENT_SCHEMA_VERSION instead.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    stores: {
      events: "id, start, startDate, *categoryIds, recurrenceParentId, externalUid, importBatchId",
      categories: "id, order",
      milestones: "id, targetDate",
      settings: "id",
      meta: "id",
    },
  },
];

export const CURRENT_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;
