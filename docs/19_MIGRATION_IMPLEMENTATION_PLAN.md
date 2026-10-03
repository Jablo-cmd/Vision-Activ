# Vision Activ — Migration & Implementation Plan
**Status:** Authoritative draft | **Version:** 1.0 | **Date:** 3 October 2026
## Phases
1 Documentation/current-state audit
2 Foundation/domain schema
3 Planning & execution
4 Protocol/performance evolution
5 Capability/PICC/development
6 Academy
7 Passport/leadership
8 Governance/risk/improvement
9 Reporting/workflows
10 Security/accessibility/performance/production hardening
11 UAT and controlled release
## Phase gate
Define scope → inspect dependencies → design → forward migration → implement rules → UI → test → reconcile docs → update traceability → demonstrate acceptance.
## Safety
Applied migrations are immutable. Preserve data. Backfill with verification. Do not remove schema until code, tests, reports and historical dependencies are proven clear.