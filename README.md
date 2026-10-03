# Vision Activ — Transformation System

Vision Activ is an internal Transformation System designed to embed planning, delivery, performance, capability development, learning, governance and continuous improvement into everyday work.

**Current product direction:** the Transformation Blueprint, Transformation Passport and Transformation Academy are the source documents for the next product architecture.

## Operating model

**Blueprint** defines the standard.  
**Passport** gives each person a practical reference and living transformation profile.  
**Academy** develops knowledge, capability, judgement and mastery.  
**Transformation System** embeds the model into planning, delivery, assessment, development and governance.

Transformation journey:

**Understand → Learn → Apply → Measure → Improve → Master → Sustain**

Everyday actions:

**PLAN → DELIVER → REVIEW → DEVELOP → LEARN**

## Authoritative documentation

Start with docs/README.md, then:

1. docs/00_MASTER_TRANSFORMATION_SYSTEM_SPEC.md
2. docs/01_PRODUCT_REQUIREMENTS.md
3. docs/02_INFORMATION_ARCHITECTURE.md
4. docs/03_CURRENT_TO_TARGET_ARCHITECTURE.md

Further domain and engineering specifications will be added before implementation changes are made.

## Current technical foundation

The existing application is a React + TypeScript + Vite + Supabase application with an intentional single-organisation boundary.

The verified core application tables are:

- organizations
- profiles
- organization_members
- framework_dimensions
- assessments
- commitments
- management_reviews
- weekly_cycles
- scorecard_entries
- privacy_consents
- data_retention_policies
- notifications

The existing security, audit, evidence, workflow and reporting infrastructure will be audited and selectively extended rather than discarded without reason.

## Engineering rule

No feature is considered complete because a screen renders.

A completed workflow requires the data model, database authorisation, service behaviour, UI state transitions, validation, audit/evidence handling, relevant tests, documentation and traceability to be complete.

Applied database migrations are immutable. New schema changes use forward migrations.

## Scope

Current scope is a single Vision Activ organisation and its internal operating model.

Future client configuration, matrix teams, 360-degree feedback and moderation/calibration are not current implementation scope unless separately approved.

## Important

Older pre-transformation documentation has been removed from the active docs tree because it described a former version of the product and could conflict with the current direction.
