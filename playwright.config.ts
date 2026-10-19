import { defineConfig, devices } from "@playwright/test";

// Smoke tests against the production build, served under /continuum/ like GitHub Pages (D17).
const PORT = 4174;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}/continuum/`,
    timezoneId: "America/Los_Angeles",
    locale: "en-US",
    viewport: { width: 1280, height: 800 },
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/continuum/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
