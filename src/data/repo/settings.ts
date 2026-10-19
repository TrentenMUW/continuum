import type { ContinuumDB } from "../db";
import { DEFAULT_SETTINGS } from "../defaults";
import type { AppSettings } from "../types";

/** Stored settings over defaults, so fields added in later versions always have a value. */
export async function loadSettings(db: ContinuumDB): Promise<AppSettings> {
  const row = await db.settings.get("app");
  if (!row) return { ...DEFAULT_SETTINGS };
  const { id: _id, ...stored } = row;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(db: ContinuumDB, patch: Partial<AppSettings>): Promise<AppSettings> {
  return db.transaction("rw", db.settings, async () => {
    const next = { ...(await loadSettings(db)), ...patch };
    await db.settings.put({ id: "app", ...next });
    return next;
  });
}
