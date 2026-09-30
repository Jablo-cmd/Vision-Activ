# Demonstration environment

A fictional company that has used Vision Activ for about nine weeks, loaded into the real database through the
normal tables, triggers and constraints. Nothing is faked in the frontend: every screen reads the same rows a real
company would produce.

## People (all fictional, addresses on the reserved `.example` domain)

| Role | Person | Reports to |
|---|---|---|
| CEO | Bob Williams | - |
| Manager | Thandi Mokoena (Operations) | Bob |
| Manager | Daniel Naidoo (Client & Commercial) | Bob |
| Manager | Naledi Khumalo (People & Performance) | Bob |
| Employees | Sipho Dlamini, Ayesha Patel, Kagiso Mahlangu, Lerato Sithole | Thandi |
| Employees | Michelle van der Merwe, Themba Zulu, Fatima Cassim, Jacques Botha | Daniel |
| Employees | Zanele Ngcobo, Pieter Jacobs, Nomvula Dube, Reuben Adams | Naledi |

Sign in with `firstname.lastname@demo.visionactiv.example` (Michelle: `michelle.vandermerwe@...`). All sixteen
accounts share one password that is **not** stored in the repository; it was given to the project owner when the data
was loaded. Job titles (Operations Coordinator, Account Executive, ...) are kept in the account's user metadata only;
the product has no job-title field, and none was invented.

The existing administrator is untouched except that `performance_tracked` is set to `false` (that flag exists for
administrators) so the administrator is not listed as a missed weekly scorecard.

## Situations represented

| Situation | Who | What the data shows |
|---|---|---|
| Consistently strong | Sipho, Pieter, Michelle | Scores 4-5, verified commitments with accepted evidence, positive reviews |
| Stable | Fatima, Ayesha (delivery) | 3-4, steady, on-track commitments |
| Improving | Themba | 2.6 to 4.0 over nine weeks, a verified deadline-reduction commitment |
| Attention required | Kagiso | Low and falling score, two missed weeks, an overdue and a blocked commitment, a reopened (rejected) one, a scheduled follow-up review |
| Strong delivery, weak collaboration | Ayesha | High results/planning, low collaboration and communication, handover commitment, manager review |
| Strong people skills, weaker execution | Jacques | High collaboration/communication, falling planning and delivery, overdue review-completion commitment |
| Declining / blocked | Nomvula | 4.5 to 3.6, blocked on a Finance dependency, review with her manager |
| Overdue | Reuben | Request-handling commitment nine days overdue, manager note, review |
| New employee | Lerato | Joined 16 days ago: one baseline, three weekly scorecards, onboarding commitments |

## Files

* `supabase/demo/seed_demo.sql` - the loader. Idempotent; needs `demo.password` set in the session:
  `select set_config('demo.password','<password>',false);` before running the file.
* `supabase/demo/verify_demo.sql` - 29 read-only integrity checks (every row must read `t`).
* `scripts/db-demo.sh` - loads, verifies and proves a second load changes nothing (used by CI).
* `supabase/demo/deactivate_demo.sql` - deactivates and bans every demonstration account. **Run before real go-live.**
* `playwright.demo.config.ts`, `e2e/demo/` - exercises the populated data as the CEO, a manager and an employee:
  access boundaries (REST and UI), WCAG 2.1 A/AA on every populated screen, and an overflow sweep at nine widths.

## Honest notes

* The audit log records that the data was loaded on the day of loading (the audit table is append-only and the
  loader does not bypass it), attributed to the person each action belongs to. History inside the application
  (submission times, creation times, verification times) is dated across the nine weeks.
* One trigger, `commitments_before_write`, is disabled inside the loader's single transaction because it refuses
  past due dates and stamps "now" on completion. The table CHECK constraints still run.
* History rows use `ON DELETE RESTRICT` foreign keys by design, so demonstration data cannot be deleted; it is
  deactivated instead.
