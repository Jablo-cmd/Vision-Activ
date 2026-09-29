import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    // Playwright specs (e2e/) and database tests (supabase/tests) have their own runners.
    include: ["src/**/*.test.{ts,tsx}", "supabase/functions/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Pure logic is unit-tested here; UI, services and RLS are covered by Playwright and pgTAP.
      include: ["src/lib/**"],
      exclude: ["src/lib/**/*.test.ts"],
      reporter: ["text-summary", "lcov"],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});
