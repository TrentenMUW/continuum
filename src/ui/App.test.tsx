// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContinuumDB } from "../data/db";
import { getAppState, initApp, resetAppStoreForTests } from "../state/appStore";
import { App } from "./App";

let db: ContinuumDB;
let n = 0;

beforeEach(() => {
  resetAppStoreForTests();
  db = new ContinuumDB(`app-test-${n++}`);
});

afterEach(async () => {
  cleanup();
  await db.delete();
});

describe("App shell", () => {
  it("renders the toolbar with every §5.11 control, disabled until its stage", async () => {
    void initApp(db); // App's own initApp() call then reuses this one
    render(<App />);

    expect(screen.getByRole("toolbar", { name: "Continuum controls" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Continuum" })).toBeTruthy();
    for (const name of ["Add Milestone", "Import", "Export", "Settings"]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled, name).toBe(true);
    }
    for (const name of ["Zoom out", "Zoom in", "Snap"]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled, name).toBe(false);
    }
    expect(screen.getByLabelText("Live: off")).toBeTruthy();

    await waitFor(() => expect(getAppState().status).toBe("ready"));
    expect((screen.getByRole("button", { name: "Add Event" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("toggles Snap and persists it", async () => {
    await initApp(db);
    render(<App />);
    const snap = (await screen.findByRole("button", { name: "Snap" })) as HTMLButtonElement;
    expect(snap.getAttribute("aria-pressed")).toBe("false");
    snap.click();
    await waitFor(() => expect(snap.getAttribute("aria-pressed")).toBe("true"));
    await waitFor(async () => expect((await db.settings.get("app"))!.snapEnabled).toBe(true));
  });

  it("shows a lane label for each visible category", async () => {
    await initApp(db);
    render(<App />);
    const lanes = await screen.findByRole("list", { name: "Category lanes" });
    expect(lanes.querySelectorAll("li")).toHaveLength(8);
    expect(lanes.textContent).toContain("Sleep & Rest");
  });

  it("loads the seed into the store", async () => {
    await initApp(db);
    const s = getAppState();
    if (s.status !== "ready") throw new Error(`status ${s.status}`);
    expect(s.categories).toHaveLength(8);
    expect(s.milestones.map((m) => m.targetDate)).toEqual(["2065-01-01"]);
    expect(s.settings.nowMarkerPosition).toBe(0.25);
  });
});
