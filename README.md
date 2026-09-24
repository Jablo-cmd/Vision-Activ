# Vision Activ High-Performance Operating Framework

Enterprise web application for assessments, commitments, weekly scorecards, management reviews, trend analysis and quarterly consolidation.

## Stack
React 18, TypeScript, Vite, Tailwind CSS v4, Recharts and Supabase.

## Framework content
The 12 dimensions are database-configured because the proprietary Vision Activ framework definitions were not included in the build brief. Neutral placeholders are seeded. Before production rollout, replace them with the approved names, descriptions and weights supplied by Vision Activ.

## Environment
Create .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Never expose a service-role or secret key in frontend code.

## Run
npm install
npm run dev
npm run build
npm test

## Supabase
Apply supabase/migrations/20260924223000_hpo_framework.sql to the target project. Configure authentication and invite users.

## Production
Use GitHub Actions for CI and deploy the static frontend to the organisation's approved hosting platform. RLS is enabled on all application tables and ownership checks are used for user records.

## Context
Vision Activ publicly describes its performance management offering as a cloud-based system supporting planning, assessment, improvement, evidence, progress monitoring, reviews and reporting. The application architecture follows that operating rhythm while keeping proprietary framework content configurable.