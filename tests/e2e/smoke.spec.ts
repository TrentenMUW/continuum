// Playwright smoke tests (Stage 8): the core flows in a real browser, on the production
// build. Every test gets a fresh browser context, so a fresh, empty IndexedDB.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fixture = (name: string) => join(process.cwd(), "tests", "fixtures", name);

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("./");
  await expect(page.getByRole("toolbar", { name: "Continuum controls" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Category lanes" }).getByRole("listitem")).toHaveCount(8);
  return errors;
}

test("loads cleanly: toolbar, eight lanes, live, no console errors", async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByRole("status", { name: "Live: following now" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Time ruler" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("adds an event using only the keyboard, and it survives a reload", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Add Event", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Title")).toBeFocused();
  await page.keyboard.type("Keyboard hike");
  // Tab to the Health & Exercise checkbox and tick it with Space.
  const health = page.getByRole("checkbox", { name: /Health & Exercise/ });
  for (let i = 0; i < 30 && !(await health.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await expect(health).toBeChecked();
  await page.getByRole("button", { name: "Create event" }).focus();
  await page.keyboard.press("Enter");

  const hike = page.getByRole("button", { name: /^Keyboard hike, / });
  await expect(hike).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("button", { name: /^Keyboard hike, / })).toHaveCount(1);
});

test("pans and zooms from the keyboard; Return to Now resumes live", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByRole("status", { name: "Live: following now" })).toBeVisible(); // zoom keeps live
  await page.locator("body").press("ArrowRight");
  await expect(page.getByRole("status", { name: "Live: off" })).toBeVisible();
  await page.locator("body").press("n");
  await expect(page.getByRole("status", { name: "Live: following now" })).toBeVisible();
});

test("imports an .ics file with a preview, then re-imports it as unchanged", async ({ page }) => {
  await open(page);
  const importOnce = async () => {
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await page.getByLabel("Choose a file").setInputFiles(fixture("google.ics"));
    return page.getByRole("region", { name: "Import preview" });
  };
  let preview = await importOnce();
  await expect(preview.getByRole("row", { name: "New 5" })).toBeVisible();
  await preview.getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Imported 5 new" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  preview = await importOnce();
  await expect(preview.getByRole("row", { name: "Unchanged 6" })).toBeVisible();
  await expect(preview.getByRole("button", { name: "Import" })).toBeDisabled();
});

test("refuses a CSV with bad rows, reporting row numbers", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByLabel("Choose a file").setInputFiles(fixture("bad-row.csv"));
  const errors = page.getByRole("list", { name: "Row errors" }).getByRole("listitem");
  await expect(errors).toHaveCount(5);
  await expect(errors.first()).toContainText("Row 3:");
});

test("exports a backup and restores it", async ({ page }) => {
  await open(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^continuum-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const backup = JSON.parse(readFileSync(path, "utf8"));
  expect(backup).toMatchObject({ app: "continuum", schemaVersion: 1 });
  expect(backup.categories).toHaveLength(8);

  // Add an event, then restore: it's gone.
  await page.getByRole("button", { name: "Add Event", exact: true }).click();
  await page.getByLabel("Title").fill("Added after backup");
  await page.getByRole("checkbox", { name: /Miscellaneous/ }).check();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("button", { name: /^Added after backup, / })).toHaveCount(1);

  await page.getByRole("button", { name: "Import", exact: true }).click();
  // Playwright saves downloads without an extension; the panel recognizes a backup by its content.
  await page.getByLabel("Choose a file").setInputFiles(path);
  const restore = page.getByRole("region", { name: "Restore preview" });
  await restore.getByLabel(/Replace all my data/).check();
  await restore.getByRole("button", { name: "Restore backup" }).click();
  await expect(page.getByRole("status").filter({ hasText: "restored" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Added after backup, / })).toHaveCount(0);
});

test("settings: light theme and the About link", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Light").check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("link", { name: /github.com\/TrentenMUW\/continuum/ })).toHaveAttribute("href", "https://github.com/TrentenMUW/continuum");
});
