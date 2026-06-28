import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for end-to-end tests.
 * Boots the Vite dev server and runs specs in tests/e2e.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:8080/__test/mda-analyses",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
