-- Evidence and manager verification.
-- Audit refs: evidence was one text field; self-certified completion (P4); managers could not
-- verify (P15); no storage.

create table public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete restrict,
  commitment_id uuid references public.commitments (id) on delete restrict,
  assessment_id uuid references public.assessments (id) on delete restrict,
  kind text not null check (kind in ('note', 'link', 'file', 'metric')),
  title text not null check (length(btrim(title)) > 0),
  body text not null default '',
  url text,
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes between 1 and 10485760),
  metric_value numeric,
  review_status text not null default 'pending' check (review_status in ('pending', 'accepted', 'rejected')),
  reviewed_by uuid references auth.users (id) on delete restrict,
  reviewed_at timestamptz,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  constraint evidence_has_subject check (commitment_id is not null or assessment_id is not null),
  constraint evidence_note_has_body check (kind <> 'note' or length(btrim(body)) > 0),
  constraint evidence_link_is_http check (kind <> 'link' or url ~* '^https?://'),
  constraint evidence_file_has_path check (
    kind <> 'file' or (storage_path is not null and file_name is not null)
  ),
  constraint evidence_metric_has_value check (kind <> 'metric' or metric_value is not null),
  constraint evidence_path_owned check (
    storage_path is null or storage_path like user_id::text || '/%'
  ),
  constraint evidence_review_consistent check (
    (review_status = 'pending') = (reviewed_by is null and reviewed_at is null)
  )
);

create index evidence_items_commitment_idx on public.evidence_items (commitment_id);
create index evidence_items_assessment_idx on public.evidence_items (assessment_id);
create index evidence_items_user_idx on public.evidence_items (user_id);
create index evidence_items_reviewed_by_idx on public.evidence_items (reviewed_by);
create index evidence_items_org_idx on public.evidence_items (organization_id);

alter table public.evidence_items enable row level security;
revoke all on public.evidence_items from anon;
revoke update on public.evidence_items from authenticated;

create policy evidence_read on public.evidence_items for select to authenticated
  using (user_id in (select private.visible_user_ids()));

create policy evidence_insert on public.evidence_items for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and organization_id = (select private.my_org())
    and review_status = 'pending'
  );

create or replace function private.evidence_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.commitment_id is not null and not exists (
    select 1 from public.commitments c where c.id = new.commitment_id and c.user_id = new.user_id
  ) then
    raise exception 'The commitment does not belong to you' using errcode = '42501';
  end if;
  if new.assessment_id is not null and not exists (
    select 1 from public.assessments a where a.id = new.assessment_id and a.user_id = new.user_id
  ) then
    raise exception 'The assessment does not belong to you' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger evidence_before_insert
  before insert on public.evidence_items
  for each row execute function private.evidence_before_insert();

-- Log evidence submissions into the commitment act log (runs as owner; system-kind update).
create or replace function private.evidence_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.commitment_id is not null then
    insert into public.commitment_updates (commitment_id, author_id, kind, body)
    values (new.commitment_id, new.user_id, 'evidence', 'Added evidence: ' || new.title);
  end if;
  return new;
end;
$$;
revoke all on function private.evidence_before_insert() from public, anon, authenticated;
revoke all on function private.evidence_after_insert() from public, anon, authenticated;

create trigger evidence_after_insert
  after insert on public.evidence_items
  for each row execute function private.evidence_after_insert();

-- Manager review of evidence ---------------------------------------------------------------------
create or replace function public.review_evidence(p_id uuid, p_status text, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.evidence_items;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if p_status not in ('accepted', 'rejected') then
    raise exception 'Status must be accepted or rejected' using errcode = '22023';
  end if;
  select * into e from public.evidence_items where id = p_id for update;
  if not found or not private.can_manage(e.user_id) then
    raise exception 'Evidence not found or you are not permitted to review it' using errcode = '42501';
  end if;
  if p_status = 'rejected' and v_note = '' then
    raise exception 'A reason is required when rejecting evidence' using errcode = '22023';
  end if;
  update public.evidence_items
  set review_status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
  where id = p_id;
end;
$$;

-- Manager verification of a completed commitment --------------------------------------------------
create or replace function public.verify_commitment(p_id uuid, p_decision text, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.commitments;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if p_decision not in ('verified', 'rejected') then
    raise exception 'Decision must be verified or rejected' using errcode = '22023';
  end if;
  select * into c from public.commitments where id = p_id for update;
  if not found or not private.can_manage(c.user_id) then
    raise exception 'Commitment not found or you are not permitted to verify it' using errcode = '42501';
  end if;
  if c.status <> 'complete' then
    raise exception 'Only completed commitments can be verified or reopened' using errcode = '55000';
  end if;

  if p_decision = 'verified' then
    if c.verification_status <> 'pending' then
      raise exception 'This commitment is not awaiting verification' using errcode = '55000';
    end if;
    if not exists (
      select 1 from public.evidence_items ev
      where ev.commitment_id = c.id and ev.review_status = 'accepted'
    ) then
      raise exception 'At least one accepted evidence item is required to verify a commitment' using errcode = '55000';
    end if;
    update public.commitments
    set verification_status = 'verified', verified_by = auth.uid(), verified_at = now(), verification_note = v_note
    where id = c.id;
  else
    if v_note = '' then
      raise exception 'A reason is required when rejecting or reopening a commitment' using errcode = '22023';
    end if;
    update public.commitments
    set status = 'in_progress', verification_status = 'rejected',
        verified_by = auth.uid(), verified_at = now(), verification_note = v_note
    where id = c.id;
  end if;

  insert into public.commitment_updates (commitment_id, author_id, kind, body)
  values (
    c.id, auth.uid(), 'verification',
    case p_decision when 'verified' then 'Verified' else 'Rejected / reopened' end
      || case when v_note <> '' then ': ' || v_note else '' end
  );
end;
$$;

revoke all on function public.review_evidence(uuid, text, text) from public, anon;
revoke all on function public.verify_commitment(uuid, text, text) from public, anon;
grant execute on function public.review_evidence(uuid, text, text) to authenticated;
grant execute on function public.verify_commitment(uuid, text, text) to authenticated;

-- Storage: private bucket; owner writes under "<user_id>/…", visibility follows reporting lines ---
create or replace function private.evidence_object_visible(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_name, '/', 1)::uuid in (select private.visible_user_ids())
    else false
  end;
$$;
revoke all on function private.evidence_object_visible(text) from public, anon;
grant execute on function private.evidence_object_visible(text) to authenticated;

do $storage$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not present; skipping evidence bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'evidence', 'evidence', false, 10485760,
    array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation']
  )
  on conflict (id) do update
    set public = false, file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists evidence_objects_insert on storage.objects;
  create policy evidence_objects_insert on storage.objects for insert to authenticated
    with check (
      bucket_id = 'evidence'
      and split_part(name, '/', 1) = (select auth.uid())::text
    );

  drop policy if exists evidence_objects_select on storage.objects;
  create policy evidence_objects_select on storage.objects for select to authenticated
    using (bucket_id = 'evidence' and (select private.evidence_object_visible(name)));
end
$storage$;
