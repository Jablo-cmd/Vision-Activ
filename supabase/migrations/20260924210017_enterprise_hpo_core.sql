create table public.organizations(id uuid primary key default gen_random_uuid(),name text not null,slug text not null unique,created_at timestamptz not null default now());
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,full_name text not null default '',email text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.organization_members(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,role text not null default 'employee' check(role in ('employee','manager','ceo','admin')),active boolean not null default true,created_at timestamptz not null default now(),unique(organization_id,user_id));

alter table public.framework_dimensions add column organization_id uuid references public.organizations(id) on delete cascade;
alter table public.assessments add column organization_id uuid references public.organizations(id) on delete cascade;
alter table public.commitments add column organization_id uuid references public.organizations(id) on delete cascade;
alter table public.commitments add column dimension_id text;
alter table public.management_reviews add column organization_id uuid references public.organizations(id) on delete cascade;
alter table public.management_reviews add column subject_user_id uuid references auth.users(id) on delete cascade;

create table public.weekly_cycles(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,week_start date not null,week_end date not null,status text not null default 'open' check(status in ('open','closed')),created_at timestamptz not null default now(),unique(organization_id,week_start));
create table public.scorecard_entries(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,cycle_id uuid not null references public.weekly_cycles(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,dimension_id text not null,metrics jsonb not null default '{}'::jsonb,evidence text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(cycle_id,user_id,dimension_id));
