import { afterEach, describe, expect, it } from "vitest";
import { ContinuumDB } from "../db";
import { DEFAULT_SETTINGS } from "../defaults";
import { loadSettings, saveSettings } from "./settings";

let n = 0;
const open: ContinuumDB[] = [];
function freshDb(): ContinuumDB {
  const db = new ContinuumDB(`settings-test-${n++}`);
  open.push(db);
  return db;
}

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete();
});

describe("settings repository", () => {
  it("returns defaults when nothing is stored", async () => {
    expect(await loadSettings(freshDb())).toEqual(DEFAULT_SETTINGS);
  });

  it("fills fields missing from an older stored row with defaults", async () => {
    const db = freshDb();
    const { pastEventOpacity: _dropped, ...partial } = DEFAULT_SETTINGS;
    await db.settings.put({ id: "app", ...partial, snapEnabled: true } as never);

    const s = await loadSettings(db);
    expect(s.snapEnabled).toBe(true);
    expect(s.pastEventOpacity).toBe(DEFAULT_SETTINGS.pastEventOpacity);
    expect(s).not.toHaveProperty("id");
  });

  it("saves a patch and persists it", async () => {
    const db = freshDb();
    await saveSettings(db, { snapThreshold: 0.2 });
    expect((await loadSettings(db)).snapThreshold).toBe(0.2);
    expect((await loadSettings(db)).theme).toBe("dark");
  });
});
