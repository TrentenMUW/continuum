// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportBackup } from "../../data/backup";
import { ContinuumDB } from "../../data/db";
import { getAppState, initApp, openPanel, resetAppStoreForTests, updateSettings } from "../../state/appStore";
import { App } from "../App";

// jsdom gives import.meta.url a non-file URL, so resolve from the project root instead.
const fixture = (name: string) => readFileSync(join(process.cwd(), "tests", "fixtures", name), "utf8");
let db: ContinuumDB;
let n = 0;

beforeEach(async () => {
  resetAppStoreForTests();
  db = new ContinuumDB(`import-ui-${n++}`);
  await initApp(db);
  await updateSettings({ timeZone: "America/Los_Angeles" });
});
afterEach(async () => {
  cleanup();
  await db.delete();
});

async function choose(name: string, text: string) {
  render(<App />);
  openPanel({ kind: "import" });
  const p = await screen.findByRole("complementary", { name: "Import or restore" });
  fireEvent.change(within(p).getByLabelText("Choose a file"), { target: { files: [new File([text], name)] } });
  return p;
}

describe("import panel", () => {
  it("previews an .ics file, writes nothing until Import, then imports", async () => {
    const p = await choose("google.ics", fixture("google.ics"));
    const preview = await within(p).findByRole("region", { name: "Import preview" });
    expect(within(preview).getByRole("row", { name: "New 5" })).toBeTruthy();
    expect(within(preview).getByText(/From .* 2026 to .* 2026/)).toBeTruthy();
    expect(await db.events.count()).toBe(0);

    fireEvent.click(within(preview).getByRole("button", { name: "Import" }));
    expect(await within(p).findByRole("status")).toBeTruthy();
    expect(await db.events.count()).toBe(5);
    const s = getAppState();
    if (s.status === "ready") expect(s.events.size).toBe(5);
  });

  it("re-importing the same .ics shows everything unchanged", async () => {
    let p = await choose("google.ics", fixture("google.ics"));
    fireEvent.click(within(await within(p).findByRole("region", { name: "Import preview" })).getByRole("button", { name: "Import" }));
    await within(p).findByRole("status");
    fireEvent.click(within(p).getByRole("button", { name: "Import another file" }));
    fireEvent.change(within(p).getByLabelText("Choose a file"), { target: { files: [new File([fixture("google.ics")], "google.ics")] } });
    p = await screen.findByRole("complementary", { name: "Import or restore" });
    const preview = await within(p).findByRole("region", { name: "Import preview" });
    expect(within(preview).getByRole("row", { name: "Unchanged 6" })).toBeTruthy();
    expect((within(preview).getByRole("button", { name: "Import" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lists bad CSV rows by number and offers no Import", async () => {
    const p = await choose("bad-row.csv", fixture("bad-row.csv"));
    const errors = await within(p).findByRole("list", { name: "Row errors" });
    expect(within(errors).getAllByRole("listitem").map((li) => li.textContent?.slice(0, 6))).toEqual(["Row 3:", "Row 4:", "Row 5:", "Row 6:", "Row 7:"]);
    expect(within(p).queryByRole("button", { name: "Import" })).toBeNull();
    expect(await db.events.count()).toBe(0);
  });

  it("reports a malformed .ics file without changing anything", async () => {
    const p = await choose("malformed.ics", fixture("malformed.ics"));
    expect((await within(p).findByRole("alert")).textContent).toMatch(/valid \.ics/);
  });

  it("summarizes a backup with correct plurals", async () => {
    const p = await choose("b.json", JSON.stringify(await exportBackup(db)));
    const region = await within(p).findByRole("region", { name: "Restore preview" });
    expect(within(region).getByText(/0 events, 8 categories, 1 milestone\./)).toBeTruthy();
  });

  it("restores a backup only after explicit confirmation", async () => {
    const backup = JSON.stringify({ ...(await exportBackup(db)), milestones: [] });
    const p = await choose("continuum-backup-2026-10-19.json", backup);
    const region = await within(p).findByRole("region", { name: "Restore preview" });
    expect(within(region).getByText(/0 events, 8 categories, 0 milestones/)).toBeTruthy();
    const restore = within(region).getByRole("button", { name: "Restore backup" }) as HTMLButtonElement;
    expect(restore.disabled).toBe(true);
    fireEvent.click(within(region).getByLabelText(/Replace all my data/));
    fireEvent.click(restore);
    await waitFor(async () => expect(await db.milestones.count()).toBe(0));
  });
});
