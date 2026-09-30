import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { API, sql } from "../helpers";

/**
 * The populated demonstration environment, exercised as the people in it. Requires DEMO_PASSWORD
 * (the shared password that was given to seed_demo.sql).
 */
const PASSWORD = process.env.DEMO_PASSWORD ?? "";
const DOMAIN = "@demo.visionactiv.example";
const email = (local: string) => `${local}${DOMAIN}`;
const uid = (local: string) => sql(`select id from auth.users where email = '${email(local)}'`);
const SHOTS = "e2e-screens";

test.skip(!PASSWORD, "DEMO_PASSWORD is not set");

async function signIn(browser: Browser, local: string, width = 1360, height = 900): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email(local));
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  return page;
}

async function accessToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith("-auth-token"));
    return JSON.parse(localStorage.getItem(key!)!).access_token as string;
  });
}

async function rest(page: Page, path: string) {
  const anon = (await import("../../scripts/e2e-keys.mjs")).sign("anon");
  const res = await page.request.get(`${API}/rest/v1/${path}`, {
    headers: { apikey: anon, authorization: `Bearer ${await accessToken(page)}` },
  });
  return { status: res.status(), body: (await res.json()) as unknown[] };
}

async function noErrors(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("alert").filter({ hasText: /went wrong|could not|error/i }),
    label,
  ).toHaveCount(0);
}

async function offenders(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const inScroller = (el: Element | null) => {
      for (let p = el; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
      }
      return false;
    };
    const out: string[] = [];
    if (document.documentElement.scrollWidth > vw + 1)
      out.push(`page ${document.documentElement.scrollWidth}>${vw}`);
    for (const el of document.querySelectorAll("main *, header *")) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > vw + 1 && !inScroller(el.parentElement)) {
        out.push(`${el.tagName}.${String(el.className).slice(0, 40)} r=${Math.round(r.right)}`);
        if (out.length > 4) break;
      }
    }
    return out;
  });
}

test.describe.configure({ mode: "serial" });

test("CEO Bob sees a living organisation", async ({ browser }) => {
  const page = await signIn(browser, "bob.williams");
  await expect(page.getByRole("heading", { name: "Executive cockpit" })).toBeVisible();
  await noErrors(page, "cockpit");

  // organisation level information derived from real rows
  await expect(page.getByText("Performance score")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weakest dimensions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Improving" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deteriorating" })).toBeVisible();
  await expect(page.getByText("Kagiso Mahlangu").first()).toBeVisible();
  await expect(page.getByText("Plan the quarter", { exact: false })).toHaveCount(0);
  const heat = page.getByRole("region", { name: "Dimension scores by week" });
  await expect(heat.getByRole("row")).toHaveCount(13);
  await page.screenshot({ path: `${SHOTS}/demo-bob-cockpit.png`, fullPage: true });

  // People: the whole company, with differing situations
  await page.goto("/people");
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  for (const name of [
    "Thandi Mokoena",
    "Daniel Naidoo",
    "Naledi Khumalo",
    "Sipho Dlamini",
    "Kagiso Mahlangu",
    "Lerato Sithole",
  ])
    await expect(page.getByRole("row").filter({ hasText: name }).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/demo-bob-people.png`, fullPage: true });

  // Team: attention signals
  await page.goto("/team");
  await noErrors(page, "team");
  await expect(page.getByText(/overdue/i).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/demo-bob-team.png`, fullPage: true });

  // Person detail for the person who needs attention
  await page.goto(`/team/${uid("kagiso.mahlangu")}`);
  await noErrors(page, "person detail");
  await expect(page.getByRole("heading", { name: "Kagiso Mahlangu" })).toBeVisible();
  await expect(page.getByText("Reduce missed delivery deadlines").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/demo-bob-person-kagiso.png`, fullPage: true });

  // A commitment with a blocker, evidence and a timeline
  const blocked = sql(
    `select id from commitments where title = 'Document recurring operational issues and corrective actions'`,
  );
  await page.goto(`/commitments/${blocked}`);
  await noErrors(page, "commitment detail");
  await expect(page.getByText(/incident log/).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/demo-bob-commitment.png`, fullPage: true });

  // a verified one shows who verified it and that it is locked
  const verified = sql(
    `select id from commitments where title = 'Introduce a weekly operational exception review'`,
  );
  await page.goto(`/commitments/${verified}`);
  await expect(page.getByText(/locked/i).first()).toBeVisible();
  await expect(page.getByText(/Verified by Thandi Mokoena/)).toBeVisible();

  for (const [path, name] of [
    ["/team/commitments", "team-commitments"],
    ["/reports", "reports"],
    ["/trends", "trends"],
    ["/review", "reviews"],
    ["/notifications", "notifications"],
    ["/audit", "audit"],
    ["/track", "track"],
  ] as const) {
    await page.goto(path);
    await noErrors(page, path);
    await page.screenshot({ path: `${SHOTS}/demo-bob-${name}.png`, fullPage: true });
  }
  await page.goto("/review");
  await expect(page.getByText("Scheduled").first()).toBeVisible();
  await page.goto("/notifications");
  await expect(page.getByText(/Overdue|Verification needed|Blocked/).first()).toBeVisible();
  await page.context().close();
});

test("Manager Thandi sees exactly her own team", async ({ browser }) => {
  const page = await signIn(browser, "thandi.mokoena");
  await page.goto("/team");
  await noErrors(page, "team");
  for (const name of ["Sipho Dlamini", "Ayesha Patel", "Kagiso Mahlangu", "Lerato Sithole"])
    await expect(page.getByText(name).first()).toBeVisible();
  for (const name of ["Michelle van der Merwe", "Themba Zulu", "Nomvula Dube", "Pieter Jacobs"])
    await expect(page.getByText(name)).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/demo-thandi-team.png`, fullPage: true });

  // The database, not the page, enforces it
  expect(
    (await rest(page, `assessments?user_id=eq.${uid("michelle.vandermerwe")}&select=id`)).body,
  ).toEqual([]);
  expect((await rest(page, `commitments?user_id=eq.${uid("themba.zulu")}&select=id`)).body).toEqual(
    [],
  );
  expect(
    (await rest(page, `evidence_items?user_id=eq.${uid("nomvula.dube")}&select=id`)).body,
  ).toEqual([]);
  expect(
    (await rest(page, `management_reviews?subject_user_id=eq.${uid("pieter.jacobs")}&select=id`))
      .body,
  ).toEqual([]);
  const own = await rest(page, `assessments?user_id=eq.${uid("kagiso.mahlangu")}&select=id`);
  expect(own.body.length).toBeGreaterThan(5);
  const colleague = await page.goto(`/team/${uid("michelle.vandermerwe")}`);
  expect(colleague?.ok()).toBeTruthy();
  await expect(page.getByText("Michelle van der Merwe")).toHaveCount(0);
  await page.goto("/team/commitments");
  await noErrors(page, "team commitments");
  await page.screenshot({ path: `${SHOTS}/demo-thandi-team-commitments.png`, fullPage: true });
  await page.goto("/people");
  await expect(
    page.getByRole("heading", { name: "You do not have access to this page" }),
  ).toBeVisible();
  await page.context().close();
});

test("Employee Sipho sees his own story and nobody else's", async ({ browser }) => {
  const page = await signIn(browser, "sipho.dlamini");
  await expect(page.getByRole("heading", { name: "My dashboard" })).toBeVisible();
  await noErrors(page, "dashboard");
  await expect(page.getByRole("navigation", { name: "Operating loop" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/demo-sipho-dashboard.png`, fullPage: true });
  for (const path of [
    "/commitments",
    "/track",
    "/trends",
    "/review",
    "/notifications",
    "/weekly",
  ]) {
    await page.goto(path);
    await noErrors(page, path);
  }
  await page.goto("/cockpit");
  await expect(
    page.getByRole("heading", { name: "You do not have access to this page" }),
  ).toBeVisible();

  for (const table of [
    "assessments",
    "commitments",
    "evidence_items",
    "scorecard_entries",
    "commitment_updates",
  ])
    expect(
      (await rest(page, `${table}?user_id=eq.${uid("kagiso.mahlangu")}&select=id`)).body,
      table,
    ).toEqual([]);
  expect(
    (await rest(page, `management_reviews?subject_user_id=eq.${uid("kagiso.mahlangu")}&select=id`))
      .body,
  ).toEqual([]);
  expect(
    (await rest(page, `notifications?user_id=eq.${uid("kagiso.mahlangu")}&select=id`)).body,
  ).toEqual([]);
  expect(
    (await rest(page, "audit_log?select=id&subject_user_id=neq." + uid("sipho.dlamini"))).body,
  ).toEqual([]);
  const others = (await rest(page, "organization_members?select=user_id")).body as {
    user_id: string;
  }[];
  expect(others.length).toBeLessThanOrEqual(2); // himself and his manager
  await page.context().close();
});

const SCREENS: Record<string, string[]> = {
  "bob.williams": [
    "/cockpit",
    "/people",
    "/team",
    "/team/commitments",
    "/reports",
    "/trends",
    "/review",
    "/notifications",
    "/audit",
    "/track",
    "/commitments",
  ],
  "thandi.mokoena": ["/", "/team", "/team/commitments", "/reports", "/review", "/cockpit"],
  "kagiso.mahlangu": [
    "/",
    "/commitments",
    "/track",
    "/trends",
    "/weekly",
    "/review",
    "/notifications",
  ],
};

for (const [who, routes] of Object.entries(SCREENS)) {
  test(`accessibility on populated screens: ${who}`, async ({ browser }) => {
    const page = await signIn(browser, who);
    for (const path of routes) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const summary = results.violations.map(
        (v) =>
          `${v.id}: ${v.nodes
            .slice(0, 2)
            .map((n) => n.target.join(" "))
            .join(" | ")}`,
      );
      expect(summary, `${who} ${path}`).toEqual([]);
    }
    await page.context().close();
  });

  test(`responsive audit with real data: ${who}`, async ({ browser }) => {
    const page = await signIn(browser, who);
    const failures: string[] = [];
    for (const width of [320, 360, 375, 390, 414, 768, 1024, 1280, 1680]) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of routes) {
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

test("mobile captures of the executive story", async ({ browser }) => {
  const page = await signIn(browser, "bob.williams", 390, 844);
  for (const [path, name] of [
    ["/cockpit", "cockpit"],
    ["/people", "people"],
    ["/team", "team"],
    ["/review", "reviews"],
    ["/notifications", "notifications"],
  ] as const) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${SHOTS}/demo-mobile-bob-${name}.png`, fullPage: true });
  }
  await page.context().close();
});
