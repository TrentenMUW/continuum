import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContinuumDB } from "../data/db";
import { EventIndex } from "../data/index";
import { listCategories } from "../data/repo/categories";
import { deleteOccurrence } from "../data/repo/recurrence";
import { seedIfNeeded } from "../data/seed";
import { wallOf } from "../time/localTime";
import { parseCsv } from "./csv";
import { parseIcs } from "./ics";
import { buildCsvPlan, buildIcsPlan, commitCsv, commitIcsPlan } from "./preview";

const LA = "America/Los_Angeles";
const fixture = (name: string) => readFileSync(new URL(`../../tests/fixtures/${name}`, import.meta.url), "utf8");

let db: ContinuumDB;
let n = 0;
let misc: string;
beforeEach(async () => {
  db = new ContinuumDB(`import-test-${n++}`);
  await seedIfNeeded(db);
  misc = (await listCategories(db)).find((c) => c.name === "Miscellaneous")!.id;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});

async function importIcs(name: string, text = fixture(name)) {
  const plan = buildIcsPlan(parseIcs(text, LA), await db.events.toArray(), LA);
  await commitIcsPlan(db, plan, misc);
  return plan;
}

/** "M/D HH:mm Title" for everything the timeline would show in a window. */
async function visible(from: string, to: string) {
  const idx = new EventIndex(await db.events.toArray(), LA);
  return idx
    .query(Date.parse(from), Date.parse(to))
    .sort((a, b) => a.start - b.start)
    .map((o) => {
      const w = wallOf(o.start, LA);
      return `${w.month}/${w.day} ${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")} ${o.event.title}`;
    });
}

describe("ICS import (§5.8, D14)", () => {
  it("previews counts and a date range, then imports into the chosen category", async () => {
    const plan = await importIcs("google.ics");
    expect(plan.counts).toEqual({ new: 5, updated: 1, unchanged: 0, skipped: 0 }); // the cancellation updates the new series
    expect(plan.range).not.toBeNull();
    expect(plan.sample.length).toBeGreaterThan(0);

    const all = await db.events.toArray();
    expect(all).toHaveLength(5); // 4 events/series + 1 override
    expect(all.every((e) => e.categoryIds.length === 1 && e.categoryIds[0] === misc && e.source === "ics")).toBe(true);
    expect(new Set(all.map((e) => e.importBatchId)).size).toBe(1);
  });

  it("the date range runs to a finite series' last occurrence and flags endless ones", async () => {
    const google = buildIcsPlan(parseIcs(fixture("google.ics"), LA), [], LA);
    expect(new Date(google.range!.start).toISOString()).toBe("2026-10-22T01:00:00.000Z"); // Oct 21, 18:00
    expect(new Date(google.range!.end).toISOString()).toBe("2026-12-24T04:00:00.000Z"); // 10th Study group ends Dec 23, 20:00
    expect(google.range!.openEnded).toBe(false);
    expect(buildIcsPlan(parseIcs(fixture("outlook.ics"), LA), [], LA).range!.openEnded).toBe(true);
  });

  it("shows the series with its EXDATE, its override, and its cancelled occurrence", async () => {
    await importIcs("google.ics");
    const study = (await visible("2026-10-20T00:00:00Z", "2027-01-15T00:00:00Z")).filter((s) => s.includes("Study group"));
    expect(study).toEqual([
      "10/21 18:00 Study group",
      "10/28 18:00 Study group",
      "11/4 18:00 Study group",
      // 11/11 is an EXDATE
      "11/18 19:00 Study group (moved)",
      // 11/25 was cancelled
      "12/2 18:00 Study group",
      "12/9 18:00 Study group",
      "12/16 18:00 Study group",
      "12/23 18:00 Study group",
    ]);
  });

  it("re-importing the same file reports everything unchanged and duplicates nothing", async () => {
    await importIcs("google.ics");
    const before = await db.events.toArray();
    const again = await importIcs("google.ics");
    expect(again.counts).toEqual({ new: 0, updated: 0, unchanged: 6, skipped: 0 });
    expect(await db.events.count()).toBe(before.length);
  });

  it("updates changed events in place and keeps their categories", async () => {
    await importIcs("google.ics");
    const dentist = (await db.events.where("externalUid").equals("fake-dentist-001@google.com").first())!;
    const health = (await listCategories(db)).find((c) => c.name === "Health & Exercise")!.id;
    await db.events.update(dentist.id, { categoryIds: [health] });

    const edited = fixture("google.ics")
      .replace("SUMMARY:Dentist appointment", "SUMMARY:Dentist (rescheduled)")
      .replace("20261105T100000", "20261105T140000")
      .replace("20261105T110000", "20261105T150000");
    const plan = await importIcs("", edited);
    expect(plan.counts.updated).toBe(1);
    const after = (await db.events.get(dentist.id))!;
    expect(after).toMatchObject({ title: "Dentist (rescheduled)", start: "2026-11-05T22:00:00.000Z", categoryIds: [health] });
    expect(await db.events.count()).toBe(5);
  });

  it("keeps occurrences deleted locally deleted after a re-import", async () => {
    await importIcs("google.ics");
    const series = (await db.events.where("externalUid").equals("fake-study-004@google.com").filter((e) => !!e.recurrence).first())!;
    await deleteOccurrence(db, series, "2026-10-29T01:00:00.000Z", "this"); // Wed Oct 28, 18:00 PDT
    const plan = await importIcs("google.ics");
    expect(plan.counts.unchanged).toBe(6);
    expect((await visible("2026-10-27T00:00:00Z", "2026-10-30T00:00:00Z")).filter((s) => s.includes("Study"))).toEqual([]);
  });

  it("a cancelled whole event removes the stored copy", async () => {
    await importIcs("google.ics");
    const cancelled = fixture("google.ics").replace("SUMMARY:Team sync", "SUMMARY:Team sync\nSTATUS:CANCELLED");
    const plan = await importIcs("", cancelled);
    expect(plan.items.find((i) => i.title === "Team sync")).toMatchObject({ outcome: "updated", reason: /removed/ });
    expect(await db.events.where("externalUid").equals("fake-sync-002@google.com").count()).toBe(0);
  });

  it("skips what can't be imported, with reasons, and imports the rest", async () => {
    const plan = await importIcs("skips.ics");
    expect(plan.counts).toEqual({ new: 1, updated: 0, unchanged: 0, skipped: 5 });
    const reasons = plan.items.filter((i) => i.outcome === "skipped").map((i) => `${i.title}: ${i.reason}`);
    expect(reasons.join("\n")).toMatch(/Exception without its series: .*isn't in this file/);
    expect(reasons.join("\n")).toMatch(/Cancelled and never imported: It's cancelled/);
    expect((await db.events.toArray()).map((e) => e.title)).toEqual(["Missing UID"]);
  });

  it("imports Outlook Windows zones and multi-day all-day events correctly", async () => {
    await importIcs("outlook.ics");
    await importIcs("allday-multiday.ics");
    const v = await visible("2026-10-29T00:00:00Z", "2026-11-14T00:00:00Z");
    expect(v).toContain("11/9 09:00 Weekly 1:1");
    expect(v).toContain("11/12 10:00 Call with the East Coast office"); // 13:00 Eastern
    expect(v).toContain("10/30 00:00 Weekend trip");
    const leap = await visible("2028-01-01T00:00:00Z", "2033-01-01T00:00:00Z");
    expect(leap.filter((s) => s.includes("Leap day"))).toEqual(["2/29 00:00 Leap day party", "2/29 00:00 Leap day party"]);
  });

  it("writes nothing if anything fails part-way", async () => {
    const plan = buildIcsPlan(parseIcs(fixture("google.ics"), LA), [], LA);
    const realAdd = db.events.add.bind(db.events);
    let calls = 0;
    vi.spyOn(db.events, "add").mockImplementation(((...args: Parameters<typeof realAdd>) => {
      if (++calls === 3) throw new Error("disk full (simulated)");
      return realAdd(...args);
    }) as typeof realAdd);
    await expect(commitIcsPlan(db, plan, misc)).rejects.toThrow(/simulated/);
    expect(await db.events.count()).toBe(0);
  });
});

describe("CSV import (§5.9)", () => {
  it("imports every row, creating unknown categories when asked", async () => {
    const cats = await listCategories(db);
    const parse = parseCsv(fixture("sample.csv"), cats, LA);
    const plan = buildCsvPlan(parse, LA);
    expect(plan.counts.new).toBe(5);
    expect(plan.warnings.join(" ")).toMatch(/duplicate/);

    await commitCsv(db, parse, "create");
    expect(await db.events.count()).toBe(5);
    const pottery = (await listCategories(db)).find((c) => c.name === "pottery")!;
    const pots = await db.events.where("categoryIds").equals(pottery.id).toArray();
    expect(pots.map((e) => e.title)).toEqual(["Pottery class"]);
    const dentist = (await db.events.toArray()).find((e) => e.title === "Dentist")!;
    expect(dentist.categoryIds).toHaveLength(2);
    expect(dentist.source).toBe("csv");
  });

  it("maps unknown categories to Miscellaneous when asked", async () => {
    const parse = parseCsv(fixture("sample.csv"), await listCategories(db), LA);
    await commitCsv(db, parse, "misc");
    expect((await listCategories(db)).some((c) => c.name === "pottery")).toBe(false);
    const pottery = (await db.events.toArray()).find((e) => e.title === "Pottery class")!;
    expect(pottery.categoryIds).toEqual([misc]);
  });

  it("refuses to import a file with bad rows and writes nothing", async () => {
    const parse = parseCsv(fixture("bad-row.csv"), await listCategories(db), LA);
    await expect(commitCsv(db, parse, "misc")).rejects.toThrow(/Fix the rows/);
    expect(await db.events.count()).toBe(0);
  });
});
