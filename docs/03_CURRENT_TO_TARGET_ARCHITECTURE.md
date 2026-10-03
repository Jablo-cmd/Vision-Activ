# Vision Activ — Current-to-Target Architecture Reconciliation

**Status:** Authoritative draft  
**Version:** 1.0-draft  
**Date:** 3 October 2026

## Current foundation
The repository is a React + TypeScript + Vite + Supabase application with an intentional single-organisation boundary and an established performance-management foundation.

Verified core application tables:
1. organizations
2. profiles
3. organization_members
4. framework_dimensions
5. assessments
6. commitments
7. management_reviews
8. weekly_cycles
9. scorecard_entries
10. privacy_consents
11. data_retention_policies
12. notifications

Audit infrastructure remains part of the security architecture.

## Reconciliation
| Current asset | Target role | Decision |
|---|---|---|
| organizations | Organisation boundary | KEEP |
| profiles | Identity + Passport base | EXTEND |
| organization_members | Reporting line, role and function membership | EXTEND |
| framework_dimensions | 12 Operating Protocol catalogue | MODIFY |
| assessments | Formal assessment history | EXTEND / RESTRUCTURE |
| commitments | Results and PICC foundation | EXTEND without overloading |
| management_reviews | Monthly Performance & Growth Review foundation | EXTEND |
| weekly_cycles | Weekly operating cycle | KEEP / EXTEND |
| scorecard_entries | Weekly Performance Pulse foundation | RESHAPE |
| privacy_consents | Data governance | KEEP / EXTEND |
| data_retention_policies | Data governance | KEEP / EXTEND |
| notifications | Early warning/workflow notifications | KEEP / EXTEND |
| audit infrastructure | Immutable accountability record | KEEP / EXTEND |

## Domains requiring explicit modelling
Planning periods; Passport history; functions and capability requirements; skills/proficiency; capability assessments and gaps; development; Academy programmes/modules/enrolments; learning assessments and attempts; practical demonstrations; badges/certifications; leadership progression; risks/early warnings; corrective actions; governance reviews/decisions/actions; lessons learned; continuous improvements; recognition; Blueprint/standard versioning; onboarding; succession/readiness.

## Schema design rule
Do not create one table per screen. Classify each concept as a durable business entity, event/history record, relationship, configurable standard or derived/reporting view. Extend existing entities only where semantics remain clear; create separate entities where lifecycle or ownership would otherwise become ambiguous.

## Security rule
Every new table requires explicit visibility/ownership rules, RLS, grants, validated business-rule write paths, material audit requirements, integrity constraints and role-specific tests. The browser is never the security boundary.

## Migration rule
Applied migrations are immutable. New schema changes use forward migrations. The actual migration chain must be reconciled before schema changes are written.

## Target architecture
Identity & Organisation → Planning & Execution → Performance & Protocols → Capability & Academy → Governance & Improvement → Reporting & Administration.

Cross-cutting: Security, Audit, Evidence, Notifications and POPIA/Data Governance.

## Technology
There is no current requirement to replace React/TypeScript/Vite/Supabase. Technology changes must be justified by a concrete product or engineering requirement.
