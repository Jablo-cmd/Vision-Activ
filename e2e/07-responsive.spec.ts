import { expect, test, type Page } from "@playwright/test";
import { session, sql, userId, type Who } from "./helpers";

/**
 * Responsive audit: every screen, for every role, at phone, tablet and desktop widths.
 * Fails on page-level horizontal scroll and on any element poking past the viewport that is not
 * inside an intentional horizontally scrolling region (tables).
 */
// The widths are set explicitly, so the mobile project would only repeat the same work.
test.beforeEach((_fixtures, info) =>
  test.skip(info.project.name !== "desktop", "sets its own viewports"),
);

const WIDTHS = [320, 360, 375, 390, 414, 768, 1024, 1280, 1680];

async function offenders(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const scrolls = (el: Element | null) => {
      for (let p = el; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden")
          return p !== document.documentElement;
      }
      return false;
    };
    const out: string[] = [];
    if (document.documentElement.scrollWidth > vw + 1)
      out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
    for (const el of document.querySelectorAll("main *, header *, nav *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1 && !scrolls(el.parentElement)) {
        out.push(
          `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} right=${Math.round(r.right)} "${(el.textContent ?? "").trim().slice(0, 30)}"`,
        );
        if (out.length > 5) break;
      }
    }
    return out;
  });
}

const ROUTES: Record<string, (() => string)[]> = {
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
      `/commitments/${sql(`select id from commitments where user_id = '${userId("e1")}' and status = 'in_progress' limit 1`)}`,
    () => "/no-such-page",
  ],
  mgr: [
    () => "/cockpit",
    () => "/team",
    () => `/team/${userId("e1")}`,
    () => "/team/commitments",
    () => "/reports",
  ],
  admin: [() => "/cockpit", () => "/people", () => "/audit"],
};

for (const [who, routes] of Object.entries(ROUTES)) {
  test(`${who}: no overflow or clipping at 320–1680px`, async ({ browser }) => {
    test.setTimeout(240_000);
    const page = await session(browser, who as Exclude<Who, "outsider">);
    const failures: string[] = [];
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      for (const route of routes) {
        const path = route();
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const bad = await offenders(page);
        if (bad.length) failures.push(`${width}px ${path}: ${bad.join(" | ")}`);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
    await page.context().close();
  });
}

test("public screens fit at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ["/login", "/forgot-password", "/reset-password"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await offenders(page), path).toEqual([]);
  }
});
