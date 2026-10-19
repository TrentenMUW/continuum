// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContinuumDB } from "../../data/db";
import { createEvent } from "../../data/repo/events";
import { getAppState, initApp, openPanel, resetAppStoreForTests, updateSettings } from "../../state/appStore";
import { App } from "../App";

let db: ContinuumDB;
let n = 0;

beforeEach(async () => {
  resetAppStoreForTests();
  db = new ContinuumDB(`editor-test-${n++}`);
  await initApp(db);
  // Pin the display zone so the test doesn't depend on the machine's zone.
  await updateSettings({ timeZone: "America/Los_Angeles" });
});

afterEach(async () => {
  cleanup();
  await db.delete();
});

function readyState() {
  const s = getAppState();
  if (s.status !== "ready") throw new Error("not ready");
  return s;
}

const panel = () => screen.getByRole("complementary");

describe("display zone setting", () => {
  it("re-resolves the zone and all-day events when it changes", async () => {
    const cat = readyState().categories[0]!.id;
    await createEvent(db, {
      title: "Day off",
      allDay: true,
      startDate: "2026-11-01",
      endDate: "2026-11-02",
      timeZone: "UTC",
      categoryIds: [cat],
      source: "manual",
    });
    resetAppStoreForTests();
    await initApp(db);
    await updateSettings({ timeZone: "Asia/Tokyo" });
    expect(readyState().zone).toBe("Asia/Tokyo");
    const [occ] = readyState().index.query(Date.parse("2026-10-30T00:00:00Z"), Date.parse("2026-11-05T00:00:00Z"));
    expect(new Date(occ!.start).toISOString()).toBe("2026-10-31T15:00:00.000Z"); // Tokyo midnight
  });
});

describe("event editor (§5.6)", () => {
  it("shows inline errors and writes nothing for an invalid event", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Add Event" }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Create event" }));

    expect(await within(panel()).findByText("Enter a title.")).toBeTruthy();
    expect(within(panel()).getByText("Choose at least one category.")).toBeTruthy();
    expect(await db.events.count()).toBe(0);
  });

  it("rejects an end before the start", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Add Event" }));
    const p = panel();
    fireEvent.change(within(p).getByLabelText("Title"), { target: { value: "Backwards" } });
    fireEvent.change(within(p).getByLabelText("Start"), { target: { value: "2026-10-24T11:00" } });
    fireEvent.change(within(p).getByLabelText("End"), { target: { value: "2026-10-24T09:00" } });
    fireEvent.click(within(p).getByLabelText(/Health & Exercise/));
    fireEvent.click(within(p).getByRole("button", { name: "Create event" }));

    expect(await within(p).findByText("The end must be after the start.")).toBeTruthy();
    expect(await db.events.count()).toBe(0);
  });

  it("creates a multi-category event as one record and closes the panel", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Add Event" }));
    const p = panel();
    fireEvent.change(within(p).getByLabelText("Title"), { target: { value: "Hike" } });
    fireEvent.change(within(p).getByLabelText("Start"), { target: { value: "2026-10-24T09:00" } });
    fireEvent.change(within(p).getByLabelText("End"), { target: { value: "2026-10-24T11:00" } });
    for (const name of [/Health & Exercise/, /Hobbies & Recreation/, /Social & Relationships/]) {
      fireEvent.click(within(p).getByLabelText(name));
    }
    fireEvent.click(within(p).getByRole("button", { name: "Create event" }));

    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
    const [saved] = await db.events.toArray();
    expect(saved).toMatchObject({ title: "Hike", start: "2026-10-24T16:00:00.000Z", end: "2026-10-24T18:00:00.000Z", source: "manual" });
    expect(saved!.categoryIds).toHaveLength(3);
    expect(readyState().index.size).toBe(1);
  });

  it("editing one appearance edits the shared record; unchecking a category removes only that lane", async () => {
    const cats = readyState().categories;
    const ids = [cats[3]!.id, cats[4]!.id, cats[5]!.id];
    const e = await createEvent(db, {
      title: "Hike",
      allDay: false,
      start: "2026-10-24T16:00:00.000Z",
      end: "2026-10-24T18:00:00.000Z",
      timeZone: "America/Los_Angeles",
      categoryIds: ids,
      source: "manual",
    });
    resetAppStoreForTests();
    await initApp(db);
    await updateSettings({ timeZone: "America/Los_Angeles" });
    render(<App />);
    openPanel({ kind: "event", eventId: e.id });

    const p = await screen.findByRole("complementary", { name: "Edit event" });
    expect((within(p).getByLabelText("Start") as HTMLInputElement).value).toBe("2026-10-24T09:00");
    fireEvent.change(within(p).getByLabelText("Title"), { target: { value: "Long hike" } });
    fireEvent.click(within(p).getByLabelText(/Social & Relationships/));
    fireEvent.click(within(p).getByRole("button", { name: "Save" }));

    await waitFor(async () => expect((await db.events.get(e.id))!.title).toBe("Long hike"));
    expect((await db.events.get(e.id))!.categoryIds).toEqual([ids[0], ids[1]]);
    expect(await db.events.count()).toBe(1);
  });

  it("stores an all-day event with an exclusive end and asks before deleting", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Add Event" }));
    let p = panel();
    fireEvent.change(within(p).getByLabelText("Title"), { target: { value: "Conference" } });
    fireEvent.click(within(p).getByLabelText("All day"));
    fireEvent.change(within(p).getByLabelText("Start"), { target: { value: "2026-11-03" } });
    fireEvent.change(within(p).getByLabelText("End (inclusive)"), { target: { value: "2026-11-04" } });
    fireEvent.click(within(p).getByLabelText(/Work & Career/));
    fireEvent.click(within(p).getByRole("button", { name: "Create event" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());

    const [saved] = await db.events.toArray();
    expect(saved).toMatchObject({ allDay: true, startDate: "2026-11-03", endDate: "2026-11-05" });
    expect(saved).not.toHaveProperty("start");

    openPanel({ kind: "event", eventId: saved!.id });
    p = await screen.findByRole("complementary", { name: "Edit event" });
    expect((within(p).getByLabelText("End (inclusive)") as HTMLInputElement).value).toBe("2026-11-04");
    fireEvent.click(within(p).getByRole("button", { name: "Delete" }));
    expect(await db.events.count()).toBe(1); // nothing yet: it asks first
    fireEvent.click(within(p).getByRole("button", { name: "Delete event" }));
    await waitFor(async () => expect(await db.events.count()).toBe(0));
    expect(readyState().index.size).toBe(0);
  });
});

describe("recurring events (§5.6, D13)", () => {
  it("creates a weekly series, edits one occurrence, then deletes another", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Add Event" }));
    let p = panel();
    fireEvent.change(within(p).getByLabelText("Title"), { target: { value: "Class" } });
    fireEvent.change(within(p).getByLabelText("Start"), { target: { value: "2026-10-19T09:00" } });
    fireEvent.change(within(p).getByLabelText("End"), { target: { value: "2026-10-19T10:00" } });
    fireEvent.change(within(p).getByLabelText("Repeat"), { target: { value: "WEEKLY" } });
    // Monday is preselected from the start date.
    expect((within(p).getByLabelText("Mon") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(p).getByLabelText(/Education/));
    fireEvent.click(within(p).getByRole("button", { name: "Create event" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());

    const [series] = await db.events.toArray();
    expect(series!.recurrence).toEqual({ rrule: "FREQ=WEEKLY;BYDAY=MO", exdates: [] });

    // Open the Nov 2 occurrence: the form shows that occurrence's own time.
    const KEY = "2026-11-02T17:00:00.000Z";
    openPanel({ kind: "event", eventId: series!.id, occurrenceKey: KEY });
    p = await screen.findByRole("complementary", { name: "Edit repeating event" });
    expect((within(p).getByLabelText("Start") as HTMLInputElement).value).toBe("2026-11-02T09:00");
    expect((within(p).getByLabelText(/^All day/) as HTMLInputElement).disabled).toBe(true);

    fireEvent.change(within(p).getByLabelText("Start"), { target: { value: "2026-11-02T11:00" } });
    fireEvent.change(within(p).getByLabelText("End"), { target: { value: "2026-11-02T12:00" } });
    fireEvent.click(within(p).getByRole("button", { name: "Save" }));
    const chooser = within(p).getByRole("group", { name: "Save to which occurrences" });
    expect(within(chooser).getAllByRole("radio")).toHaveLength(3);
    fireEvent.click(within(chooser).getByLabelText("This occurrence"));
    fireEvent.click(within(chooser).getByRole("button", { name: "Save" }));
    await waitFor(async () => expect(await db.events.count()).toBe(2));
    const override = (await db.events.where("recurrenceParentId").equals(series!.id).first())!;
    expect(override).toMatchObject({ recurrenceId: KEY, start: "2026-11-02T19:00:00.000Z" });

    // Delete the Nov 9 occurrence only.
    const KEY9 = "2026-11-09T17:00:00.000Z";
    openPanel({ kind: "event", eventId: series!.id, occurrenceKey: KEY9 });
    p = await screen.findByRole("complementary", { name: "Edit repeating event" });
    fireEvent.click(within(p).getByRole("button", { name: "Delete" }));
    const del = within(p).getByRole("group", { name: "Delete which occurrences" });
    fireEvent.click(within(del).getByLabelText("This occurrence"));
    fireEvent.click(within(del).getByRole("button", { name: "Delete" }));
    await waitFor(async () => expect((await db.events.get(series!.id))!.recurrence!.exdates).toEqual([KEY9]));
  });

  it("hides 'This occurrence' once the repeat rule is changed", async () => {
    const cat = readyState().categories[2]!.id;
    const s = await createEvent(db, {
      title: "Class",
      allDay: false,
      start: "2026-10-19T16:00:00.000Z",
      end: "2026-10-19T17:00:00.000Z",
      timeZone: "America/Los_Angeles",
      categoryIds: [cat],
      recurrence: { rrule: "FREQ=WEEKLY;BYDAY=MO", exdates: [] },
      source: "manual",
    });
    resetAppStoreForTests();
    await initApp(db);
    await updateSettings({ timeZone: "America/Los_Angeles" });
    render(<App />);
    openPanel({ kind: "event", eventId: s.id, occurrenceKey: "2026-11-02T17:00:00.000Z" });
    const p = await screen.findByRole("complementary", { name: "Edit repeating event" });
    fireEvent.click(within(p).getByLabelText("Wed"));
    fireEvent.click(within(p).getByRole("button", { name: "Save" }));
    const chooser = within(p).getByRole("group", { name: "Save to which occurrences" });
    expect(within(chooser).queryByLabelText("This occurrence")).toBeNull();
    expect(within(chooser).getByLabelText("This and following")).toBeTruthy();
  });
});

describe("category manager (§5.4)", () => {
  it("adds, renames, hides, and deletes with reassignment", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Categories" }));
    const p = await screen.findByRole("complementary", { name: "Categories" });

    fireEvent.change(within(p).getByLabelText("New category"), { target: { value: "Music" } });
    fireEvent.click(within(p).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(readyState().categories.map((c) => c.name)).toContain("Music"));

    const name = within(p).getByLabelText("Name for Music");
    fireEvent.change(name, { target: { value: "Music & Art" } });
    fireEvent.blur(name);
    await waitFor(() => expect(readyState().categories.at(-1)!.name).toBe("Music & Art"));

    fireEvent.click(within(p).getAllByRole("button", { name: "Hide" })[0]!);
    await waitFor(() => expect(readyState().categories[0]!.visible).toBe(false));

    // Delete "Work & Career" while an event uses it: it must move the event first.
    const work = readyState().categories[1]!;
    const misc = readyState().categories.find((c) => c.name === "Miscellaneous")!;
    const e = await createEvent(db, {
      title: "Shift",
      allDay: false,
      start: "2026-10-24T16:00:00.000Z",
      end: "2026-10-24T18:00:00.000Z",
      timeZone: "America/Los_Angeles",
      categoryIds: [work.id],
      source: "manual",
    });
    // The manager counts usage from the store, so reload it the way the app would.
    resetAppStoreForTests();
    await initApp(db);
    cleanup();
    render(<App />);
    openPanel({ kind: "categories" });
    const p2 = await screen.findByRole("complementary", { name: "Categories" });
    const rows = within(p2).getAllByRole("listitem");
    const workRow = rows.find((r) => within(r).queryByDisplayValue("Work & Career"))!;
    fireEvent.click(within(workRow).getByRole("button", { name: "Delete" }));
    expect(within(workRow).getByText(/has 1 event/)).toBeTruthy();
    fireEvent.change(within(workRow).getByRole("combobox"), { target: { value: misc.id } });
    fireEvent.click(within(workRow).getByRole("button", { name: "Move and delete" }));

    await waitFor(() => expect(readyState().categories.some((c) => c.id === work.id)).toBe(false));
    expect((await db.events.get(e.id))!.categoryIds).toEqual([misc.id]);
  });
});
