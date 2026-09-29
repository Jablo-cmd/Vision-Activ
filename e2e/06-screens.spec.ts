import { test } from "@playwright/test";
import { session, sql, userId, type Who } from "./helpers";

/**
 * Not an assertion suite: captures screenshots of every main screen for design review.
 * Run with E2E_SCREENSHOTS=1; images land in ./e2e-screens.
 */
test.skip(!process.env.E2E_SCREENSHOTS, "set E2E_SCREENSHOTS=1 to capture screenshots");

const dims = `select slug, sort_order from public.framework_dimensions where organization_id is null`;

function history() {
  // 8 weeks of scores for e1, e2 and the manager with different trajectories
  const people: [Who, (w: number, i: number) => number][] = [
    ["e1", (w, i) => Math.min(5, Math.max(1, 2 + Math.floor(w / 3) + (i % 3 === 0 ? 0 : 1)))],
    ["e2", (w, i) => Math.min(5, Math.max(1, 4 - Math.floor(w / 4) - (i % 4 === 0 ? 1 : 0)))],
    ["mgr", (_w, i) => 3 + (i % 3 === 0 ? 1 : 0)],
  ];
  for (const [who, f] of people) {
    for (let w = 1; w <= 8; w++) {
      const scores = sql(
        `select json_agg(json_build_object('dimensionId', slug, 'score', 0, 'evidence', 'Weekly evidence') order by sort_order) from (${dims}) d`,
      );
      const arr = JSON.parse(scores) as { dimensionId: string; score: number; evidence: string }[];
      arr.forEach((s, i) => (s.score = f(8 - w, i)));
      sql(`insert into public.assessments (user_id, organization_id, assessment_type, period_start, period_end, scores)
           select '${userId(who)}', (select id from organizations limit 1), 'weekly', private.current_week_start() - ${w * 7}, private.current_week_start() - ${w * 7} + 6, $j$${JSON.stringify(arr)}$j$::jsonb
           on conflict do nothing`);
    }
  }
  sql(`update public.organization_members set created_at = now() - interval '120 days'`);
  sql(`insert into public.commitments (user_id, organization_id, dimension_id, title, action, due_date, priority, baseline_value, target_value, measure)
       values ('${userId("e2")}', (select id from organizations limit 1), 'communication-stakeholders', 'Escalate risks within 24 hours', 'Use the risk log daily', private.org_today() + 6, 'high', 1, 5, 'risks escalated in time'),
              ('${userId("e2")}', (select id from organizations limit 1), 'planning-prioritisation', 'Plan the quarter in one page', 'Draft and review with manager', private.org_today() + 20, 'normal', null, null, '')`);
  sql(`alter table public.commitments disable trigger commitments_before_write;
       update public.commitments set due_date = private.org_today() - 5 where title = 'Escalate risks within 24 hours';
       alter table public.commitments enable trigger commitments_before_write;
       update public.commitments set status = 'blocked', blocker = 'Waiting for the risk log tool licence' where title = 'Plan the quarter in one page'`);
}

test.beforeAll(() => history());

const SHOTS: [Exclude<Who, "outsider">, string, string][] = [
  ["e1", "/", "employee-dashboard"],
  ["e1", "/weekly", "weekly"],
  ["e1", "/commitments", "commitments"],
  ["e1", "/track", "track"],
  ["e1", "/trends", "trends"],
  ["mgr", "/cockpit", "manager-cockpit"],
  ["mgr", "/team", "team"],
  ["mgr", "/team/commitments", "team-commitments"],
  ["ceo", "/cockpit", "executive-cockpit"],
  ["ceo", "/reports", "reports"],
  ["admin", "/people", "people"],
  ["admin", "/audit", "audit"],
];

for (const [who, path, name] of SHOTS) {
  test(`screenshot ${name}`, async ({ browser }, info) => {
    const page = await session(browser, who);
    if (info.project.name === "mobile") await page.setViewportSize({ width: 393, height: 851 });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `e2e-screens/${info.project.name}-${name}.png`, fullPage: true });
    await page.context().close();
  });
}

test("screenshot login", async ({ page }, info) => {
  await page.goto("/login");
  await page.screenshot({ path: `e2e-screens/${info.project.name}-login.png` });
});
