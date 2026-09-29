import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.E2E_CHROMIUM || undefined },
  },
  webServer: {
    command: "./scripts/e2e-serve.sh",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /05-mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 } },
    },
    { name: "mobile", testMatch: /(05-mobile|06-screens)\.spec\.ts/, use: { ...devices["Pixel 7"] } },
  ],
});
