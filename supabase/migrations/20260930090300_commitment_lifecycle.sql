-- Commitment lifecycle: measurable, verifiable, consistent.
-- Audit refs: not_started@100% and in_progress@100% possible (P3/P5); employee-writable manager
-- notes (P3); self-certified completion (P4); no verification, blocked status, act log or
-- assessment linkage.

alter table public.commitments rename column evidence to evidence_plan;
alter table public.commitments drop column if exists manager_notes;

alter table public.commitments
  add column if not exists source_assessment_id uuid references public.assessments (id) on delete set null,
  add column if not exists source_score smallint check (source_score between 1 and 5),
  add column if not exists measure text not null default '',
  add column if not exists current_value numeric,
  add column if not exists verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  add column if not exists verified_by uuid references auth.users (id) on delete restrict,
  add column if not exists verified_at timestamptz,
  add column if not exists verification_note text not null default '',
  add column if not exists blocked_at timestamptz;

create index if not exists commitments_source_assessment_idx on public.commitments (source_assessment_id);
create index if not exists commitments_verified_by_idx on public.commitments (verified_by);
create index if not exists commitments_status_due_idx on public.commitments (organization_id, status, due_date);

alter table public.commitments drop constraint if exists commitments_status_check;
alter table public.commitments
  add constraint commitments_status_check
  check (status in ('not_started', 'in_progress', 'blocked', 'complete'));

alter table public.commitments drop constraint if exists commitments_state_consistent;
alter table public.commitments
  add constraint commitments_state_consistent check (
    (status = 'complete') = (progress_percent = 100)
    and (status = 'complete') = (completed_at is not null)
    and (status = 'complete') = (verification_status in ('pending', 'verified'))
    and (status <> 'not_started' or progress_percent = 0)
    and (status <> 'blocked' or length(btrim(blocker)) > 0)
    and (verification_status not in ('verified', 'rejected') or (verified_by is not null and verified_at is not null))
    and (verification_status not in ('unverified', 'pending') or (verified_by is null and verified_at is null))
  );

alter table public.commitments drop constraint if exists commitments_baseline_target_sane;
alter table public.commitments
  add constraint commitments_baseline_target_sane
  check (baseline_value is null or target_value is null or baseline_value <> target_value);

-- Replace the old, weaker trigger with the full state machine ---------------------------------
drop trigger if exists commitments_sync_completion on public.commitments;
drop function if exists public.sync_commitment_completion();

create or replace function private.commitments_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_client boolean := current_user in ('authenticated', 'anon');
  v_today date := private.org_today();
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if v_client then
      if new.user_id is distinct from auth.uid() then
        raise exception 'Commitments can only be created for yourself' using errcode = '42501';
      end if;
      if new.status <> 'not_started' or new.progress_percent <> 0
         or new.verification_status <> 'unverified' or new.verified_by is not null
         or new.verified_at is not null or new.completed_at is not null or new.blocked_at is not null then
        raise exception 'New commitments must start as not started and unverified' using errcode = '42501';
      end if;
      if new.owner_user_id is not null and new.owner_user_id <> new.user_id then
        raise exception 'You can only own your own commitments' using errcode = '42501';
      end if;
    end if;
    new.owner_user_id := coalesce(new.owner_user_id, new.user_id);
    if new.source_assessment_id is not null and not exists (
      select 1 from public.assessments a
      where a.id = new.source_assessment_id and a.user_id = new.user_id
    ) then
      raise exception 'The source assessment does not belong to this person' using errcode = '23514';
    end if;
    if new.due_date is not null and new.due_date < v_today then
      raise exception 'Due date cannot be in the past' using errcode = '23514';
    end if;
  else
    if v_client then
      if old.verification_status = 'verified' then
        raise exception 'This commitment has been verified and is locked' using errcode = '42501';
      end if;
      if (new.user_id, new.organization_id, new.owner_user_id, new.created_at, new.source_assessment_id,
          new.source_score, new.verification_status, new.verified_by, new.verified_at,
          new.verification_note, new.completed_at, new.blocked_at)
         is distinct from
         (old.user_id, old.organization_id, old.owner_user_id, old.created_at, old.source_assessment_id,
          old.source_score, old.verification_status, old.verified_by, old.verified_at,
          old.verification_note, old.completed_at, old.blocked_at) then
        raise exception 'A protected commitment field was changed' using errcode = '42501';
      end if;
    end if;
    if new.due_date is distinct from old.due_date and new.due_date is not null and new.due_date < v_today then
      raise exception 'Due date cannot be in the past' using errcode = '23514';
    end if;
  end if;

  -- When status is untouched, progress drives status.
  if tg_op = 'UPDATE' and new.status = old.status then
    if new.progress_percent >= 100 and new.status <> 'complete' then
      new.status := 'complete';
    elsif new.progress_percent < 100 and new.status = 'complete' then
      new.status := 'in_progress';
    elsif new.progress_percent > 0 and new.status = 'not_started' then
      new.status := 'in_progress';
    end if;
  elsif tg_op = 'INSERT' and new.status = 'not_started' and new.progress_percent > 0 then
    new.status := 'in_progress';
  end if;

  if new.status = 'complete' then
    new.progress_percent := 100;
    if tg_op = 'INSERT' or old.status <> 'complete' then
      new.completed_at := now();
      new.verification_status := 'pending';
      new.verified_by := null;
      new.verified_at := null;
      new.verification_note := '';
    end if;
  else
    if new.status = 'not_started' then
      new.progress_percent := 0;
    elsif new.progress_percent >= 100 then
      new.progress_percent := 95;
    end if;
    new.completed_at := null;
    if tg_op = 'UPDATE' and old.status = 'complete' and new.verification_status in ('pending', 'verified') then
      new.verification_status := 'unverified';
      new.verified_by := null;
      new.verified_at := null;
    end if;
  end if;

  if new.status = 'blocked' then
    new.blocked_at := coalesce(case when tg_op = 'UPDATE' then old.blocked_at end, now());
  else
    new.blocked_at := null;
  end if;

  return new;
end;
$$;

create trigger commitments_before_write
  before insert or update on public.commitments
  for each row execute function private.commitments_before_write();

-- Act log: dated, attributable updates and manager comments ------------------------------------
create table public.commitment_updates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  commitment_id uuid not null references public.commitments (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  author_id uuid not null references auth.users (id) on delete restrict,
  kind text not null check (kind in ('note', 'manager_note', 'verification', 'evidence')),
  body text not null check (length(btrim(body)) > 0),
  progress_percent numeric,
  created_at timestamptz not null default now()
);

create index commitment_updates_commitment_idx on public.commitment_updates (commitment_id, created_at desc);
create index commitment_updates_user_idx on public.commitment_updates (user_id);
create index commitment_updates_author_idx on public.commitment_updates (author_id);
create index commitment_updates_org_idx on public.commitment_updates (organization_id);

alter table public.commitment_updates enable row level security;
revoke all on public.commitment_updates from anon;
revoke update on public.commitment_updates from authenticated;

create or replace function private.can_comment_on(p_commitment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.commitments c
    where c.id = p_commitment
      and (c.user_id = auth.uid() or private.can_manage(c.user_id))
  );
$$;
revoke all on function private.can_comment_on(uuid) from public, anon;
grant execute on function private.can_comment_on(uuid) to authenticated;

create or replace function private.commitment_updates_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c public.commitments;
  v_client boolean := current_user in ('authenticated', 'anon');
begin
  select * into c from public.commitments where id = new.commitment_id;
  if not found then
    raise exception 'Commitment not found or you are not permitted to use it' using errcode = '42501';
  end if;
  new.user_id := c.user_id;
  new.organization_id := c.organization_id;
  if v_client then
    if new.kind = 'note' and new.author_id <> c.user_id then
      raise exception 'Only the owner can post a progress note' using errcode = '42501';
    elsif new.kind = 'manager_note' and not private.can_manage(c.user_id) then
      raise exception 'Only a manager of the owner can post a manager note' using errcode = '42501';
    elsif new.kind not in ('note', 'manager_note') then
      raise exception 'System updates cannot be written directly' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.commitment_updates_before_insert() from public, anon, authenticated;

create trigger commitment_updates_before_insert
  before insert on public.commitment_updates
  for each row execute function private.commitment_updates_before_insert();

create policy commitment_updates_read on public.commitment_updates for select to authenticated
  using (user_id in (select private.visible_user_ids()));

create policy commitment_updates_insert on public.commitment_updates for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select private.can_comment_on(commitment_id))
  );

-- Commitment write policies: owner only, field rules enforced by trigger above ------------------
drop policy if exists commitments_owner_insert on public.commitments;
drop policy if exists commitments_owner_update on public.commitments;
create policy commitments_owner_insert on public.commitments for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and organization_id = (select private.my_org())
  );
create policy commitments_owner_update on public.commitments for update to authenticated
  using (user_id = (select auth.uid()) and organization_id = (select private.my_org()))
  with check (user_id = (select auth.uid()) and organization_id = (select private.my_org()));
