# Vision Activ — High-Performance Operating Framework

Enterprise-grade web application for the Vision Activ operating cycle:

**Assess → Commit → Track → Review → Improve**

Vision Activ is a **single-organization application** designed for controlled organisational performance management. It is not a multi-tenant SaaS platform.

## Core capabilities
- Baseline assessment across 12 performance dimensions with 1–5 scoring and evidence.
- Personal Improvement Commitment Charter (PICC).
- Weekly scorecards with measurable evidence.
- Role-protected management reviews.
- Individual trend analysis.
- Weekly, fortnightly, monthly, 3-month and 6-month reporting.
- Audit-event recording.
- Supabase Row Level Security and role-based access control.
- Privacy and retention controls.
- Production monitoring with Sentry.

## Technology
- React 18
- TypeScript
- Vite
- Tailwind CSS v4
- Supabase PostgreSQL + Auth + RLS
- Vitest + React Testing Library
- Recharts
- GitHub Actions
- Vercel
- Sentry

## Architecture
The system uses one Vision Activ organisation.

The database retains an organisation identifier because it provides an explicit security boundary for organisation membership and RLS. A database singleton constraint prevents the application from becoming multi-tenant.

## Security
Supabase RLS protects application tables. Access decisions are based on authenticated identity, active organisation membership and application role.

Never expose:
- Supabase service-role keys
- Database passwords
- Supabase access tokens
- Vercel deployment tokens
- Sentry server authentication tokens

Frontend configuration may contain only public client configuration such as the Supabase publishable key and Sentry DSN.

## Production CI/CD
GitHub Actions performs:
1. Dependency installation.
2. ESLint.
3. Vitest tests and coverage.
4. Production build.
5. Build artifact upload.
6. Vercel project linking.
7. Vercel production environment retrieval.
8. Vercel build artifact creation.
9. Artifact upload/download.
10. Prebuilt production deployment.

Supabase migrations are deliberately controlled through a manual workflow dispatch with an explicit migration switch and a dry-run before `supabase db push`.

## Required GitHub secrets
`VITE_SUPABASE_URL`
`VITE_SUPABASE_PUBLISHABLE_KEY`
`VITE_SENTRY_DSN`
`SUPABASE_PROJECT_REF`
`SUPABASE_ACCESS_TOKEN`
`VERCEL_TOKEN`
`VERCEL_ORG_ID`
`VERCEL_PROJECT_ID`

## Development
```bash
npm install
npm run dev
npm run lint
npm test
npm run build
```

## Testing
The repository includes tests covering:
- Audit-event payload construction.
- Management-review state transitions.
- RLS policy contract expectations.

For production RLS verification, run authenticated integration tests against a dedicated test environment rather than using privileged service-role credentials in browser tests.

## Monitoring
Sentry is initialized before React mounts. The application uses:
- Production error capture.
- React Error Boundary capture.
- Browser performance tracing.
- Environment-aware trace sampling.
- `sendDefaultPii: false`.

Create a Sentry React project and store its DSN as `VITE_SENTRY_DSN`.

## Privacy and governance
The database includes structures for:
- Privacy consent records.
- Lawful processing basis.
- Privacy-notice versions.
- Consent withdrawal timestamps.
- Data retention categories.
- Retention periods.
- Deletion/anonymisation/archive methods.

These controls support POPIA/GDPR operationalisation but do not by themselves constitute legal compliance. Vision Activ should maintain a current privacy notice, retention schedule, data-subject request process and incident-response procedure.

## Design system
The interface follows a premium executive palette:
- Deep Navy: `#071A33`
- Dark Navy: `#03101F`
- Vision Orange: `#F28C28`
- Dark Orange: `#D96F16`
- White: `#FFFFFF`
- Soft White: `#F7F9FC`
- Border: `#DCE3EA`
- Text: `#152238`
- Muted: `#667085`

Use navy for application chrome and authority, white for content surfaces, soft white for workspace backgrounds, and orange for primary actions and key emphasis.

## Database migrations
All schema changes are version-controlled under `supabase/migrations/`.

The production migration process is intentionally gated. Do not run production migrations automatically on every pull request.

## Deployment
Production deployments occur from `main` after the quality job passes.

Vercel's prebuilt deployment flow is used so the build artifact produced in CI is the artifact deployed to production.

## Governance
The framework content, scoring weights, proprietary wording and organisational governance rules should be approved by the Vision Activ framework owner before production rollout.