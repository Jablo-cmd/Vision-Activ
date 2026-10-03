# Vision Activ — Technical Architecture
**Status:** Authoritative draft | **Version:** 1.0 | **Date:** 3 October 2026
## Stack
React + TypeScript + Vite + Supabase/PostgreSQL with existing RLS, RPC, migration, testing and reporting infrastructure.
## Target domains
Identity & Organisation → Planning & Execution → Performance & Protocols → Capability & Academy → Governance & Improvement → Reporting & Administration. Cross-cutting: Security, Audit, Evidence, Notifications, Data Governance.
## Rules
Keep integrity/authorisation rules in the database where appropriate. Keep presentation in the client. Prefer typed contracts, explicit errors and small domain services/hooks. Unit-test pure logic; integration-test services/database; RLS-test visibility; E2E-test critical journeys.
## Technology changes
No replacement without a documented product/engineering requirement, migration plan and acceptance criteria.