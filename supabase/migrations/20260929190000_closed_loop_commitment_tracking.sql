-- Closed-loop commitment tracking: baseline -> target -> progress -> verification.
alter table public.commitments
  add column if not exists due_date date,
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists baseline_value numeric,
  add column if not exists target_value numeric,
  add column if not exists progress_percent numeric not null default 0 check (progress_percent between 0 and 100),
  add column if not exists priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  add column if not exists blocker text not null default '',
  add column if not exists manager_notes text not null default '',
  add column if not exists completed_at timestamptz;

create index if not exists commitments_org_due_date_idx
  on public.commitments(organization_id, due_date);

create index if not exists commitments_owner_idx
  on public.commitments(owner_user_id);

-- Keep completion state and progress coherent for normal application writes.
create or replace function public.sync_commitment_completion()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'complete' then
    new.progress_percent := 100;
    if new.completed_at is null then new.completed_at := now(); end if;
  elsif new.status <> 'complete' and old.status = 'complete' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists commitments_sync_completion on public.commitments;
create trigger commitments_sync_completion
before insert or update on public.commitments
for each row execute function public.sync_commitment_completion();
