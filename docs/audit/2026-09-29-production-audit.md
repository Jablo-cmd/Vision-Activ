# Vision Activ — Independent Production Audit

**Date:** 29 September 2026
**Audited revision:** `main` @ `582ba1d` ("feat: surface execution tracking on dashboard")
**Deployed revision (live):** `372a4a8` (last successful GitHub Pages deploy, 27 Sep 2026)
**Supabase project:** `kgvzoolxxpbisqciynkc` (Postgres 17.6, eu-west-1, ACTIVE_HEALTHY)

---

## 0. How this audit was performed, and what could not be verified

| Evidence tag | Meaning in this report |
|---|---|
| **[CODE]** | Established by reading every source file, migration, workflow and config at `582ba1d` (66 files). |
| **[DB]** | Established by querying the live Supabase catalog (policies, grants, constraints, indexes, functions, triggers, row counts) and advisors. |
| **[DB-PROBE]** | Established by impersonating synthetic `employee` / `manager` / `ceo` users (`SET LOCAL ROLE authenticated` + JWT claims) inside a single `DO` block that **always raised at the end, forcing a full rollback**. No production data was created or changed. The 21 probe results are quoted as P1–P21. |
| **[TEST]** | Established by running `tsc -b`, `eslint`, `vitest`, `vite build`, `npm audit` locally, and by numeric reproduction scripts run under `TZ=Africa/Johannesburg`. |
| **[CI]** | Established from GitHub Actions run history and job logs. |
| **[LIVE-LOGS]** | Established from Supabase API/Auth/Postgres logs of real traffic from the deployed frontend (last 24 h). |
| **[INFERRED]** | A reasoned conclusion from the above, not directly observed. |
| **[NOT VERIFIED]** | Could not be checked. |

**Access limitations (be explicit):**
- `visionactiv.aurisnexus.co.za` and `www.visionactiv.com` were **blocked by this environment's network egress policy**. I could not load the live UI, take screenshots, check HTTP security headers, or read the public positioning pages. Live-application conclusions come from **Supabase request logs of real production traffic** plus the source of the deployed commit. The product-positioning comparison (§16) is made against the capability list in the audit brief, not against the website text.
- No Supabase Auth configuration API was available (Site URL, redirect allow-list, email templates, MFA, rate limits) — partially inferred from logs.
- Sentry DSN presence in production: **[NOT VERIFIED]**.

---

## 1. Executive summary (read this first)

Vision Activ today is a **well-intentioned, visually coherent prototype with a sound single-organisation RLS foundation, but it is not production-ready and it does not yet implement the closed loop it describes.**

The five facts that matter most:

1. **The build is broken and the Track & Improve work has never reached production.** `tsc -b` fails at HEAD (`Sidebar.tsx`: unused `Target` import). Every CI run for the last 8 commits failed; the two deploy workflows cancel each other; `deploy.yml` fails because there is no lockfile. Production still runs `372a4a8`. Live logs today show the deployed app requesting commitments *without* `progress_percent`/`due_date`. **[TEST][CI][LIVE-LOGS]**
2. **The production database has no real usage.** 1 user (admin), 0 assessments, 0 commitments, 0 scorecards, 0 reviews, 0 audit events. Nothing in this product has been exercised end-to-end with real data or multiple roles. **[DB]**
3. **Tenant isolation between employees works; accountability integrity does not.** Employees cannot read or edit each other's rows (P6, P7) and cannot self-promote (P11). But an employee *can* forge audit events (P8), write their own "manager notes" (P3), mark their own commitments complete with no verification (P4), submit scores of 99 or −7 (P1), and rewrite or backdate already-submitted assessments (P2). Managers, conversely, *cannot* write notes or verify anything (P15). **[DB-PROBE]**
4. **Several headline numbers are mathematically wrong.** "Latest team score" on the leadership dashboard is one individual's score, not the team's. Trend buckets are mislabelled by a day in South African time; fortnightly buckets are dated **2083**; 6-month buckets are shifted five months back; "Improving (+4.0)" is shown when there is no previous week. **[TEST — reproduced]**
5. **The loop stops at "Track".** Assess → Commit → Track exist as separate screens. *Act*, *Verify*, *Review→Commitment*, and *Improve* (proving a completed action improved a dimension score) do not exist as connected workflow. There is no evidence storage, no verification, no notifications, no executive cockpit, no team hierarchy, and no immutable audit trail.

---

## 2. What actually exists

### 2.1 Inventory **[CODE]**

| Item | State |
|---|---|
| Stack | React 18.3, TypeScript 5.7 (strict), Vite 6, Tailwind v4 (via `@tailwindcss/vite`, no config file), supabase-js 2, Recharts 2, lucide-react, Sentry React 11 |
| Lockfile | **None.** `package-lock.json` absent → non-deterministic installs; breaks `setup-node` `cache: npm` |
| tsconfig | Strict, `noUnusedLocals` (this is what now breaks the build) |
| ESLint | `js.recommended` + `tseslint.recommended` only. `eslint-plugin-react-hooks` and `react-refresh` are installed **but not enabled** → no exhaustive-deps protection |
| Prettier | Configured as a script, evidently never run: most source files are **single-line minified code** (e.g. `App.tsx` is 4 lines / 3.1 KB; `data.ts` is 21 lines / 11 KB) |
| Routing | **None.** Page is `useState<Page>` in `App.tsx`. No URLs, no deep links, refresh → Dashboard, browser Back leaves the app |
| Screens | Login, Dashboard, Assessment (baseline), Scorecard (weekly), Commitments (PICC), Track, Review, Trends, Reports |
| Service layer | `services/data.ts` (all data access), `services/audit.ts` (duplicate audit writer, unused by UI), `services/monitoring.ts` (Sentry) |
| Dead code | `utils/scoring.ts` (unused, and buggy — see §4), `utils/managementReview.ts` (unused, states incompatible with DB enum), `FRAMEWORK_DIMENSIONS`, `services/audit.ts#recordAuditEvent` |
| Tests | 6 files / 13 tests (see §17) |
| E2E | **None** (no Playwright/Cypress) |
| Edge Functions | **None** (repo and project) |
| Storage | **No buckets** |
| Scheduling | **pg_cron not installed**; no scheduled jobs of any kind |
| Workflows | `ci.yml`, `deploy.yml`, `deploy-pages.yml`, `production.yml` — overlapping and conflicting (§18) |
| Hosting | GitHub Pages, custom domain `visionactiv.aurisnexus.co.za`, SPA fallback via `404.html` copy |
| README | Describes a navy/orange palette the code no longer uses; claims "tests and coverage" in CI that fail |

### 2.2 Architecture **[CODE][DB]**

```
Browser (React SPA, GitHub Pages, no router, single 613 KB JS chunk)
   │   useState page switch; role-based nav hiding in Sidebar/App (UI only)
   ▼
Authentication — supabase-js signInWithPassword (email+password only)
   │   AuthContext: session → organization_members(role) lookup
   │   no signup, no password reset, no invite, no MFA, no profile trigger
   ▼
Authorization (app) — string checks ["manager","ceo","admin"].includes(role) in 8 places
   │   gates Review/Reports nav + throws in data.ts; NOT a security boundary
   ▼
Services — services/data.ts: direct PostgREST table calls, no RPCs
   │   every call re-fetches auth.getUser() (network) + membership row
   ▼
Supabase PostgREST (public schema exposed) ──► Supabase Auth (GoTrue)
   ▼
Postgres 17
   ├─ 12 public tables, all RLS-enabled (not FORCE)
   ├─ private.is_org_member(uuid), private.has_org_role(uuid,text[])
   │     SECURITY DEFINER, search_path pinned, EXECUTE revoked from anon
   ├─ trigger commitments_sync_completion (SECURITY INVOKER, mutable search_path)
   ├─ organizations singleton index ((true)) → exactly one org
   └─ framework_dimensions seeded but UNUSED by the app (client uses slug IDs)
   ▼
Storage: none · Edge Functions: none · Cron: none · Email/notifications: none
Observability: Sentry (browser only, if DSN set) · no server-side logging/alerting
```

### 2.3 Live database state **[DB]**

| Table | Rows | Notes |
|---|---|---|
| auth.users / profiles / organization_members | 1 / 1 / 1 | single `admin`, provisioned manually (no auth trigger exists) |
| organizations | 1 | "Vision Activ" singleton |
| framework_dimensions | 12 | global rows (`organization_id` null); **not read by the app** |
| weekly_cycles | 2 | created as a side-effect of page loads |
| assessments, commitments, scorecard_entries, management_reviews, audit_events, privacy_consents, data_retention_policies | **0** | |

### 2.4 Migration / schema drift **[DB][CODE] — Technical debt, high**

The 19 migration versions recorded in production match the repo filenames, **but the contents do not match production**:

| Repo says | Production has |
|---|---|
| `…210736`: `assessments_org_user_period_idx`, `commitments_org_user_status_idx`, `scorecard_org_cycle_user_idx` | `assessments_user_period_idx`, `commitments_user_status_idx`, `scorecard_cycle_user_idx` (different names/columns) |
| `audit_events.user_id … ON DELETE CASCADE` | `ON DELETE SET NULL` |
| — | `public.rls_auto_enable()` function (not in any migration) |

Migrations were edited after being applied and/or production was changed by hand. **A clean `supabase db reset` does not reproduce production**, and the repo version would *cascade-delete audit history* on user deletion. There are also two `privacy_compliance` migrations defining the same tables (the second is only replay-safe because of `if not exists`), and a policy in `…213152` that contradicts the comment in `…220000`.

---

## 3. Product requirements audit — is the loop closed?

| Stage | What exists | Verdict |
|---|---|---|
| **ASSESS** | Baseline screen (12 × 1–5 + text); Weekly Scorecard (12 ratings + metrics + evidence) | Works for self-assessment. No manager/peer rating, no lock after submission, no DB validation |
| **COMMIT** | PICC form: dimension, title, action, timeframe, evidence text, due date, baseline, target, priority | Creates rows. **Not linked to an assessment or to a weak score.** Cannot be edited or deleted after creation |
| **TRACK** | Track screen: progress slider, status, due date, priority, blocker | Built but **not deployed, build-breaking, not in navigation**, and has write-storm/consistency defects (§6) |
| **ACT** | Nothing distinct from TRACK (no action log, no dated updates) | Missing |
| **VERIFY** | Nothing. Employee sets `complete`; managers cannot write to commitments (P15) | **Missing** |
| **REVIEW** | Management Review form (notes, barriers, support, action items text, follow-up date) | Insert-only. No history view, no employee view, no link to commitments, CEO cannot see managers' reviews (P19) |
| **IMPROVE** | Trends chart and "dimension movement" | Not connected to commitments; calculations wrong (§4). No "did the action work?" analysis |

**Conclusion:** the application contains the *vocabulary* of the operating model and individual screens for the first three stages. It does **not** implement a closed loop. The missing links are: `assessment → weakness → commitment` (no FK / no "created from"), `commitment → evidence` (text only), `commitment → verification` (no actor, no state), `review → commitment/action` (free text), and `completed commitment → subsequent score change` (no analysis).

---

## 4. Performance framework & calculation correctness

### 4.1 Framework structure **[CODE][DB]**
- 12 dimensions are hard-coded in `src/types.ts` with slug IDs (`accountability-ownership` …). The seeded `framework_dimensions` table (UUID IDs, weights) is **never read**. Two sources of truth; no FK from `assessments.scores[*].dimensionId` or `commitments.dimension_id`.
- Weights: equal 1/12; `weight` column unused.
- Weekly: one assessment per user per `period_start` (unique index). Weekly scorecard sets `period_start` = Monday of the cycle → one per week, **resubmission overwrites silently** (upsert).
- Baseline: `period_start = today (UTC)`, unique per day → **a user can have unlimited "baselines"**, and there is no concept of *the* baseline used for comparison.

### 4.2 Silent calculation errors — all reproduced **[TEST]**

Reproduction script ran the verbatim production functions under `TZ=Africa/Johannesburg`.

| # | Location | Defect | Reproduced output | Severity |
|---|---|---|---|---|
| C1 | `data.ts#getManagementSnapshot` → Dashboard "Latest team score" | Picks the **single most recent weekly assessment of any one person** and averages that person's scores | Team {A: 5, B: 1, C: 3} → shows **1** (true latest-week mean 3). Result depends on row order | **High – misleading executive KPI** |
| C2 | `Trends.tsx#bucketStart` | Builds local-midnight dates then `toISOString()` → UTC → every label is the previous day in SAST | Week of Mon 2026-09-21 labelled **2026-09-20**; Sept month labelled **2026-08-31** | Medium |
| C3 | same, fortnight branch | `d.setDate(5 + week*14)` adds ~20 000 days to the current month | Fortnight buckets labelled **2083-05-14** | **High – visibly broken** |
| C4 | same, 6-month branch | `d.setMonth(d.getMonth()-5, 1)` assigns each point to its month minus five | Sept data labelled **2026-03-31**; July data **2026-01-31** | High |
| C5 | `Trends.tsx` | Range button sets both look-back and bucket size: "Weekly" = last 7 days → ≤1–2 bars; "Monthly" = 31 days → ≤2 bars | A "trend" of one bar | Medium (design) |
| C6 | `Trends.tsx` movement | Missing previous week treated as 0 | First week shows every dimension "**Improving (+4.0)**" | Medium |
| C7 | `Assessment.tsx` | Baseline `period_start = new Date().toISOString()` (UTC) | Baseline submitted 00:00–02:00 SAST is dated **yesterday** | Low |
| C8 | `Reports.tsx#inRange` | "Weekly" = `period_start ≥ today−7`; weekly rows are Monday-dated | On Mondays "Weekly" includes **two** cycles; Tue–Sun one | Medium |
| C9 | `Reports.tsx` | Pooled mean of all individual scores; people who submit more weigh more; **no submission-compliance metric** so missing people are invisible | — | Medium |
| C10 | `data.ts` | Hard limits with no pagination or warning: 500 team assessments (~40 people × 12 weeks), 1 000 commitments, 50 personal commitments, 12 personal assessments | Silent truncation of 3/6-month reports at modest scale | **High at scale** |
| C11 | `Reports.tsx` | Commitment completion filtered by `updated_at` — editing an old commitment moves it into the current period | — | Low |
| C12 | `utils/scoring.ts#weightedScore` | Numerator sums *all* scores, denominator counts only known dimensions → inflation; ignores weights | Dead code, but its test passes and implies coverage | Low (dead) |
| C13 | All aggregates | DB accepts `score: 99` / `-7` (P1); client filters only `> 0` → one bad row inflates organisational averages | — | **High (integrity)** |

Zero/null handling is otherwise reasonable (unrated `0` is excluded from averages; `null` averages render "—").

---

## 5. PICC / Commitment system

| Capability | State | Evidence |
|---|---|---|
| Create | ✅ | [CODE][DB-PROBE] |
| Description (title/action) | ✅ | |
| Owner | ⚠️ `owner_user_id` accepted from client with **no check** (P3 set owner = manager). Never displayed | [DB-PROBE] |
| Due date | ✅ stored; ⚠️ Commitments list **drops it on reload** (mapping only copies 7 fields) → shows "Due: Not set" | [CODE] `Commitments.tsx` useEffect |
| Baseline / target | ✅ stored at creation; ❌ no current/actual value; ❌ cannot edit; ⚠️ target also dropped on reload in list | [CODE] |
| Progress | ⚠️ subjective 0–100 slider, not derived from baseline→actual→target | [CODE] |
| Priority / status | ✅ | |
| Blockers | ⚠️ free text; no "blocked" status, no escalation, no owner of resolution | [CODE] |
| Manager notes | ❌ **employee can write them** (P3); manager cannot (P15); not displayed anywhere | [DB-PROBE][CODE] |
| Evidence | ❌ single text field at creation; no edit, no files, no timestamps, no review. Track tells users to "Add evidence in the Commitment Charter" — which has no edit capability (dead end) | [CODE] |
| Completion | ⚠️ trigger forces 100 % + `completed_at` on complete; but `not_started@100%` and `in_progress@100%` are both possible (P3, P5) | [DB-PROBE] |
| Verification | ❌ none | |
| Review history | ❌ none (no change log, only an optional client audit event) | |
| Overdue detection | ⚠️ client-side only, on up to 50 rows; no server view; no one is notified | [CODE] |
| Escalation / accountability | ❌ | |
| Edit / delete / archive | ❌ no UI, no DELETE policy (P12 returned 0 rows) | [DB-PROBE] |

**Chain check:** Assessment → *identified weakness* ❌ → commitment (dimension only) ⚠️ → measurable target ⚠️ → action ❌ → evidence ❌ → verification ❌ → improved performance ❌.

---

## 6. Track & Improve (commits `5564375` … `582ba1d`)

| Question | Answer | Evidence |
|---|---|---|
| Deployed? | **No.** Build fails; every deploy since 27 Sep cancelled/failed; live traffic uses old column list | [TEST][CI][LIVE-LOGS] |
| Routed? | `App.tsx` handles `"track"`; **Sidebar has no Track item** — commit `6afef8d` "add Track & Improve navigation" only added an unused `Target` import, which is what broke `tsc`. Reachable only from the Dashboard hero button | [CODE] |
| Typed? | `normalise(raw: any)` (lint error); `supabase!` non-null assertions throughout | [TEST] |
| Persisted? | Migration applied to production (schema ahead of frontend) | [DB][LIVE-LOGS] |
| Secure? | Writes are scoped `eq(user_id, me)` + RLS owner policy → **cannot modify another user's commitment** (P6). Managers therefore cannot use Track on their team at all | [DB-PROBE] |
| Integrated with assessments? | No | [CODE] |

**Defects:**
- **T1 – Write storm / race (High).** The range input calls `save()` on every `onChange` step → up to 20 un-debounced PATCH requests per drag, each re-running `getUser()` + membership lookups; responses can land out of order, and local state is optimistically overwritten.
- **T2 – Status corruption (High).** Any slider movement sends `status: progress===100 ? "complete" : "in_progress"`. Nudging a *completed* commitment reopens it; the trigger then wipes `completed_at`. Reopening via the status select leaves `in_progress@100%` (P5).
- **T3 – Date input saves on every change** (partial typing produces writes).
- **T4 – No audit events** are written from Track (Commitments screen does log status changes → inconsistent trail).
- **T5 – Manager notes / owner not shown**; no manager view of team tracking.
- **T6 – Only 50 most recently updated commitments load**, via `getCurrentUserDashboard()`, which also *inserts* a weekly cycle as a side effect.
- **T7 – "Overdue" and "average progress" are computed client-side** over that truncated list.

---

## 7. Executive management experience

| CEO question | Answerable today? | Gap |
|---|---|---|
| 1 Current organisational performance | ❌ Dashboard "Latest team score" is one person's score (C1). Reports average is closer but pooled and truncated | Correct org-level aggregate per cycle with submission rate |
| 2 Weakest dimensions | ⚠️ Reports dimension averages (no ranking, no highlighting) | Ranked heatmap |
| 3 Improving dimensions | ❌ Trends is **personal only**; no org trend | Org/team trend per dimension |
| 4 Deteriorating dimensions | ❌ | same |
| 5 Employees requiring attention | ❌ No per-person view anywhere | People-at-risk list (low/declining scores, missed submissions, overdue) |
| 6 Overdue commitments | ❌ Only personal overdue count; team commitments are fetched in Reports but never shown | Team overdue list |
| 7 Blocked commitments | ❌ | Blocked status + list |
| 8 Actions underway | ❌ | |
| 9 Actions completed | ⚠️ A count only | |
| 10 Did completed actions improve performance? | ❌ Not modelled | Before/after dimension score per commitment |
| 11 Where evidence is missing | ❌ | Evidence completeness metric |
| 12 What needs intervention | ❌ | Exception queue |

**An Executive Operating Cockpit should exist**, and it should be *the* landing page for `ceo`/`admin`. It is the single most important missing product surface. It is mostly a read-model problem: a handful of Postgres views/RPCs over existing tables (once the integrity issues are fixed) feeding one screen.

---

## 8. Management workflows

| Capability | App level | DB/RLS level |
|---|---|---|
| See their team | ⚠️ sees **entire organisation**, incl. CEO and admins; there is no team/reporting-line concept | Manager can read all org assessments/commitments/scorecards/profiles/audit (P13, P14, P16) |
| Review assessments | ⚠️ Per-assessment score list, **no evidence text shown** despite heading "Evidence review" | Read allowed |
| Review commitments | ❌ no screen | Read allowed, write denied (P15) |
| Identify overdue | ❌ | — |
| Add management comments | ⚠️ only inside a review record; not on commitments | Denied on commitments (P15) |
| Review evidence / verify | ❌ | ❌ |
| Escalate blockers | ❌ | ❌ |
| Conduct reviews | ⚠️ insert-only, can review **anyone including the CEO or themselves** (P17, P18) | Allowed |
| See past reviews | ❌ no list anywhere | Reviewer and subject only; **CEO cannot see manager reviews** (P19) |
| Monitor team trends / recurring problems | ❌ | — |

Hiding the Review/Reports nav is the only application-level control, and it is correctly *not* relied upon: RLS independently enforces role checks for reads. The problem is the opposite: RLS is **too coarse** (manager = org-wide) and **too restrictive** (manager cannot annotate/verify).

---

## 9. RBAC matrix (as enforced by the database) **[DB][DB-PROBE]**

| Table | employee | manager | ceo | admin |
|---|---|---|---|---|
| assessments | R/C/U own (incl. rewrite/backdate, P2) | + R all org | + R all org | + R all org |
| commitments | R/C/U own (incl. manager_notes, P3) | + R all; **no U** | + R all; no U | + R all; no U |
| scorecard_entries | R/C/U own | + R all | + R all | + R all |
| management_reviews | R where subject | C/U own-authored, R own-authored | same as manager (cannot see others') | same |
| weekly_cycles | R, **C any dates/status** (P9) | + U | + U | + U |
| audit_events | **C arbitrary** (P8) | + R all | + R all | + R all |
| profiles | R self | R all org members | R all | R all |
| organization_members | R self | R all | R all | R all |
| organizations | R | R | R | R |
| privacy_consents | R/C/U own | own | own | own |
| data_retention_policies | — | — | R | R |
| Any DELETE | ✗ (no policies) | ✗ | ✗ | ✗ |
| Manage users/roles | ✗ | ✗ | ✗ | **✗ — no admin capability exists in app or RLS; requires service role/SQL** |

`admin` and `ceo` are functionally identical to `manager` except for retention-policy read.

**Privilege-escalation checks:** self-promotion blocked (P11, no UPDATE/INSERT policy on memberships) ✅; cross-user reads/writes blocked (P6, P7) ✅; `private` schema not exposed and helpers not callable by `anon` ✅; SECURITY DEFINER helpers pin `search_path` ✅; no RPCs to abuse ✅. The weaknesses are **integrity and accountability**, not classic escalation.

---

## 10. Supabase security audit — per table **[DB]**

All tables: UUID PK, RLS enabled (not forced), default Supabase grants (`anon`/`authenticated` hold full table privileges; RLS is the only barrier).

| Table | FKs (on delete) | Key constraints | SELECT | INSERT | UPDATE | DELETE | Issues |
|---|---|---|---|---|---|---|---|
| organizations | — | slug unique, singleton `((true))` | member | — | — | — | OK |
| profiles | id→auth.users CASCADE | — | self or leadership-in-org | — | — | — | No insert path/trigger; users can't edit their own name |
| organization_members | org CASCADE, user CASCADE | unique(org,user), role check | self or leadership | — | — | — | No admin write path at all |
| framework_dimensions | org CASCADE | — | active & (global or member) | — | — | — | Unused by app |
| assessments | user **CASCADE**, org CASCADE | type check; unique(org,user,type,period_start) | leadership or owner | owner | owner (unrestricted) | — | `organization_id` **nullable**; no score validation; no `period_end ≥ period_start`; no immutability after submit |
| commitments | user **CASCADE**, owner SET NULL, org CASCADE | status/priority/progress checks | leadership or owner | owner | owner only | — | org & dimension nullable; manager_notes owner-writable; no verification columns; status/progress inconsistency |
| scorecard_entries | cycle/user/org CASCADE | unique(cycle,user,dimension) | leadership or owner | owner | owner | — | Writable after cycle `closed` |
| weekly_cycles | org CASCADE | unique(org,week_start), status check | member | **any member** | leadership | — | No date sanity; employees create/close cycles |
| management_reviews | reviewer **CASCADE**, subject **CASCADE**, assessment SET NULL, org CASCADE | duration 5–120, status check | reviewer or subject | leadership, reviewer=self | reviewer | — | Subject nullable; any subject incl. self/CEO; not visible to CEO |
| audit_events | org CASCADE, user **SET NULL** (repo: CASCADE) | — | leadership | **any member, arbitrary content** | — | — | Forgeable; client-authored; no before/after values |
| privacy_consents | user CASCADE | unique(user,purpose,version) | own | own | own | — | Never used by UI |
| data_retention_policies | — | — | ceo/admin (via `organizations limit 1`) | — | — | — | Empty; no job enforces it |

**Functions:** `private.is_org_member`, `private.has_org_role` — SECURITY DEFINER, `search_path=public,private` (acceptable; `pg_catalog, public` with schema-qualified refs would be stricter), EXECUTE only for `authenticated`. `authenticated` lacks USAGE on `private`, yet policies work because stored policy expressions bind by OID (verified by probes). `public.sync_commitment_completion` — invoker, **mutable search_path** (advisor WARN; low exploitability). `public.rls_auto_enable` — undocumented drift.

**Advisors:** Security — mutable search_path (1), **leaked-password protection disabled**. Performance — 5 unused indexes (expected with zero data).

**RLS performance:** policies wrap `auth.uid()` and helpers in `(select …)` → initplan-cached ✅. `profiles_read` uses a correlated double join on `organization_members` — fine at this scale.

**Storage policies:** none (no buckets).

---

## 11. Database quality

- **Destructive deletes (Production blocker for governance).** Deleting an auth user cascades away their assessments, commitments, scorecards, *and every management review they authored or received* (P21). A manager leaving the company erases the review history of their whole team. Use soft-deactivation (`organization_members.active=false`) and `ON DELETE RESTRICT`/`SET NULL` for history tables.
- **Nullable tenancy/ownership columns** on assessments, commitments, management_reviews (added via `ALTER … ADD COLUMN` without `NOT NULL`). A null-org row becomes invisible to everyone (orphan).
- **JSONB scores** with no schema: no check on score range, dimension membership, or count. Normalise to `assessment_scores(assessment_id, dimension_id FK, score smallint check 1..5, evidence)` or add a validating trigger.
- **Denormalised text dimension IDs** vs unused `framework_dimensions` table.
- **No history tables.** Upserts overwrite assessments and scorecards; commitment edits overwrite prior values. No `updated_by`.
- **`updated_at` is client-supplied**, not trigger-maintained.
- **Migrations:** not reproducible from clean (drift §2.4); duplicate privacy migration; migration `…210113` alters a column that was already nullable (no-op). None of the migrations are destructive to existing data.

---

## 12. Authentication **[CODE][LIVE-LOGS]**

| Area | Finding | Severity |
|---|---|---|
| Login | Email/password via supabase-js ✅ | — |
| Logout | ✅ (header icon) | — |
| Session persistence / refresh | supabase-js defaults (localStorage, auto-refresh) ✅ | — |
| Password reset | **None** — no "forgot password" flow | Production blocker |
| Onboarding | No signup/invite; no profile trigger; users, profiles, memberships created by hand | Production blocker |
| First login | User without membership sees generic errors on every screen rather than an "awaiting access" state | UX |
| Auth redirect config | GoTrue logs `referer: http://localhost:3000` for production browser traffic → Site URL is localhost and the production domain is likely not in the redirect allow-list; any future reset/invite email would link to localhost **[INFERRED]** | High |
| Leaked-password protection | Disabled [DB advisor] | Medium |
| MFA | None **[NOT VERIFIED config]** | Medium for exec data |
| Race 1 | On load, `session` starts null → second effect sets `loading=false` before `getSession()` resolves → brief Login flash for signed-in users | Low |
| Race 2 | `loadMembership` ignores the query `error`; a transient failure yields `role=null` and the leadership UI silently disappears | Medium |
| Redundant calls | Every `data.ts` function calls `auth.getUser()` (network) + membership; one Reports page load produced 3× `/auth/v1/user` and 4× `organization_members` requests [LIVE-LOGS] | Performance |

---

## 13. Frontend architecture **[CODE][TEST]**

| Issue | Where | Severity |
|---|---|---|
| Source files are minified one-liners | `App.tsx`, `data.ts`, all screens | **High maintainability debt** — code review is effectively impossible; diffs are unreadable |
| Build-breaking unused import | `Sidebar.tsx:1` | Blocker |
| `any` | `Track.tsx:9` | Low (lint error) |
| `supabase!` non-null assertions (~20) | `data.ts` | Medium — null client path crashes with TypeError instead of message |
| Role list `["manager","ceo","admin"]` duplicated 8× | App, Sidebar, Dashboard, Review, data.ts | Low |
| `Page` type duplicated | App, Sidebar | Low |
| No shared data hooks/cache; each screen refetches everything | all screens | Medium |
| Effects without cancellation; state set after unmount possible | Dashboard, Track, Scorecard, Reports | Low |
| react-hooks lint rules not enabled | eslint.config.js | Medium |
| Non-atomic multi-write flows (assessment + 12 scorecard upserts + audit) | `Scorecard.tsx#save` | Medium — use one RPC/transaction |
| Scorecard doesn't pre-fill existing ratings → user must re-rate to fix a typo, then overwrites | `Scorecard.tsx` | Medium |
| Decorative non-functional header Search and Bell | `App.tsx` | UX (implies features that don't exist) |
| ErrorBoundary still uses the old orange palette | `ErrorBoundary.tsx` | Low |
| No code splitting; 613 KB single chunk (176 KB gz), Recharts loaded for everyone | build output | Low–Medium |

Direct Supabase access is correctly confined to `services/`, which is good.

---

## 14. Routing

There is no router. Consequences: no deep links (a CEO cannot be sent a link to "overdue commitments"), refresh returns to Dashboard, Back leaves the app, and the GitHub Pages `404.html` SPA fallback is irrelevant. Restricted "routes" cannot be URL-navigated, and even if a non-leader forced the Review/Reports component to render, RLS would return only their own rows — **so there is no authorization hole here**, only a usability/product gap. Recommend React Router with lazy routes and a role-guard wrapper.

---

## 15. UX / UI **[CODE — live UI could not be loaded]**

- **Direction:** blue + white is achieved and consistent across screens; it no longer resembles the navy/orange Auris Nexus-style palette (README still documents that palette — update it).
- **Accessibility (measured contrast):**

  | Pair | Ratio | WCAG AA (4.5:1) |
  |---|---|---|
  | White text on `#60A5FA` — **Sign in, Submit assessment, Submit weekly position, Complete review** | **2.54** | ❌ |
  | `#60A5FA` on white — dimension labels | 2.54 | ❌ |
  | `slate-300` on `#2563EB` — sidebar nav, hero copy | 3.48 | ❌ (normal text) |
  | `#60A5FA` on `#2563EB` — sidebar brand | 2.03 | ❌ |
  | `#2563EB` on white — headings | 5.17 | ✅ |

  Every primary call-to-action fails contrast. Form fields in Commitments use placeholders as labels (no `<label>`), the score buttons lack `aria-pressed`, and there is no visible focus style on most inputs beyond border colour.
- **Information density:** the Dashboard spends most of its area on a marketing hero and a static list of the 12 dimensions; the actionable data is five small tiles. For an executive this is the wrong way round.
- **Forms:** the Weekly Scorecard is one very long page (12 cards × rating + metrics + evidence) with a single submit at the bottom and one error at a time; no draft save, no progress indicator.
- **Empty/loading states:** mostly present; Track/Commitments show "No commitments"; Dashboard shows "Loading" only for the cycle tile.
- **Mobile:** layout is responsive (Tailwind breakpoints, mobile drawer). Live logs show real use from Android Chrome. Track's 20-writes-per-drag slider is worst on mobile networks. **[NOT VERIFIED visually]**

---

## 16. Product positioning vs. capability

*The public Vision Activ pages were blocked by the egress proxy; this table uses the capability list from the audit brief.*

| Capability | Status | Notes |
|---|---|---|
| Performance management (individual self-assessment) | **B – Partial** | Self-rating only, no manager/peer rating, no calibration |
| Planning | **C – Missing** | No objectives/OKRs/plans cascade |
| Monitoring | **B – Partial** | Personal tracking; no team monitoring |
| Evaluation | **B – Partial** | Reviews are free text, not evaluated against criteria |
| SMART goals | **B – Partial** | Target + due date exist; no measure/actual, no validation of SMART-ness |
| Evidence | **B – Partial (weak)** | Text only, not reviewable |
| Reporting | **B – Partial** | One CSV of averages; calculation defects |
| Employee performance | **B – Partial** | |
| Organisational performance | **B – Partial (incorrect KPI)** | |
| Reviews | **B – Partial** | Insert-only |
| Approvals | **C – Missing** | Review-state util exists but is unused |
| 360 feedback | **C – Missing** | |
| Moderation / calibration | **C – Missing** | |
| Automated scheduling / reminders | **C – Missing** | No cron, no email |
| Accountability | **B – Partial** | Undermined by self-verification and forgeable audit |
| Governance | **B – Partial** | Privacy tables exist, unused; no retention job |
| Executive oversight | **C – Missing** | |
| Visualisation | **B – Partial** | One personal bar chart |
| Multi-organisation SaaS | **D – Intentionally excluded** | Singleton org by design |

---

## 17. Testing audit **[TEST][CI]**

| Check | Result |
|---|---|
| `tsc -b` | ❌ **FAILS** — `Sidebar.tsx(1,71) TS6133 'Target' is declared but never read` |
| `eslint .` | ❌ 2 errors (unused `Target`; `any` in Track.tsx) |
| `vitest run` | ✅ 13/13 pass |
| `vitest run --coverage` (used by `production.yml`) | ❌ `@vitest/coverage-v8` not installed |
| `npm run build` | ❌ exits 2 (tsc) |
| `vite build` alone | ✅ 613 KB JS (warning > 500 KB) |
| `npm audit` | 2 moderate (vitest/@vitest/mocker, dev-only) |
| E2E | none |
| RLS/integration tests | none |
| GitHub Actions | CI failed on each of the last 4+ pushes; deploy workflows cancelled/failed since 27 Sep |

**Quality of the tests:**
- `rlsPolicies.test.ts` is a **tautology**: it defines a local lambda and asserts on it. It never touches Postgres. It gives false assurance and is cited in the README as RLS coverage.
- `managementReview.test.ts` tests a state machine that no screen or table uses (DB enum is `scheduled|completed|cancelled`).
- `scoring.test.ts` tests dead, buggy code (C12) with inputs that hide the bug.
- `framework.test.ts` checks the constant array has 12 items.
- `auditEvents.test.ts` checks an object mapping in an unused module.
- `ErrorBoundary.test.tsx` is a genuine (small) render test.

**Nothing that matters is tested:** `data.ts`, any screen, any calculation actually used in production (Trends, Reports, snapshot), authentication, or any RLS boundary. All seven calculation defects in §4 and all integrity findings in §20 passed CI (when CI still passed).

**Recommended:** (1) pgTAP or a Node test using `supabase start` + real JWTs per role, encoding P1–P21 as assertions; (2) extract calculations into pure functions with timezone-pinned unit tests; (3) Playwright smoke for each role against a seeded local stack.

---

## 18. Production readiness **[CI][CODE]**

| Area | Finding | Classification |
|---|---|---|
| Build | Broken at HEAD | **Production blocker** |
| Deploy pipeline | `deploy.yml` and `deploy-pages.yml` both run on push to `main` with `concurrency: pages, cancel-in-progress: true` → they cancel each other. `deploy.yml` has no lint/test gate, fails on missing lockfile, and injects `VITE_SUPABASE_ANON_KEY` which the app never reads — if it ever succeeded it would ship a build with **no Supabase client** | **Production blocker / incident risk** |
| Lockfile | Missing | Blocker for reproducibility |
| CI order | `ci.yml` runs build before test/lint; three workflows duplicate the same checks | Tech debt |
| Secrets | Publishable key hard-coded as fallback in two workflows — publishable keys are designed to be public, so **low risk**, but PR builds silently target the production project | Low |
| Migrations | Manual `workflow_dispatch` with dry-run ✅, but `supabase/setup-cli version: latest` (unpinned), and repo ≠ production (drift) | High |
| Rollback | GitHub Pages redeploy of a previous artifact only; no DB down-migrations | Medium |
| Observability | Sentry browser SDK (DSN not verified); no server logs/alerts; no uptime check | Medium |
| Backups | Supabase default daily backups on paid plans **[NOT VERIFIED plan/PITR]** | Verify |
| Security headers / CSP | GitHub Pages cannot set custom headers (no CSP, no frame-ancestors) **[INFERRED]** | Medium |
| Audit logs | Client-authored, forgeable | High |

---

## 19. Performance

- Redundant round trips: each service call does `auth.getUser()` (a network call; `getSession()` would be local) + a membership lookup. Reports load = 3 user + 4 membership calls before any data [LIVE-LOGS].
- Leadership views pull up to 500 assessments + 1 000 commitments + all members and aggregate in the browser; replace with SQL views/RPCs.
- Track slider: ~20 writes per drag.
- `ensureCurrentCycle` performs a read-then-insert on every dashboard/commitments/track load (and a race on the unique constraint at the start of each week when two users load simultaneously → user sees an error).
- Indexes are adequate for current access paths; `commitments(organization_id, due_date)` will serve overdue queries once they exist server-side.
- Bundle 613 KB, no lazy loading.

---

## 20. Data integrity — contradictory states the system accepts **[DB-PROBE]**

| State | Possible? | Probe |
|---|---|---|
| Commitment `not_started` with progress 100 % | **Yes** | P3 |
| Commitment `in_progress` with progress 100 % (after reopen) | **Yes** | P5 |
| Complete commitment with `completed_at` null | No (trigger) | P4 |
| Incomplete commitment with `completed_at` set | No on transition from complete; **Yes** if inserted directly with `completed_at` | [INFERRED from trigger logic] |
| Assessment with invalid dimension | **Yes** | P1 |
| Invalid score (99, −7) | **Yes** | P1 |
| `period_end` before `period_start` | **Yes** | P1 |
| Due date in 1900 | **Yes** | P3 |
| Weekly cycle ending before it starts / created closed by employee | **Yes** | P9 |
| Commitment owner ≠ creator, arbitrary user | **Yes** | P3 |
| Manager notes written by the employee | **Yes** | P3 |
| Review of self / of CEO by manager | **Yes** | P17, P18 |
| Orphaned rows on user deletion | No orphans — **history is deleted instead** | P21 |
| Null `organization_id` rows | Allowed by schema | [DB] |
| Duplicate baselines | **Yes** (unique per day only) | [DB] |

---

## 21. Auditability

Can management answer *who / what / when / why / previous value*?

- **Who / when:** only if the client chose to log an event; Track logs nothing. Any member can insert fabricated events (P8).
- **What / previous value:** no. Events carry a small metadata blob (e.g. `{status}`), never before/after values. Assessments, scorecards and commitments are overwritten in place.
- **Why:** no reason field anywhere.
- **Reconstruct a decision months later:** **No.** Reviews can be edited by their author with no history, and deleted wholesale by deleting the reviewer's account.

**Recommendation:** replace client-side audit inserts with a generic `AFTER INSERT OR UPDATE OR DELETE` trigger (SECURITY DEFINER, pinned `search_path`) writing `table, row_id, actor = auth.uid(), op, old_row, new_row, at` to an `audit.log` table in a non-exposed schema; revoke INSERT on `audit_events` from `authenticated`; expose reads via a leadership-only view. Add `change_reason` where business-significant (score edits, verification, reopen).

---

## 22. Notifications / automation

Nothing exists: no overdue or upcoming reminders, no manager notifications, no review reminders, no escalation, no completion notices, no weekly assessment reminders. The header bell is decorative.

**Right-sized Supabase architecture:**
1. `pg_cron` daily job → SQL function computes due/overdue/missing-submission conditions into a `notifications` table (idempotent by `(user_id, kind, subject_id, date)`).
2. In-app: `notifications` table + RLS (recipient only) + bell badge; optionally Realtime.
3. Email: `pg_net` or a small Edge Function called by cron that sends digests via a transactional provider (Resend/Postmark/SES). One daily digest per person, one weekly digest for managers/CEO. No queue infrastructure needed at this scale.

---

## 23. Evidence

Currently: **text-only**, single field on commitments (set at creation, never editable), per-dimension text in assessments/scorecards, not timestamped individually, not reviewable, not auditable, not linked across entities.

Recommend an `evidence_items` table (`id, organization_id, owner_id, subject_type ('commitment'|'assessment_score'|'review'), subject_id, kind ('note'|'file'|'link'|'metric'), body, storage_path, created_at, reviewed_by, reviewed_at, review_status`) with **Supabase Storage** (private bucket, path prefix `org/{org}/user/{uid}/…`, storage RLS mirroring table RLS, signed URLs for leadership reads, size/MIME limits). Storage is justified — evidence files (reports, screenshots, client feedback) are core to the product's promise.

---

## 24. Multi-tenancy / scale

Single-organisation with an explicit `organization_id` boundary and a singleton constraint is **architecturally sound and appropriately scoped** — do not build SaaS multi-tenancy now. Keeping `organization_id` everywhere means tenancy can be added later mostly by dropping the singleton index and fixing `data_retention_policies`' `organizations limit 1` shortcut.

What *is* needed, and is currently missing, is **intra-organisation hierarchy**: `teams(id, name, parent_id)`, `team_members(team_id, user_id, role_in_team)` or `organization_members.manager_id`, and an SQL helper `private.can_manage(target_user)` (recursive reporting line) used by RLS so managers see/verify their reports only, CEO/admin see all. This is a prerequisite for credible manager workflows and for the RBAC matrix to make sense.

---

## 25. Threat model

| Threat | Likelihood | Impact | Existing mitigation | Remaining exposure | Recommended mitigation |
|---|---|---|---|---|---|
| Unauthorised cross-user read | Low | High | Owner/leadership RLS (P7) | Managers see entire org incl. executives | Reporting-line RLS |
| Privilege escalation to leader/admin | Low | High | No write policies on memberships (P11) | None found | Keep; add admin RPC with audit |
| IDOR on commitments/assessments | Low | Medium | RLS + `eq(user_id)` (P6) | None found | pgTAP regression tests |
| Malicious employee inflating results | **Medium** | **High** | Client-side validation only | Scores 99/−7, backdating, rewriting history, self-completion, fake manager notes (P1–P4) | DB CHECKs/validation trigger; lock on submit; verification by manager; column-level update restrictions |
| Audit-log forgery | **Medium** | **High** | Leadership-only read | Any member can insert anything (P8) | Trigger-based audit; revoke INSERT |
| Malicious manager | Medium | Medium | Reviews tied to reviewer | Can review anyone incl. CEO/self; can edit reviews without history; sees all executives' data | Subject must be report; immutable review versions |
| Admin abuse / account deletion | Low | **High** | None | Deleting a user erases performance and review history (P21) | Soft-delete; RESTRICT FKs; audit |
| XSS | Low | High | React escaping; no `dangerouslySetInnerHTML` [CODE] | No CSP on GitHub Pages; session in localStorage | Host with headers (Cloudflare/Netlify/Vercel) and CSP |
| Stolen session | Low | High | Supabase JWT expiry/refresh | No MFA, leaked-password check off | Enable leaked-password protection; MFA for leaders |
| CSRF | Very low | — | Bearer tokens, not cookies | — | — |
| SQL injection | Very low | — | PostgREST parameterisation, no dynamic SQL | — | — |
| Insecure RPC / SECURITY DEFINER | Low | High | Only two definer helpers, pinned search_path, anon revoked | Trigger fn with mutable search_path (low) | Pin search_path |
| Data leakage via CSV export | Medium | Medium | Leadership-only screen | Aggregates only today; fine | Watermark/audit exports |
| Storage access | n/a | — | No storage | — | Design RLS before adding |
| Auth link misdirection | Medium | Medium | — | Site URL appears to be localhost [INFERRED] | Set Site URL + redirect allow-list |

---

## 26. Product gap analysis

| Capability | Current state | Evidence | Gap | Next step |
|---|---|---|---|---|
| Assess | Self-assessment 12×1–5 | CODE | No manager/peer view, no lock, no DB validation | Validation trigger + submit lock |
| Score | Client-validated only | DB-PROBE P1 | Invalid scores accepted | Normalised scores table or CHECK trigger |
| Baseline | Any number per user | DB | No canonical baseline | One active baseline per user per cycle-year |
| PICC | Create-only | CODE | Edit/archive, link to assessment | `source_assessment_id`, edit UI |
| Targets | Baseline/target numbers | CODE | No actual/current, unit, measure | `measure`, `unit`, `current_value`; derive progress |
| Due dates | Stored; lost on reload in list | CODE | Display bug | Fix mapping |
| Track | Built, not deployed | CI/LIVE-LOGS | Build, nav, debounce, status logic | Fix & ship |
| Act | — | — | Dated updates log | `commitment_updates` table |
| Blockers | Free text | CODE | Status, escalation | `blocked` status + escalation to manager |
| Evidence | Text | CODE | Files, review | `evidence_items` + Storage |
| Verify | — | DB-PROBE P15 | Manager verification | `verified_by/at`, `verification_status`; manager-only transition |
| Review | Insert-only | CODE/DB | History, CEO visibility, link to actions | Review list; actions → commitments |
| Improve | — | — | Before/after analysis | Post-completion score delta per commitment |
| Trends | Personal, wrong | TEST | Org/team, correct buckets | Rewrite in SQL with date_trunc in Africa/Johannesburg |
| Team management | Org-wide only | DB | Hierarchy | Teams + reporting-line RLS |
| CEO oversight | — | — | Everything in §7 | Executive cockpit |
| Executive cockpit | — | — | — | Build on SQL views |
| Notifications | — | DB (no cron) | All | pg_cron + notifications table + email digest |
| Reporting | One CSV | CODE | Correctness, per-person, compliance | SQL reporting views |
| Auditability | Client-authored | DB-PROBE P8 | Immutable trail | Trigger audit |
| Security | Solid isolation, weak integrity | DB-PROBE | See §25 | See §25 |
| Mobile | Responsive layout | CODE | Unverified visually; slider write-storm | Playwright mobile viewport |
| Accessibility | CTAs fail AA | TEST (contrast) | Contrast, labels, aria | Darken accent to ≥ `#1D4ED8` for text/buttons |

---

## 27. Code-quality findings (significant only)

| # | File | Line / function | Problem | Why it matters | Severity | Fix |
|---|---|---|---|---|---|---|
| 1 | `src/components/Sidebar.tsx` | 1 | Unused `Target` import; Track nav item never added | Breaks `tsc`/build; Track unreachable from nav | **Blocker** | Add `["track","Track & Improve",Target]` item |
| 2 | `.github/workflows/deploy.yml` | whole file | Duplicate deploy, no gates, wrong env var, cancels the other deploy | Deploys can't succeed; if they did, app ships without Supabase | **Blocker** | Delete; keep one deploy workflow |
| 3 | repo root | — | No `package-lock.json` | Non-reproducible builds; `cache: npm` fails | **Blocker** | Commit lockfile; use `npm ci` |
| 4 | `src/services/data.ts` | `getManagementSnapshot` | "Latest team score" = one person | Wrong executive KPI | High | Average per user for latest cycle, then mean |
| 5 | `src/screens/Trends.tsx` | `bucketStart` | TZ shift, 2083 fortnights, month−5 half-years | Visibly wrong charts | High | Compute buckets as date strings without `toISOString`, or in SQL |
| 6 | `src/screens/Trends.tsx` | movement | Missing previous = 0 | False "Improving" | Medium | Treat missing as null → "No comparison" |
| 7 | `src/screens/Track.tsx` | range `onChange` | Save per step; status forced | Write storm; reopens completed items | High | Local state + debounced/onPointerUp save; don't touch status unless 100 |
| 8 | `src/screens/Commitments.tsx` | `useEffect` mapping | Drops due/target/etc | Shows "Not set" for stored data | Medium | Reuse Track's `normalise` in a shared mapper |
| 9 | `supabase/migrations/*employee*` | commitments update policy | Owner may update any column incl. `manager_notes`, `status`, `owner_user_id` | Self-verification, forged notes | High | Column-guard trigger or split tables; manager-only fields |
| 10 | migrations (framework tables) | `assessments.scores jsonb` | No validation | Integrity of every aggregate | High | CHECK via trigger / normalised table |
| 11 | migrations (rls_leadership_core) | `audit_events` insert policy | Client-authored audit | Non-repudiation lost | High | Trigger-based audit |
| 12 | migrations (framework tables) | FKs `ON DELETE CASCADE` on history | Deleting a user erases history | Governance | High | RESTRICT / SET NULL + soft delete |
| 13 | `src/context/AuthContext.tsx` | `loadMembership` | Ignores query error | Silent role loss | Medium | Surface error state |
| 14 | `src/services/data.ts` | `currentUser` | `auth.getUser()` network call per operation | Latency, rate limits | Medium | Use session from context; memoise membership |
| 15 | `src/screens/Scorecard.tsx` | `save` | 14 sequential non-atomic writes | Partial submissions | Medium | One `submit_weekly_position` RPC in a transaction |
| 16 | `src/test/rlsPolicies.test.ts` | whole | Tautological test | False assurance | Medium | Replace with DB-backed tests |
| 17 | all `src/**` | formatting | Minified one-line source | Unreviewable code | Medium | Run Prettier; enforce in CI |
| 18 | `eslint.config.js` | rules | React hooks plugin not enabled | Effect bugs undetected | Low | Enable `react-hooks/recommended` |
| 19 | `src/index.css`, `ui.tsx`, screens | colours | CTA contrast 2.54:1 | WCAG failure | Medium | Use `#1D4ED8`/`#2563EB` for button backgrounds |
| 20 | `public.sync_commitment_completion` | — | Mutable search_path | Advisor WARN | Low | `set search_path = ''` |

---

## 28. Classified problem list

- **Production blocker:** broken build; conflicting/failing deploy workflows; no lockfile; no password reset or user onboarding; Auth Site URL likely localhost [INFERRED]; history deletion on user removal; forgeable audit log; self-verification of commitments.
- **Security vulnerability:** audit-log forgery (P8); employee-writable manager notes (P3); overly broad manager read scope (P13, P14); leaked-password protection off.
- **Data integrity risk:** unvalidated scores (P1); rewrite/backdate submissions (P2); status/progress contradictions (P3, P5); nullable org columns; employee-created cycles (P9); schema drift.
- **Functional gap:** verification, evidence, review history, team hierarchy, executive cockpit, notifications, commitment edit, act-log, improve analysis, routing.
- **Calculation defects:** C1–C13 (§4).
- **UX issue:** contrast; hero-heavy dashboard; decorative search/bell; long single-submit scorecard; Track not in nav.
- **Technical debt:** minified source, duplicated constants, dead code, tautological tests, 3 overlapping workflows, README out of date.
- **Future enhancement:** 360 feedback, calibration/moderation, planning cascade, multi-tenant SaaS.

---

## 29. Final executive assessment

**A. Genuinely strong**
- A clear, well-articulated 12-dimension framework with prompts and metrics per dimension.
- Correct instinct on the data boundary: every table has RLS; employees are properly isolated; no self-promotion path; SECURITY DEFINER helpers done carefully; `(select auth.uid())` initplan pattern used.
- Sensible single-org scoping with an explicit singleton constraint.
- Consistent, calm blue/white visual language; responsive layout; mobile drawer.
- Migration-gated production DB changes with a dry-run step (in intent).
- Service-layer separation (UI never calls Supabase directly).

**B. Currently incomplete**
Verification, evidence, review history, act log, improve analysis, team hierarchy, executive cockpit, notifications, user administration, password reset, routing, E2E/RLS tests.

**C. Technically risky**
Client-authored audit; unvalidated JSONB scores; cascade deletes of history; schema drift between repo and production; minified source; non-atomic multi-write submissions; three conflicting pipelines; no lockfile.

**D. Could prevent production use**
Build/deploy broken; no way to onboard users or reset passwords; self-certified results with forgeable audit; wrong executive KPIs; history loss on offboarding.

**E. Missing vs. the product vision**
The closed loop itself (Verify → Review → Improve), executive oversight, evidence, approvals, 360/moderation, scheduling and reminders, organisational trends.

**F. Would impress an executive buyer**
The framework content and language; a clean, calm UI; the idea of a weekly operating rhythm tied to commitments; the security-conscious data design (when explained).

**G. Would concern an executive buyer**
"Latest team score" being wrong on first glance; a fortnight chart labelled 2083; no view of *who* needs attention; employees marking their own commitments verified; no reminders ("so who makes people do this every week?"); no evidence uploads; no audit trail they can trust.

**H. Fix immediately (days)**
Build + single deploy pipeline + lockfile; Track in nav; C1–C6 calculation fixes; Commitments mapping bug; Track slider/status logic; DB validation of scores/dates/status-progress; revoke client audit inserts; change history FKs away from CASCADE; Auth Site URL/redirects; leaked-password protection; reconcile migrations with production.

**I. Build next (weeks)**
Team hierarchy + reporting-line RLS → manager verification & notes → evidence items + Storage → review history & review→commitment link → trigger-based audit → Executive Cockpit on SQL views → pg_cron notifications → password reset / invite onboarding → React Router.

**J. Can safely wait**
360 feedback, calibration/moderation, planning cascades, multi-tenancy, advanced visualisation, PDF export, SSO.

---

## 30. Readiness matrix

| Area | Status | Evidence | Action required |
|---|---|---|---|
| Architecture | ⚠️ Adequate for scope | CODE, DB | Add hierarchy; move aggregates to SQL |
| Frontend | ⚠️ Functional prototype | CODE | Format source, shared mappers/hooks, fix defects |
| TypeScript | ❌ Fails | TEST (`tsc -b` exit 2) | Fix import; remove `any`/`!` |
| Routing | ❌ None | CODE | React Router + role guards + lazy routes |
| Authentication | ❌ Incomplete | CODE, LIVE-LOGS, advisor | Reset/invite flows, Site URL, leaked-pw, MFA for leaders |
| RBAC | ⚠️ Coarse | DB-PROBE P11–P19 | Reporting-line scope; manager write/verify rights; admin tooling |
| Supabase | ⚠️ Healthy project, drifted schema | DB | Reconcile migrations; pin CLI |
| RLS | ⚠️ Isolation ✅, integrity ❌ | DB-PROBE P1–P21 | Column guards, validation, audit revoke, pgTAP |
| Database | ⚠️ | DB | NOT NULLs, CHECKs, RESTRICT FKs, history tables |
| Commitments | ⚠️ Create-only | CODE, DB-PROBE | Edit, link to assessment, verification, display bug |
| Track & Improve | ❌ Not deployed, defective | CI, LIVE-LOGS, CODE | Fix build, nav, write logic, audit |
| Evidence | ❌ Text only | CODE, DB (no buckets) | evidence_items + Storage |
| Executive reporting | ❌ Wrong KPI, no cockpit | TEST (C1) | SQL views + cockpit |
| Notifications | ❌ None | DB (no pg_cron) | pg_cron + notifications + digest |
| Auditability | ❌ Forgeable, no history | DB-PROBE P8 | Trigger audit |
| Testing | ❌ Non-protective | TEST | DB-backed RLS tests; calc unit tests |
| E2E | ❌ None | CODE | Playwright per role |
| CI/CD | ❌ Red, conflicting | CI | One CI, one deploy, lockfile, `npm ci` |
| Performance | ⚠️ Fine at N=1 | LIVE-LOGS, build | Cut redundant calls; server aggregates; code-split |
| Accessibility | ❌ CTA contrast fails | TEST (contrast) | Palette adjust, labels, aria |
| Mobile | ⚠️ Responsive, unverified | CODE, LIVE-LOGS (Android use) | Visual QA; fix slider writes |
| Production readiness | ❌ Not ready | All of the above | See Top 10 |

---

## 31. Verification ledger (major conclusions)

| Conclusion | Basis |
|---|---|
| Build fails at HEAD | VERIFIED BY TEST |
| Track & Improve not in production | VERIFIED BY CI + LIVE-LOGS |
| Production has no real usage | VERIFIED BY DATABASE |
| Employee isolation works | VERIFIED BY DATABASE (probes P6, P7, P11) |
| Integrity/accountability bypasses | VERIFIED BY DATABASE (probes P1–P5, P8, P9, P15–P21) |
| Calculation defects C1–C7 | VERIFIED BY TEST (reproduced) ; C8–C11 VERIFIED BY CODE |
| Schema drift | VERIFIED BY DATABASE vs CODE |
| Auth Site URL is localhost | INFERRED (GoTrue referer in logs) |
| Contrast failures | VERIFIED BY TEST (computed) |
| Live UI appearance, headers, mobile rendering | NOT VERIFIED (egress blocked) |
| Public Vision Activ positioning text | NOT VERIFIED (egress blocked) |
| Sentry active in production, backup/PITR plan | NOT VERIFIED |

---

## 32. Final verdict

### CURRENT PRODUCT STATE

Vision Activ is a **single-organisation performance self-assessment and commitment-logging prototype** with a coherent framework, a clean blue/white UI, and a correctly isolating (but integrity-weak) Supabase RLS layer. It has never been used with real data (one admin, zero records). The recently built Track & Improve workflow is **not deployed** because the build is broken and the deploy pipelines conflict. Its manager and executive layers are thin and in places **numerically wrong**, and its accountability model is **self-certified**: employees can complete, annotate and rewrite their own records while managers cannot verify anything and the audit trail can be forged. The closed loop ASSESS → COMMIT → TRACK → ACT → VERIFY → REVIEW → IMPROVE is implemented only as far as TRACK.

### TOP 10 REMAINING PRIORITIES

1. **Restore a green, deployable pipeline:** fix the Sidebar import (add the Track nav item), commit a lockfile, delete `deploy.yml`, collapse to one CI + one deploy workflow using `npm ci`, and actually ship Track & Improve.
2. **Fix the executive-facing calculations** (C1–C8) and move aggregation into SQL views with explicit `Africa/Johannesburg` week boundaries and per-person normalisation; add unit tests pinned to that timezone.
3. **Enforce data integrity in Postgres:** score/dimension validation, date sanity, status↔progress consistency, NOT NULL tenancy columns, lock assessments after submission, restrict employee writes to their own fields.
4. **Replace client audit with trigger-based, immutable audit** (actor, before/after, reason); revoke `INSERT` on `audit_events`; stop cascade-deleting history (soft-deactivate users).
5. **Introduce team hierarchy and reporting-line RLS**, then give managers note/verify rights over their reports only.
6. **Implement Verify:** verification status, verifier, timestamp, comment; completion requires manager verification; reopening requires a reason.
7. **Build the Executive Cockpit** answering the 12 CEO questions (§7) as the landing page for CEO/admin.
8. **Evidence items + Supabase Storage**, reviewable by managers, linked to commitments and assessment scores.
9. **User lifecycle & auth hardening:** invite/onboarding (profile+membership), password reset, correct Site URL/redirects, leaked-password protection, MFA for leaders; reconcile migrations with production so a clean reset reproduces it.
10. **Real tests:** DB-backed RLS/integrity suite encoding probes P1–P21, and Playwright smoke flows per role on a seeded local Supabase; then pg_cron notifications (overdue, missing weekly submission, review follow-ups).

### "If the founder demonstrated the application to the CEO of Vision Activ tomorrow…"

**What they would find impressive:** the 12-dimension framework rendered faithfully, with prompts and metrics per dimension; a calm, professional blue/white interface that works on a phone; the weekly-rhythm story (baseline → weekly scorecard → commitments → review); and, if asked, a credible answer on data security (every table protected at the database, employees isolated from one another).

**What they would question:** "Is 1.0 really our team score?" (it's one person's); "Why does the fortnight chart say 2083?"; "Where do I see who is falling behind, what's overdue, what's blocked?"; "Who checks that a 'completed' commitment was actually done — and where's the evidence?"; "What reminds people to do this every Friday?"; "Can I see the reviews my managers are holding?"; "If someone leaves, do we lose their history?" — and, if the founder tries to show Track & Improve on the live site, **it isn't there**.

**Complete before that demonstration:**
1. Green build and a successful deploy of Track & Improve (with nav item).
2. Fix C1–C6 so no chart or KPI on screen is wrong.
3. Seed a realistic demo dataset (≈10 people, 3 managers, 8–12 weeks of assessments, commitments in every state) in a **separate demo project**, not production.
4. A minimal leadership view: team list with latest score, trend arrow, overdue/blocked counts, and missing-submission flags — even if the full cockpit comes later.
5. Manager verification of a commitment (even a simple "Verify" button with verifier + timestamp), so the story reaches VERIFY.
6. Fix the primary-button contrast and remove the decorative search/bell so nothing on screen implies a feature that doesn't exist.

---

### Appendix A — RLS probe log (all executed in one transaction, forcibly rolled back)

```
P1  E1 inserted score=99/-7, unknown dimension, end<start: OK
P2  E1 rewrote/backdated own submitted assessment rows=1
P3  E1 created not_started@100%, forged manager_notes, owner=manager, bogus dimension, due 1900: OK
P4  E1 self-completed (no verification) -> 100/<now>
P5  reopen leaves in_progress@100
P6  E1 update E2 commitment rows=0
P7  E1 read E2 commitment=0
P8  E1 forged audit event: OK
P9  E1 created bogus cycle (end<start): OK
P10 E1 sees members=1
P11 E1 self-promote rows=0
P12 E1 delete own commitment rows=0
P13 manager reads CEO assessments=1
P14 manager reads profiles=5 (all)
P15 manager writes note on E1 commitment rows=0
P16 manager reads audit=1
P17 manager created review of CEO: OK
P18 manager self-review: OK
P19 CEO sees manager self-review=0
P20 after deleting E1, their audit events=1 (production FK is SET NULL; repo says CASCADE)
P21 after deleting manager, their reviews=0 (cascade-deleted)
```

### Appendix B — Calculation reproduction (TZ=Africa/Johannesburg)

```
week      2026-09-20  2026-09-27  2026-07-05     (inputs are Mondays 09-21, 09-28, 07-06)
fortnight 2083-05-14  2083-05-28  2083-01-02
month     2026-08-31  2026-08-31  2026-06-30
quarter   2026-06-30  2026-06-30  2026-06-30
halfYear  2026-03-31  2026-03-31  2026-01-31
baseline period_start at 01:00 SAST on 09-29: 2026-09-28
Latest team score shown: 1 (true team avg of latest week = 3)
movement w/o prior week: Improving (+4.0)
```
