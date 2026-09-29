import { expect, test } from "@playwright/test";
import { session, sql, userId } from "./helpers";

test("phone layout: drawer navigation works and no page scrolls sideways", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
  });
  await context.close();
  const page = await session(browser, "e1");
  await page.setViewportSize({ width: 393, height: 851 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My dashboard" })).toBeVisible();

  // the sidebar is hidden; the menu button opens a drawer that closes on Escape
  await expect(page.getByRole("complementary", { name: "Sidebar" })).toBeHidden();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeHidden();

  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("dialog", { name: "Navigation" })
    .getByRole("link", { name: "Weekly scorecard" })
    .click();
  await expect(page.getByRole("heading", { name: "Weekly scorecard" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeHidden();

  const commitment = sql(
    `select id from commitments where user_id = '${userId("e1")}' and status = 'in_progress' limit 1`,
  );
  for (const path of [
    "/",
    "/baseline",
    "/weekly",
    "/commitments",
    `/commitments/${commitment}`,
    "/track",
    "/trends",
    "/review",
    "/notifications",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${path} overflows the viewport by ${overflow}px`).toBeLessThanOrEqual(1);
  }
  await page.context().close();
});

test("phone layout: management screens fit and tables scroll inside their own region", async ({
  browser,
}) => {
  const page = await session(browser, "mgr");
  await page.setViewportSize({ width: 393, height: 851 });
  for (const path of ["/cockpit", "/team", "/team/commitments", "/reports"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${path} overflows the viewport by ${overflow}px`).toBeLessThanOrEqual(1);
  }
  await page.goto("/team");
  await expect(page.getByRole("region", { name: "Team members" })).toBeVisible();
  await page.context().close();
});
