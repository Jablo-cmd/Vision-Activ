create table if not exists public.privacy_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null,
  lawful_basis text not null check (lawful_basis in ('consent','contract','legal_obligation','legitimate_interest','vital_interest','public_task')),
  consent_status text not null check (consent_status in ('granted','withdrawn','not_required')),
  privacy_notice_version text not null,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, purpose, privacy_notice_version)
);

create index if not exists privacy_consents_user_idx
  on public.privacy_consents(user_id, created_at desc);

alter table public.privacy_consents enable row level security;

create table if not exists public.data_retention_policies (
  id uuid primary key default gen_random_uuid(),
  data_category text not null unique,
  purpose text not null,
  retention_days integer not null check (retention_days > 0),
  legal_basis text not null,
  deletion_method text not null check (deletion_method in ('delete','anonymize','archive')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.data_retention_policies enable row level security;
