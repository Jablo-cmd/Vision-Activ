create extension if not exists pgcrypto;

create table public.framework_dimensions(
 id uuid primary key default gen_random_uuid(), name text not null, description text not null default '',
 weight numeric(8,6) not null default 0.083333, sort_order integer not null, active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.assessments(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 assessment_type text not null check(assessment_type in ('baseline','weekly')), period_start date not null, period_end date not null,
 scores jsonb not null default '[]'::jsonb, submitted_at timestamptz, created_at timestamptz not null default now()
);
create table public.commitments(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null, action text not null, timeframe text not null default '', evidence text not null default '',
 status text not null default 'not_started' check(status in ('not_started','in_progress','complete')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.management_reviews(
 id uuid primary key default gen_random_uuid(), reviewer_id uuid not null references auth.users(id) on delete cascade,
 assessment_id uuid references public.assessments(id) on delete set null, notes text not null default '', barriers text not null default '',
 support text not null default '', reviewed_at timestamptz not null default now()
);

alter table public.framework_dimensions enable row level security;
alter table public.assessments enable row level security;
alter table public.commitments enable row level security;
alter table public.management_reviews enable row level security;
