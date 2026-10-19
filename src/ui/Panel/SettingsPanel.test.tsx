// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContinuumDB } from "../../data/db";
import { getAppState, initApp, resetAppStoreForTests } from "../../state/appStore";
import { App } from "../App";

let db: ContinuumDB;
let n = 0;
beforeEach(async () => {
  resetAppStoreForTests();
  db = new ContinuumDB(`settings-ui-${n++}`);
  await initApp(db);
});
afterEach(async () => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  await db.delete();
});

const ready = () => {
  const s = getAppState();
  if (s.status !== "ready") throw new Error("not ready");
  return s;
};

describe("settings (§5.10, §5.11, D16, D18)", () => {
  it("is dark by default and switches to light, persisting the choice", async () => {
    render(<App />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const p = await screen.findByRole("complementary", { name: "Settings" });
    fireEvent.click(within(p).getByLabelText("Light"));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    expect((await db.settings.get("app"))!.theme).toBe("light");
  });

  it("sets a display time zone, and rejects unknown names", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const p = await screen.findByRole("complementary", { name: "Settings" });
    fireEvent.click(within(p).getByLabelText(/Use this device's time zone/));
    const input = await within(p).findByLabelText("Display time zone");
    fireEvent.change(input, { target: { value: "Mars/Olympus_Mons" } });
    fireEvent.click(within(p).getByRole("button", { name: "Apply" }));
    expect(within(p).getByText(/isn't a time zone name/)).toBeTruthy();
    fireEvent.change(input, { target: { value: "Asia/Tokyo" } });
    fireEvent.click(within(p).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(ready().zone).toBe("Asia/Tokyo"));
  });

  it("explains local storage, offers a backup, and links to the source code", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const p = await screen.findByRole("complementary", { name: "Settings" });
    expect(within(p).getByText(/export a backup regularly/)).toBeTruthy();
    expect(within(p).getByText(/Persistent storage:/)).toBeTruthy();
    expect(within(p).getByRole("button", { name: "Export a backup" })).toBeTruthy();
    const link = within(p).getByRole("link", { name: /github.com\/TrentenMUW\/continuum/ }) as HTMLAnchorElement;
    expect(link.href).toBe("https://github.com/TrentenMUW/continuum");
    expect(link.rel).toContain("noopener");
  });
});
