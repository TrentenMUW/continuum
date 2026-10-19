// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContinuumDB } from "../../data/db";
import { getAppState, initApp, openPanel, resetAppStoreForTests, updateSettings } from "../../state/appStore";
import { App } from "../App";

let db: ContinuumDB;
let n = 0;

beforeEach(async () => {
  resetAppStoreForTests();
  db = new ContinuumDB(`milestone-ui-${n++}`);
  await initApp(db);
  await updateSettings({ timeZone: "America/Los_Angeles" });
});

afterEach(async () => {
  cleanup();
  await db.delete();
});

const ready = () => {
  const s = getAppState();
  if (s.status !== "ready") throw new Error("not ready");
  return s;
};

describe("milestone editor (§5.7)", () => {
  it("adds a milestone from the toolbar", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Add Milestone" }));
    const p = await screen.findByRole("complementary", { name: "New milestone" });
    fireEvent.click(within(p).getByRole("button", { name: "Add milestone" }));
    expect(await within(p).findByText("Enter a title.")).toBeTruthy();

    fireEvent.change(within(p).getByLabelText("Title"), { target: { value: "Graduation" } });
    fireEvent.change(within(p).getByLabelText("Date"), { target: { value: "2028-06-10" } });
    fireEvent.click(within(p).getByRole("button", { name: "Add milestone" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());

    const g = ready().milestones.find((m) => m.title === "Graduation")!;
    expect(g).toMatchObject({ targetDate: "2028-06-10", completionMode: "manual", completed: false });
  });

  it("a past-dated achievement stays incomplete until it's marked complete", async () => {
    render(<App />);
    openPanel({ kind: "milestone", milestoneId: null });
    let p = await screen.findByRole("complementary", { name: "New milestone" });
    fireEvent.change(within(p).getByLabelText("Title"), { target: { value: "First marathon" } });
    fireEvent.change(within(p).getByLabelText("Date"), { target: { value: "2020-04-01" } });
    fireEvent.click(within(p).getByRole("button", { name: "Add milestone" }));
    await waitFor(() => expect(ready().milestones.some((m) => m.title === "First marathon")).toBe(true));
    const id = ready().milestones.find((m) => m.title === "First marathon")!.id;
    expect((await db.milestones.get(id))!.completed).toBe(false);

    openPanel({ kind: "milestone", milestoneId: id });
    p = await screen.findByRole("complementary", { name: "Edit milestone" });
    fireEvent.click(within(p).getByLabelText(/^Completed/));
    fireEvent.click(within(p).getByRole("button", { name: "Save" }));
    await waitFor(async () => expect((await db.milestones.get(id))!.completed).toBe(true));
    expect((await db.milestones.get(id))!.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("a date-based milestone shows its derived state and stores no completion", async () => {
    render(<App />);
    openPanel({ kind: "milestone", milestoneId: null });
    const p = await screen.findByRole("complementary", { name: "New milestone" });
    fireEvent.change(within(p).getByLabelText("Title"), { target: { value: "21st birthday" } });
    fireEvent.change(within(p).getByLabelText("Date"), { target: { value: "2021-01-01" } });
    fireEvent.click(within(p).getByLabelText(/When its date arrives/));
    expect(within(p).getByText(/Complete: its date has arrived/)).toBeTruthy();
    expect(within(p).queryByLabelText(/^Completed/)).toBeNull();
    fireEvent.change(within(p).getByLabelText("Date"), { target: { value: "2090-01-01" } });
    expect(within(p).getByText(/Not yet/)).toBeTruthy();
  });

  it("deletes the seeded 2065 milestone after confirming", async () => {
    render(<App />);
    const retirement = ready().milestones[0]!;
    openPanel({ kind: "milestone", milestoneId: retirement.id });
    const p = await screen.findByRole("complementary", { name: "Edit milestone" });
    expect((within(p).getByLabelText("Title") as HTMLInputElement).value).toBe("65th Birthday / Retirement");
    fireEvent.click(within(p).getByRole("button", { name: "Delete" }));
    expect(await db.milestones.count()).toBe(1); // asks first
    fireEvent.click(within(p).getByRole("button", { name: "Delete milestone" }));
    await waitFor(async () => expect(await db.milestones.count()).toBe(0));
    expect(ready().milestones).toHaveLength(0);
  });
});
