import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { session, sql, userId, type Who } from "./helpers";

/** Automated WCAG 2.1 A/AA scan of every screen, with realistic data left behind by the workflow suite. */
async function scan(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n   ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join("\n   ")}`,
  );
  expect(summary, `${path}\n${summary.join("\n")}`).toEqual([]);
}

test("public screens have no WCAG A/AA violations", async ({ page }) => {
  for (const path of ["/login", "/forgot-password", "/reset-password"]) await scan(page, path);
});

const PAGES: Record<string, (() => string)[]> = {
  e1: [
    () => "/",
    () => "/baseline",
    () => "/weekly",
    () => "/commitments",
    () => "/track",
    () => "/trends",
    () => "/review",
    () => "/notifications",
    () =>
      `/commitments/${sql(`select id from commitments where user_id = '${userId("e1")}' and verification_status = 'verified' limit 1`)}`,
    () =>
      `/commitments/${sql(`select id from commitments where user_id = '${userId("e1")}' and status = 'in_progress' limit 1`)}`,
  ],
  mgr: [
    () => "/cockpit",
    () => "/team",
    () => `/team/${userId("e1")}`,
    () => "/team/commitments",
    () => "/reports",
    () => "/review?tab=new",
    () =>
      `/commitments/${sql(`select id from commitments where user_id = '${userId("e1")}' and status = 'in_progress' limit 1`)}`,
  ],
  admin: [() => "/cockpit", () => "/people", () => "/audit"],
};

for (const [who, pages] of Object.entries(PAGES)) {
  test(`${who}: every screen is WCAG A/AA clean`, async ({ browser }) => {
    const page = await session(browser, who as Exclude<Who, "outsider">);
    for (const path of pages) await scan(page, path());
    await page.context().close();
  });
}
