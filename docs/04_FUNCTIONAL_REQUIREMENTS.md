# Vision Activ — Functional Requirements Specification
**Status:** Authoritative draft | **Version:** 1.0 | **Date:** 3 October 2026

## Requirement model
Each requirement must be implemented as a complete business workflow: actor, preconditions, action, validation, state transition, permissions, evidence/audit, notifications, error handling and completion state.

## Core requirements
FR-001 Identity: authenticate users and resolve their Vision Activ role, function, manager and active status.
FR-002 Passport: maintain a living transformation profile and historical achievements.
FR-003 Planning: support Annual Goal → Quarterly Result → Monthly Result → Weekly Milestone → Daily Execution.
FR-004 Results: every significant result captures output, quality, audience, due date, effort/cost and owner.
FR-005 Protocols: maintain exactly the authoritative 12 protocols, each with standard, behaviours, evidence and maturity expectations.
FR-006 Weekly Pulse: capture commitment, achievement, delivery impact, learning, next-week change and management information.
FR-007 Monthly Review: combine system evidence, employee self-assessment, Functional Head assessment and review conversation.
FR-008 Assessment: record 1–5 protocol maturity with historical immutability after finalisation except controlled correction.
FR-009 RAG: represent Green/Amber/Red state and reason/evidence.
FR-010 Corrective Action: implement variance → cause → action → owner → deadline → monitor → verify → close.
FR-011 Evidence: accept, review, verify, reject and retain evidence with source and actor.
FR-012 Capability: maintain required capability, demonstrated proficiency, gap and response.
FR-013 PICC: limit active PICCs to 2–3 unless an explicitly authorised exception exists.
FR-014 Academy: programmes, modules, enrolment, progress, assessment, reassessment, application and demonstration.
FR-015 Achievement: badges and certifications record level, date, evidence and verification.
FR-016 Leadership: track Practitioner → Functional Leader → Transformation Leader evidence and readiness.
FR-017 Governance: weekly/monthly/quarterly reviews with decisions, actions, risks and follow-up.
FR-018 Risk: record early warnings, impact, owner, mitigation, status and escalation.
FR-019 Improvement: record lessons, improvement actions, experiments and measured outcomes.
FR-020 Reporting: derive dashboards from source workflows; do not create conflicting manual copies.
FR-021 Notifications: notify users of due, overdue, blocked, verification and review events.
FR-022 Administration: manage people, roles, functions, protocol standards, Academy content, retention and system configuration.
FR-023 Audit: material administrative, assessment, verification and governance events are auditable.
FR-024 Data governance: enforce retention, consent where applicable, least privilege and controlled access.
FR-025 Traceability: every implemented requirement has acceptance criteria and tests.

## Workflow completion rule
A workflow is complete only when its terminal state is explicit, recoverable where appropriate, and reflected in source-of-truth data and audit history.
