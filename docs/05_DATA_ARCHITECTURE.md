# Vision Activ — Data Architecture
**Status:** Authoritative draft | **Version:** 1.0 | **Date:** 3 October 2026

## Design principles
Use domain entities, explicit lifecycles, foreign keys, constraints and server-enforced rules. Avoid table-per-screen and overloaded JSON for durable business relationships.

## Existing foundation
organizations, profiles, organization_members, framework_dimensions, assessments, commitments, management_reviews, weekly_cycles, scorecard_entries, privacy_consents, data_retention_policies, notifications, plus existing audit infrastructure.

## Target domain model
Identity: organizations, profiles, organization_members, functions/roles as required.
Planning: goals, planning periods, results, milestones, execution records where justified.
Performance: protocols, assessments, weekly pulses, reviews, RAG states.
Delivery: results, evidence, verification.
Development: skills, capability requirements, proficiency assessments, gaps, development actions, PICCs.
Academy: programmes, modules, enrolments, learning progress, assessments/attempts, assignments/demonstrations, badges, certifications.
Leadership: progression, readiness, succession evidence.
Governance: governance reviews, risks, corrective actions, decisions, actions.
Improvement: lessons learned, improvements, experiments, outcomes.
Standards: Blueprint/Protocol/Academy content versions and approval history.
Cross-cutting: audit, notifications, privacy/data governance.

## Rules
- Every entity has an owner/organisation boundary where applicable.
- Required relationships use foreign keys.
- Dates and numeric ranges use database constraints.
- Historical assessment/verification records are not casually overwritten.
- Derived reporting should use views/functions where appropriate.
- Avoid storing duplicated calculated scores as authoritative facts.
- New tables require RLS and role-specific tests.
- Applied migrations are immutable; all changes are forward migrations.
- Existing tables are extended only where semantics remain unambiguous.

## Data lifecycle
Draft → Submitted → In Review → Verified/Rejected → Closed, where that lifecycle applies. Published standards use version/effective dates and controlled retirement.

## Integrity
Use NOT NULL where business-required, CHECK constraints for enumerations/ranges, UNIQUE constraints for natural uniqueness, FK restrictions for historical records, indexes for ownership/reporting paths, and triggers/RPCs only where database enforcement is necessary.
