import { expect, test, type Page } from "@playwright/test";
import {
  API,
  accessToken,
  completeBaseline,
  completeWeekly,
  dimensionCard,
  session,
  sql,
  userId,
} from "./helpers";

/**
 * The closed loop, end to end against a real Supabase stack (real auth, real RLS via PostgREST,
 * real storage): ASSESS -> COMMIT -> TRACK -> ACT (blocker, evidence) -> VERIFY -> REVIEW.
 */
test.describe.configure({ mode: "serial" });

const TITLE = "Own delivery of the monthly close";
let commitmentId = "";

const inTenDays = () => new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

async function setStatus(page: Page, label: string) {
  await page.getByLabel("Status").selectOption({ label });
}

test("ASSESS: employee submits baseline and weekly scorecard with validation", async ({
  browser,
}) => {
  const page = await session(browser, "e1");
  const weak = (i: number) => (i === 0 ? 1 : i === 2 ? 2 : 4);

  // Submitting an incomplete baseline is refused in the UI
  await page.goto("/baseline");
  await page.getByRole("button", { name: "Submit baseline" }).click();
  await expect(page.getByRole("alert")).toContainText("Rate all 12 dimensions");

  await completeBaseline(page, weak);
  await page.reload();
  await expect(page.getByText("Your baseline is the fixed starting point")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit baseline" })).toHaveCount(0);

  // Weekly: empty submission highlights the first problem instead of saving
  await page.goto("/weekly");
  await page.getByRole("button", { name: "Submit weekly position" }).click();
  await expect(page.getByText("Some answers are missing or invalid")).toBeVisible();

  // Metric rules mirror the database (percentage cannot exceed 100)
  await dimensionCard(page, "Innovation & Improvement").getByLabel("Efficiency gain %").fill("150");
  await page.getByRole("button", { name: "Submit weekly position" }).click();
  await expect(page.getByText("Cannot exceed 100%.")).toBeVisible();

  await completeWeekly(page, weak);
  await page.reload();
  await expect(page.getByText("You already submitted this week")).toBeVisible();
  await expect(
    dimensionCard(page, "Accountability & Ownership").getByLabel("Proactive actions"),
  ).toHaveValue("2");

  // A committed draft survives navigation (work in progress is not lost)
  await page.context().close();
});

test("COMMIT: a weakness becomes a measurable commitment linked to its score", async ({
  browser,
}) => {
  const page = await session(browser, "e1");
  await page.goto("/commitments");
  await expect(page.getByText("Suggested from your latest assessment")).toBeVisible();
  await page.getByRole("button", { name: /Accountability & Ownership/ }).click();
  await expect(page.getByText(/Your latest score here is/)).toBeVisible();

  await page.getByRole("button", { name: "Create commitment" }).click();
  await expect(page.getByText("Give the commitment a short title.")).toBeVisible();

  await page.getByLabel("Title").fill(TITLE);
  await page
    .getByLabel("Specific action")
    .fill("Prepare the close checklist every Monday and own sign-off");
  await page.getByLabel("Due date").fill(inTenDays());
  await page.getByLabel("What will you measure? (optional)").fill("proactive actions per week");
  await page.getByLabel("Baseline value").fill("2");
  await page.getByLabel("Target value").fill("8");
  await page.getByRole("button", { name: "Create commitment" }).click();

  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
  commitmentId = page.url().split("/").pop()!;
  await expect(page.getByText(/Score\s*1\.0\s*in the assessment/)).toBeVisible();
  const row = sql(
    `select source_score, status, verification_status, baseline_value, target_value from commitments where id = '${commitmentId}'`,
  );
  expect(row).toBe("1|not_started|unverified|2|8");
  await page.context().close();
});

test("TRACK: progress is derived from measured values; blockers require a reason", async ({
  browser,
}) => {
  const page = await session(browser, "e1");
  await page.goto(`/commitments/${commitmentId}`);

  await setStatus(page, "In progress");
  await page.getByLabel(/Current value/).fill("5");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Overall progress" })).toHaveAttribute(
    "aria-valuenow",
    "50",
  );

  // Blocked needs a blocker description
  await setStatus(page, "Blocked");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await page.getByLabel("What is blocking you?").fill("Waiting for finance sign-off");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByText("Blocked:", { exact: false }).first()).toBeVisible();
  await page.context().close();
});

test("ESCALATE: the manager is notified and sees the blocker on the cockpit", async ({
  browser,
}) => {
  const mgr = await session(browser, "mgr");
  await mgr.goto("/notifications");
  await expect(mgr.getByRole("link", { name: `Blocked: ${TITLE}` })).toBeVisible();
  await mgr.goto("/cockpit");
  await expect(mgr.getByRole("heading", { name: "Team cockpit" })).toBeVisible();
  await expect(mgr.getByRole("heading", { name: /Blocked — needs your help/ })).toBeVisible();
  await expect(mgr.getByRole("link", { name: TITLE })).toBeVisible();
  await mgr.context().close();
});

test("ACT: owner completes, provides evidence (note, link, real file upload)", async ({
  browser,
}) => {
  const page = await session(browser, "e1");
  await page.goto(`/commitments/${commitmentId}`);
  await setStatus(page, "In progress");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await setStatus(page, "Complete");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByText("Awaiting verification").first()).toBeVisible();

  const add = async (kind: string) =>
    page
      .locator("label", { hasText: new RegExp(`^${kind}$`) })
      .first()
      .click();

  await add("Note");
  await page.getByLabel("Title", { exact: true }).fill("Close checklist");
  await page
    .getByRole("textbox", { name: "Note", exact: true })
    .fill("Checklist used in September and October closes; sign-off owned by me.");
  await page.getByRole("button", { name: "Add evidence" }).click();
  await expect(page.getByText("Close checklist")).toBeVisible();

  await add("Link");
  await page.getByLabel("Title", { exact: true }).fill("Dashboard");
  await page.getByLabel("Web address").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Add evidence" }).click();
  await expect(page.getByText("Enter a full web address")).toBeVisible();
  await page.getByLabel("Web address").fill("https://example.com/close-dashboard");
  await page.getByRole("button", { name: "Add evidence" }).click();
  await expect(page.getByRole("link", { name: /example.com\/close-dashboard/ })).toBeVisible();

  await add("File");
  await page.getByLabel("Title", { exact: true }).fill("Close report");
  await page.locator("input[type=file]").setInputFiles({
    name: "malware.exe",
    mimeType: "application/x-msdownload",
    buffer: Buffer.from("MZ"),
  });
  await expect(page.getByText("This file type is not allowed")).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "close-report.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 close report"),
  });
  await page.getByRole("button", { name: "Add evidence" }).click();
  await expect(page.getByRole("button", { name: /close-report\.pdf/ })).toBeVisible();

  // it is a real, private storage object under the owner's folder
  const objects = sql(`select name from storage.objects where bucket_id = 'evidence'`);
  expect(objects).toMatch(
    new RegExp(`^${userId("e1")}/${commitmentId}/[0-9a-f-]+-close-report\\.pdf$`),
  );
  expect(sql(`select public from storage.buckets where id = 'evidence'`)).toBe("f");
  await page.context().close();
});

test("VERIFY: a manager cannot verify without accepted evidence; then verifies and locks it", async ({
  browser,
}) => {
  const mgr = await session(browser, "mgr");
  await mgr.goto("/notifications");
  await expect(mgr.getByRole("link", { name: `Verification needed: ${TITLE}` })).toBeVisible();
  await mgr.getByRole("link", { name: `Verification needed: ${TITLE}` }).click();

  const verify = mgr.getByRole("button", { name: "Verify commitment" });
  await expect(verify).toBeDisabled();
  await expect(mgr.getByText("Accept at least one piece of evidence")).toBeVisible();

  // The manager can open the private file through a short-lived signed link
  const [popup] = await Promise.all([
    mgr.waitForEvent("popup"),
    mgr.getByRole("button", { name: /close-report\.pdf/ }).click(),
  ]);
  await popup.waitForLoadState();
  expect(popup.url()).toContain("/storage/v1/object/sign/evidence/");
  await popup.close();

  // Rejecting evidence needs a reason
  const link = mgr.locator("li", { hasText: "Dashboard" });
  await link.getByRole("button", { name: "Reject…" }).click();
  await expect(link.getByRole("button", { name: "Reject evidence" })).toBeDisabled();
  await link
    .getByLabel("Reason for rejecting this evidence")
    .fill("Dashboard needs login I cannot use");
  await link.getByRole("button", { name: "Reject evidence" }).click();
  await expect(link.getByText("Rejected")).toBeVisible();

  await mgr
    .locator("li", { hasText: "Close checklist" })
    .getByRole("button", { name: "Accept" })
    .click();
  await expect(verify).toBeEnabled();
  await mgr.getByLabel("Note for the owner").fill("Confirmed against the close log");
  await verify.click();
  await expect(mgr.getByText(/Verified by Maya Manager/)).toBeVisible();
  await mgr.context().close();

  // The owner now sees a locked, verified commitment
  const e1 = await session(browser, "e1");
  await e1.goto(`/commitments/${commitmentId}`);
  await expect(e1.getByText(/Verified by Maya Manager/)).toBeVisible();
  await expect(e1.getByRole("heading", { name: "Update progress" })).toHaveCount(0);
  await expect(e1.getByRole("button", { name: "Add evidence" })).toHaveCount(0);
  await e1.context().close();
});

test("REJECT: a manager can reopen work that does not meet the bar", async ({ browser }) => {
  const e1 = await session(browser, "e1");
  await e1.goto("/commitments");
  await e1.getByRole("button", { name: "New commitment" }).click();
  await e1
    .getByLabel("Dimension to improve")
    .selectOption({ label: "Results Orientation & Delivery" });
  await e1.getByLabel("Title").fill("Hit every deadline in November");
  await e1.getByLabel("Specific action").fill("Plan weekly and flag risks early");
  await e1.getByLabel("Due date").fill(inTenDays());
  await e1.getByRole("button", { name: "Create commitment" }).click();
  await expect(e1.getByRole("heading", { name: "Hit every deadline in November" })).toBeVisible();
  const id = e1.url().split("/").pop()!;
  await setStatus(e1, "Complete");
  await e1.getByRole("button", { name: "Save changes" }).click();
  await expect(e1.getByText("Saved.")).toBeVisible();
  await e1.context().close();

  const mgr = await session(browser, "mgr");
  await mgr.goto(`/commitments/${id}`);
  await expect(mgr.getByRole("button", { name: "Verify commitment" })).toBeDisabled();
  await expect(mgr.getByRole("button", { name: "Reject and reopen" })).toBeDisabled();
  await mgr.getByLabel("Note for the owner").fill("No evidence has been provided");
  await mgr.getByRole("button", { name: "Reject and reopen" }).click();
  await expect(mgr.getByText(/Reopened by Maya Manager/)).toBeVisible();
  await mgr.context().close();

  const e1b = await session(browser, "e1");
  await e1b.goto(`/commitments/${id}`);
  await expect(e1b.getByText(/Reopened by Maya Manager/)).toBeVisible();
  await expect(e1b.getByLabel("Status")).toHaveValue("in_progress");
  await e1b.context().close();
});

test("REVIEW: manager records a review that the employee can read, and peers cannot", async ({
  browser,
}) => {
  const mgr = await session(browser, "mgr");
  await mgr.goto("/team");
  await expect(mgr.getByRole("link", { name: "Eli Employee" })).toBeVisible();
  await mgr.getByRole("link", { name: "Eli Employee" }).click();
  await expect(mgr.getByRole("heading", { name: "Latest scorecard with evidence" })).toBeVisible();
  await expect(mgr.getByText("Evidence for Accountability & Ownership")).toBeVisible();
  await mgr.getByRole("link", { name: "Start a review" }).click();
  await mgr
    .getByLabel("What changed since the last review?")
    .fill("Ownership improved; deadline habit still forming.");
  await mgr
    .getByLabel("Action items")
    .fill("Share close checklist with the team\nAgree deadline dashboard");
  await mgr.getByRole("button", { name: "Record review" }).click();
  await expect(mgr.getByText("Review recorded for Eli Employee")).toBeVisible();
  await mgr.context().close();

  const e1 = await session(browser, "e1");
  await e1.goto("/review");
  await expect(e1.getByText("Ownership improved; deadline habit still forming.")).toBeVisible();
  await expect(e1.getByRole("tab", { name: "New review" })).toHaveCount(0);
  await e1.context().close();

  const e2 = await session(browser, "e2");
  await e2.goto("/review");
  await expect(e2.getByText("No reviews yet")).toBeVisible();
  await e2.context().close();
});

test("AUTHORISATION: the UI and the API both refuse what a role may not do", async ({
  browser,
}) => {
  const e2 = await session(browser, "e2");
  const token = await accessToken(e2);
  const anon = (await import("../scripts/e2e-keys.mjs")).sign("anon");
  const headers = {
    apikey: anon,
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  const e1Id = userId("e1");

  // UI: restricted routes render a refusal, unknown records look like they do not exist
  await e2.goto("/cockpit");
  await expect(
    e2.getByRole("heading", { name: "You do not have access to this page" }),
  ).toBeVisible();
  await e2.goto("/people");
  await expect(
    e2.getByRole("heading", { name: "You do not have access to this page" }),
  ).toBeVisible();
  await e2.goto(`/commitments/${commitmentId}`);
  await expect(e2.getByRole("heading", { name: "Commitment not found" })).toBeVisible();

  // API: the same boundaries hold for direct calls with the peer's own valid token
  const read = await e2.request.get(`${API}/rest/v1/commitments?select=id&user_id=eq.${e1Id}`, {
    headers,
  });
  expect(await read.json()).toEqual([]);
  const assessments = await e2.request.get(
    `${API}/rest/v1/assessments?select=id&user_id=eq.${e1Id}`,
    { headers },
  );
  expect(await assessments.json()).toEqual([]);
  const patch = await e2.request.patch(`${API}/rest/v1/commitments?id=eq.${commitmentId}`, {
    headers: { ...headers, prefer: "return=representation" },
    data: { title: "hacked" },
  });
  expect(await patch.json()).toEqual([]);
  const audit = await e2.request.post(`${API}/rest/v1/audit_log`, {
    headers,
    data: { table_name: "commitments", op: "UPDATE" },
  });
  expect(audit.status()).toBe(403);
  const role = await e2.request.patch(
    `${API}/rest/v1/organization_members?user_id=eq.${userId("e2")}`,
    { headers, data: { role: "admin" } },
  );
  expect(role.status()).toBe(403);
  const verify = await e2.request.post(`${API}/rest/v1/rpc/verify_commitment`, {
    headers,
    data: { p_id: commitmentId, p_decision: "verified", p_note: "" },
  });
  expect(verify.ok()).toBe(false);
  const forged = await e2.request.post(`${API}/rest/v1/rpc/submit_baseline`, {
    headers,
    data: { p_scores: [{ dimensionId: "x", score: 99, evidence: "" }] },
  });
  expect(forged.ok()).toBe(false);
  const internal = await e2.request.post(`${API}/rest/v1/rpc/generate_notifications`, {
    headers,
    data: {},
  });
  expect(internal.status()).toBe(404);
  const anonRead = await e2.request.get(`${API}/rest/v1/commitments?select=id`, {
    headers: { apikey: anon },
  });
  expect(anonRead.status()).toBe(401);
  await e2.context().close();
});

test("OVERSIGHT: executives see the whole organisation, with the audit trail behind it", async ({
  browser,
}) => {
  // Give the outcome analysis something to measure: a later weekly scorecard where the dimension improved
  sql(`insert into public.assessments (user_id, organization_id, assessment_type, period_start, period_end, scores)
       select a.user_id, a.organization_id, 'weekly', a.period_start + 7, a.period_end + 7,
              (select jsonb_agg(jsonb_set(e, '{score}', to_jsonb(case when e->>'dimensionId' = 'accountability-ownership' then 4 else (e->>'score')::int end)))
                 from jsonb_array_elements(a.scores) e)
         from public.assessments a where a.user_id = '${userId("e1")}' and a.assessment_type = 'weekly'`);

  const ceo = await session(browser, "ceo");
  await ceo.goto("/");
  await expect(ceo).toHaveURL(/\/cockpit$/);
  await expect(ceo.getByRole("heading", { name: "Executive cockpit" })).toBeVisible();
  await expect(ceo.getByText("Did completed actions improve performance?")).toBeVisible();
  await expect(
    ceo.getByText(/1 of 1 measured commitments were followed by a higher score/),
  ).toBeVisible();
  await expect(ceo.getByRole("link", { name: TITLE })).toBeVisible();

  await ceo.goto("/audit");
  await expect(ceo.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect(ceo.getByText("verification_status: pending → verified")).toBeVisible();
  await expect(ceo.getByText("by Maya Manager").first()).toBeVisible();
  await ceo.getByLabel("Record type").selectOption("commitments");
  await expect(ceo.getByText("status: in_progress → complete").first()).toBeVisible();

  await ceo.goto("/reports");
  await expect(ceo.getByRole("heading", { name: "Reports" })).toBeVisible();
  const [download] = await Promise.all([
    ceo.waitForEvent("download"),
    ceo.getByRole("button", { name: "Export CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^vision-activ-report-month-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  await ceo.context().close();

  // A manager sees only their line and cannot open the audit log or people admin
  const mgr = await session(browser, "mgr");
  await mgr.goto("/audit");
  await expect(
    mgr.getByRole("heading", { name: "You do not have access to this page" }),
  ).toBeVisible();
  await mgr.context().close();
});
