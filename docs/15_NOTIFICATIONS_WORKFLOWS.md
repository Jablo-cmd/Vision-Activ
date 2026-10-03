# Vision Activ — Notifications & Workflow Specification
**Status:** Authoritative draft | **Version:** 1.0 | **Date:** 3 October 2026
## Trigger classes
Due soon, overdue, blocked, RAG change, verification request/result, stale verification, weekly pulse reminder, missing submission, review follow-up, corrective-action deadline and governance action.
## Rules
Notifications are prompts, never the source of truth. Each notification links to its underlying record. Business-critical enforcement must not depend solely on delivery. Define deduplication, read state, escalation, persistence and terminal state.