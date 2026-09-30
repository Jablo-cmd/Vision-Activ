import { defineConfig, devices } from "@playwright/test";

/**
 * Verifies a database that has been loaded with supabase/demo/seed_demo.sql. Unlike the main suite it
 * does not reset any data. Run with: DEMO_PASSWORD=... npx playwright test -c playwright.demo.config.ts
 */
export default defineConfig({
  testDir: "./e2e/demo",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    launchOptions: { executablePath: process.env.E2E_CHROMIUM || undefined },
  },
  webServer: {
    command: "./scripts/e2e-serve.sh",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 } },
    },
  ],
});
