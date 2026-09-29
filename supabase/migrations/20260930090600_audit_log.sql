-- Trigger-based, append-only audit trail.
-- Audit refs: any member could insert arbitrary audit events (P8); events carried no before/after
-- values; most changes were never logged (Track logged nothing).
-- audit_events was empty in production and is replaced (its writers were client-side and forgeable).

drop table if exists public.audit_events;

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  organization_id uuid,
  subject_user_id uuid,
  table_name text not null,
  row_id uuid,
  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  old_row jsonb,
  new_row jsonb,
  changed_columns text[]
);

create index audit_log_org_at_idx on public.audit_log (organization_id, at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_id, at desc);
create index audit_log_subject_idx on public.audit_log (subject_user_id, at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, at desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create policy audit_log_read on public.audit_log for select to authenticated
  using (
    (select private.is_leadership())
    or subject_user_id in (select private.visible_user_ids())
  );

-- Append-only, even for privileged sessions.
create or replace function private.audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end;
$$;

create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function private.audit_log_immutable();
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function private.audit_log_immutable();

create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_cols text[];
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_row := v_new;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_row := v_new;
    select array_agg(n.key order by n.key) into v_cols
    from jsonb_each(v_new) n
    where n.key <> 'updated_at' and (v_old -> n.key) is distinct from n.value;
    if v_cols is null then
      return new;
    end if;
  else
    v_old := to_jsonb(old);
    v_row := v_old;
  end if;

  insert into public.audit_log
    (actor_id, organization_id, subject_user_id, table_name, row_id, op, old_row, new_row, changed_columns)
  values (
    auth.uid(),
    nullif(v_row ->> 'organization_id', '')::uuid,
    coalesce(nullif(v_row ->> 'user_id', ''), nullif(v_row ->> 'subject_user_id', ''))::uuid,
    tg_table_name,
    nullif(v_row ->> 'id', '')::uuid,
    tg_op,
    v_old,
    v_new,
    v_cols
  );
  return coalesce(new, old);
end;
$$;

revoke all on function private.audit_log_immutable() from public, anon, authenticated;
revoke all on function private.audit_row() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'assessments', 'scorecard_entries', 'commitments', 'commitment_updates',
    'management_reviews', 'organization_members', 'weekly_cycles', 'evidence_items'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()',
      t || '_audit', t
    );
  end loop;
end
$$;
