# Remediation status — follow-up to the 29 September 2026 audit

Every blocker and high-severity finding from `2026-09-29-production-audit.md` and how it was closed. "Evidence" names the test that
fails if the fix regresses. Items that need a person or a paid feature are listed at the end as **not automatable**.

## Blockers

| Audit finding | Resolution | Evidence |
|---|---|---|
| `tsc -b` failed at HEAD (unused import); Track & Improve never deployed | Frontend rebuilt; strict TS, lint (React hooks rules, no `any`), formatted source | CI `quality` job |
| Four overlapping / cancelling deploy workflows; no lockfile | One gated pipeline (`ci.yml`), `package-lock.json` committed, `npm ci` | CI run on the PR |
| No password reset or onboarding | Reset flow; `invite-user` Edge Function; **People** admin; profile provisioning trigger | `04-auth.spec.ts` (reset via captured email); `05_admin_and_grants.test.sql` |
| Auth Site URL was `http://localhost:3000` | Documented as a manual dashboard setting (cannot be set by migration) | `docs/OPERATIONS.md` §1 — **manual** |
| Deleting a user erased history (P21) | History FKs are `RESTRICT`; people are deactivated | `02_integrity` (user with history cannot be deleted); `05` (no history table cascades) |
| Forgeable audit log (P8) | Trigger-written append-only `audit_log`; clients have SELECT only; UPDATE/DELETE/TRUNCATE blocked even for the owner role | `04_reviews_audit_notifications` (forgery, tamper, content); `02-workflow` (audit shown to CEO) |
| Self-certified completion (P4), employee-writable manager notes (P3) | State machine + guard trigger; `verify_commitment` requires an accepted-evidence item and a manager in the owner's line | `03_commitment_lifecycle` (56 assertions); `02-workflow` VERIFY / REJECT |

## Security and integrity

| Finding | Resolution | Evidence |
|---|---|---|
| Managers read the whole organisation (P13/P14/P16) | `organization_members.manager_user_id`; `visible_user_ids()` drives every read policy | `01_visibility` (28); mutation check re-introducing the old policy fails 01 and 06 |
| Scores 99 / −7, unknown dimensions, backdating, rewrite (P1/P2) | Writes only through `submit_baseline` / `submit_weekly_position`; validation triggers; baseline immutable | `02_integrity` (36) |
| Employee-created bogus cycles (P9) | `ensure_current_cycle()` only; Monday/+6 CHECK; SAST week | `02_integrity` |
| Manager reviewed the CEO / themselves (P17/P18); CEO could not see reviews (P19) | Insert policy requires `can_manage(subject)`; CEO/admin can read all | `04_reviews_audit_notifications` |
| `not_started@100%`, `in_progress@100%` (P3/P5) | CHECK `commitments_state_consistent` + trigger normalisation | `03_commitment_lifecycle` |
| `anon` / PUBLIC held privileges; mutable `search_path` | Privilege sweep; all `SECURITY DEFINER` pin `search_path`; default privileges tightened | `05_admin_and_grants` catalog invariants |
| Migration drift (index names, audit FK) | Repo aligned to production; clean replay proven | CI `database` job (31 migrations from empty) |
| Nullable tenancy columns, text dimension IDs | `NOT NULL` + FK to `framework_dimensions.slug` | `02_integrity`, `03_commitment_lifecycle` |

## Calculations (C1–C13)

| Defect | Fix | Test |
|---|---|---|
| C1 "latest team score" = one person | Score = response-weighted mean of the week's dimension averages (server-side, RLS-scoped) | `metrics.test.ts` "a whole team is averaged"; `06_reporting` |
| C2–C4 wrong / 2083 / shifted buckets | Date arithmetic on `YYYY-MM-DD` strings in UTC; Jan/Jul half-years; fixed Monday anchor for fortnights | `metrics.test.ts` bucketStart, run under three time zones in CI |
| C5 one-bar trends | Look-back and grouping are separate controls | `metrics.test.ts` trendSeries |
| C6 false "Improving +4.0" | Missing previous value is "no comparison", never 0 | `metrics.test.ts` movement |
| C7 UTC baseline date | `private.org_today()` (Africa/Johannesburg) | `02_integrity`, `dates.test.ts` |
| C8 Monday double-count | Reporting windows are whole weekly cycles anchored to the latest week with data | `metrics.test.ts` periodWindow |
| C9 pooled means / no compliance | Response-weighted; submission rate reported (`report_submission_rate`) | `06_reporting` |
| C10 silent truncation at 500/1000 rows | Aggregation moved into SQL (`report_*`); paginated lists with exact counts | `06_reporting`, `TeamCommitments` |
| C13 invalid scores inflate averages | Impossible at the database | `02_integrity` |

## Product gaps closed

Verification, evidence (files in private Storage), act log, blocker escalation, review history, reporting-line teams, executive/team cockpit
answering the 12 CEO questions, outcome analysis ("did it work?"), notifications with a daily `pg_cron` job, member administration,
routing with deep links, mobile drawer, WCAG A/AA (axe on every screen and role), CSV export safe from formula injection.

## Not automatable / decisions left to the organisation

* **Supabase Auth dashboard settings**: Site URL and redirect allow-list, disable public sign-up, leaked-password protection, custom SMTP, MFA for CEO/admin, backups / PITR (`docs/OPERATIONS.md` §1).
* **Email delivery of notifications** needs a provider account; in-app notifications are live.
* **Security headers / CSP**: GitHub Pages cannot set response headers; front the domain with a CDN that can if a CSP is required.
* **POPIA erasure** (anonymisation procedure), retention execution, privacy notice text: organisational decisions.
* **360° feedback, calibration/moderation, planning cascades, matrix teams** remain future product scope.
* **Sentry DSN** (`VITE_SENTRY_DSN`) must be supplied to enable browser error capture.
