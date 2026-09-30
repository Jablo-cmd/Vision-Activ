# Vision Activ — High-Performance Operating Framework

A single-organisation performance-management application built around one closed loop:

**ASSESS → COMMIT → TRACK → ACT → VERIFY → REVIEW → IMPROVE**

| Stage | What the application does |
|---|---|
| Assess | One-off baseline and a weekly scorecard across the 12 framework dimensions (1–5 rating, measures, evidence). |
| Commit | Commitments (PICC) created from a weak dimension, linked to the score they start from, with baseline, target, measure and due date. |
| Track | Status, measured progress, blockers (which notify the manager), owner-only editing. |
| Act | A dated act log of updates, plus evidence: notes, links, measurements and files (private storage). |
| Verify | The owner's manager reviews evidence and verifies or reopens the commitment; verified work is locked. |
| Review | Structured manager reviews (evidence, barriers, support, actions, follow-up) the employee can read. |
| Improve | "Did it work?": each completed commitment is compared with the next weekly score in its dimension. |

Executives get a **cockpit** (score, weakest / improving / deteriorating dimensions, 8-week heat map, people needing attention,
blocked / overdue / awaiting-verification queues, evidence gaps, outcomes). Managers see the same for their reporting line only.

## Architecture

```
Browser (React 18 + TypeScript, Vite, Tailwind 4, React Router, TanStack Query)
   │  lazy routes · route guards (UX only) · typed service layer · no Supabase calls in components
   ▼
Supabase Auth (email + password, password reset, invitations)
   ▼
PostgREST  ──►  Postgres 17  (the security boundary)
   │              ├─ Row Level Security on every table, scoped by reporting line
   │              ├─ private.visible_user_ids()  self + reporting subtree (CEO/admin: everyone)
   │              ├─ validated RPCs for every write that carries business rules
   │              │    submit_baseline · submit_weekly_position · ensure_current_cycle
   │              │    verify_commitment · review_evidence · admin_add_member · admin_update_member
   │              ├─ triggers: commitment state machine, score/metric validation, notifications
   │              ├─ append-only audit_log (trigger-written; actor, before/after values)
   │              ├─ report_* functions (SECURITY INVOKER: RLS applies to reports)
   │              └─ pg_cron: daily notification generator
   ├──►  Storage: private "evidence" bucket (owner writes under <user_id>/…, reads follow reporting lines)
   └──►  Edge Function: invite-user (sends the auth invite; membership is created with the caller's own JWT)
```

Single organisation is deliberate: `organization_id` is kept as an explicit boundary and a unique index prevents a second
organisation. Reporting lines (`organization_members.manager_user_id`) provide the team structure.

### Roles

| | Employee | Manager | CEO | Administrator |
|---|---|---|---|---|
| Own assessments, commitments, evidence | ✔ create / edit own | ✔ | ✔ | ✔ |
| See other people's data | — | own reporting line | everyone | everyone |
| Comment on / review evidence / verify commitments | — | their reports | everyone (not themselves) | everyone (not themselves) |
| Record reviews | — | their reports | everyone (not themselves) | everyone (not themselves) |
| Cockpit, team, reports | — | own line | ✔ | ✔ |
| People, audit log | — | — | ✔ (employees & managers only) | ✔ |

Nobody can verify their own work, edit a verified commitment, or write to the audit log. These rules are enforced in Postgres
and tested there; hiding a button is never the control.

## Development

```bash
npm ci
cp .env.example .env.local        # VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, optional VITE_SENTRY_DSN
npm run dev
```

| Command | What it does |
|---|---|
| `npm run lint` · `npx tsc -b` | ESLint (incl. React hooks rules, no `any`) and strict TypeScript |
| `npm test` | Unit tests (`src/lib` calculations, validation; Edge Function validation). Coverage thresholds enforced |
| `./scripts/e2e-stack.sh` | Starts a real local Supabase subset (Postgres, Auth, PostgREST, Storage, Mail) with every migration applied |
| `./scripts/db-test.sh` | pgTAP suites: RLS per role, integrity, lifecycle, audit, notifications, reporting |
| `npx playwright test` | Browser tests against that stack: full closed loop, authorisation attacks, password reset by email, WCAG scan, mobile |
| `E2E_SCREENSHOTS=1 npx playwright test 06-screens` | Design-review screenshots into `e2e-screens/` |

Docker is required for the local stack. If your Playwright browser build differs from the installed one, set
`E2E_CHROMIUM=/path/to/chrome`.

### What the tests prove

* **pgTAP** impersonates each role with real JWT claims against the real policies: employees cannot read or edit each other, managers see
  only their line, nobody can forge audit entries, invalid scores/dates/state combinations are rejected, history cannot be cascade-deleted,
  `anon` and PUBLIC hold no privileges, every `SECURITY DEFINER` function pins `search_path`.
* **Playwright** drives the real UI against real Auth/PostgREST/Storage: the closed loop across employee → manager → CEO, direct API attacks
  with a peer's valid token, private file upload and signed-URL download, password reset from the captured email, axe WCAG 2.1 A/AA
  on every screen for every role, Storage attacks (forged paths, overwrite, peer reads, public URLs), and a responsive audit that fails on
  any horizontal overflow or clipped element at 320, 360, 375, 390, 414, 768, 1024, 1280 and 1680px for every role.
* **Vitest** covers the pure calculation library at 100% of lines and functions, and re-runs under other time zones.

## Demonstration environment

See [docs/DEMO.md](docs/DEMO.md): a fictional nine-week company (CEO, 3 managers, 12 employees) loaded through the real tables,
with an integrity check, an idempotency proof and role-based end-to-end verification in CI.

## CI/CD

`.github/workflows/ci.yml` — one pipeline: **quality** (prettier, ESLint, tsc, unit tests + coverage, build) ·
**database** (clean replay of all migrations + pgTAP) · **e2e** (Playwright on the local stack) · **deploy** to GitHub Pages
(only on `main`, only when all three pass). `.github/workflows/migrations.yml` applies production migrations: manual, approval-gated
(`production` environment), always dry-runs first, CLI version pinned.

Secrets (all optional except migrations): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SENTRY_DSN`,
`SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`. Never put a service-role key in the frontend or in a `VITE_` variable.

## Database

All schema lives in `supabase/migrations/` and replays deterministically from an empty database (CI proves it on every push).
Do not edit an applied migration; add a new one. See [`docs/OPERATIONS.md`](docs/OPERATIONS.md) for the production checklist
(Auth settings, first administrator, backups, monitoring) and [`docs/audit/`](docs/audit/) for the independent audit that drove this work.

## Design system

Friendly corporate blue on white, navy for text and emphasis, Fraunces for titles and headline figures, Inter for everything functional
(both bundled, no third-party font requests). The operating loop (Assess → Improve) is shown on the employee dashboard with real status
per stage. Tokens live in `src/index.css`; the palette is a placeholder until the brand guide's exact values are supplied; every text/background pairing meets WCAG AA (axe verifies it in CI).
Colour is never the only signal: scores, deltas and statuses always carry text.

## Privacy and governance

The database has structures for consent records and retention policies (`privacy_consents`, `data_retention_policies`), an append-only
audit trail, and no cascade deletion of performance history (deactivate people rather than deleting them). These support POPIA/GDPR
operations but are not legal compliance by themselves: keep a current privacy notice, retention schedule, data-subject-request process
and incident-response plan. Framework wording, scoring and governance rules should be approved by the framework owner before roll-out.

## Known limitations

* Notifications are in-app only; email digests need a provider (Resend/Postmark/SES) wired to an Edge Function.
* The team structure is the reporting line; matrix/dotted-line teams and 360° feedback, moderation/calibration and planning cascades are not built.
* Anonymisation for erasure requests is not implemented (the `anonymize` retention method is recorded, not executed).
