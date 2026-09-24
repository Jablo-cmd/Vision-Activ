# Vision Activ High-Performance Operating Framework

Enterprise web application for the operating cycle: **Assess → Commit → Track → Review → Improve**.

## Stack
React 18, TypeScript, Vite, Tailwind CSS v4, Recharts and Supabase.

## Core workflows
- Baseline assessment across 12 configurable dimensions with 1–5 scoring and evidence.
- Personal Improvement Commitment Charter (PICC).
- Weekly scorecards with measurable evidence.
- Role-protected 20-minute management reviews.
- Individual trend analysis.
- Multi-horizon leadership reporting (weekly, fortnightly, monthly, 3-month and 6-month) with export.

## Security
Supabase Row Level Security is enabled on application tables. Employees can manage their own assessment, commitment and scorecard records; management functions are role protected. Audit events record key workspace activity.

## Environment
Copy .env.example to .env.local and set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Never place a service-role or other secret key in frontend code.

## Development
npm install
npm run dev
npm run build
npm test
npm run lint

## Database
Apply migrations in supabase/migrations/ in order to the target Supabase project. The migrations are committed to source control so the database setup is reproducible.

## CI
GitHub Actions runs build, tests and lint on pushes and pull requests to main.

## Framework content
The application structure supports the 12 framework dimensions supplied for this implementation. Any proprietary Vision Activ wording, scoring weights or governance rules should be reviewed and approved by the framework owner before organisational rollout.
