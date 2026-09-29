-- Notifications and scheduled automation (in-app; delivery channel can be added later).
-- Audit refs: no overdue/due-soon reminders, no manager notifications, no escalation, no
-- assessment or review reminders.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  entity_type text,
  entity_id uuid,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe_key)
);

create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
create index notifications_org_idx on public.notifications (organization_id);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notifications_read on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function private.notify(
  p_user uuid, p_kind text, p_title text, p_body text,
  p_entity_type text, p_entity uuid, p_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.organization_members where user_id = p_user and active;
  if v_org is null then
    return;
  end if;
  insert into public.notifications (organization_id, user_id, kind, title, body, entity_type, entity_id, dedupe_key)
  values (v_org, p_user, p_kind, p_title, coalesce(p_body, ''), p_entity_type, p_entity, p_key)
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

-- Who is told when something needs management attention: the direct manager, or CEO/admin if none.
create or replace function private.escalation_targets(p_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with mgr as (
    select m.manager_user_id as id
    from public.organization_members m
    join public.organization_members boss on boss.user_id = m.manager_user_id and boss.active
    where m.user_id = p_user and m.manager_user_id is not null
  )
  select id from mgr
  union
  select m.user_id from public.organization_members m
  where m.active and m.role in ('ceo', 'admin') and m.user_id <> p_user
    and not exists (select 1 from mgr);
$$;

revoke all on function private.notify(uuid, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function private.escalation_targets(uuid) from public, anon, authenticated;

-- Event-driven notifications ---------------------------------------------------------------------
create or replace function private.commitments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_owner text;
begin
  select coalesce(nullif(full_name, ''), email) into v_owner from public.profiles where id = new.user_id;

  if new.status = 'blocked' and (tg_op = 'INSERT' or old.status is distinct from 'blocked') then
    for v_target in select private.escalation_targets(new.user_id) loop
      perform private.notify(v_target, 'blocked', 'Blocked: ' || new.title,
        coalesce(v_owner, 'A team member') || ' reports a blocker: ' || new.blocker,
        'commitment', new.id, 'blocked:' || new.id || ':' || extract(epoch from new.blocked_at)::bigint);
    end loop;
  end if;

  if new.verification_status = 'pending' and (tg_op = 'INSERT' or old.verification_status is distinct from 'pending') then
    for v_target in select private.escalation_targets(new.user_id) loop
      perform private.notify(v_target, 'verification_requested', 'Verification needed: ' || new.title,
        coalesce(v_owner, 'A team member') || ' marked this complete.',
        'commitment', new.id, 'verify:' || new.id || ':' || extract(epoch from new.completed_at)::bigint);
    end loop;
  end if;

  if new.verification_status in ('verified', 'rejected')
     and (tg_op = 'INSERT' or old.verification_status is distinct from new.verification_status) then
    perform private.notify(new.user_id, 'verification_result',
      case new.verification_status when 'verified' then 'Verified: ' else 'Reopened: ' end || new.title,
      new.verification_note, 'commitment', new.id,
      'result:' || new.id || ':' || extract(epoch from new.verified_at)::bigint);
  end if;
  return new;
end;
$$;
revoke all on function private.commitments_notify() from public, anon, authenticated;

create trigger commitments_notify
  after insert or update of status, verification_status on public.commitments
  for each row execute function private.commitments_notify();

-- Scheduled notifications (run daily) --------------------------------------------------------------
create or replace function private.generate_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.org_today();
  v_week date := private.current_week_start();
  v_dow int := extract(isodow from private.org_today());
  r record;
  v_target uuid;
  v_before bigint;
  v_after bigint;
begin
  select count(*) into v_before from public.notifications;

  -- Due within 3 days
  for r in
    select c.id, c.user_id, c.title, c.due_date from public.commitments c
    join public.organization_members m on m.user_id = c.user_id and m.active
    where c.status <> 'complete' and c.due_date between v_today and v_today + 3
  loop
    perform private.notify(r.user_id, 'due_soon', 'Due soon: ' || r.title, 'Due ' || r.due_date,
      'commitment', r.id, 'due_soon:' || r.id || ':' || r.due_date);
  end loop;

  -- Overdue (owner + management), once per week
  for r in
    select c.id, c.user_id, c.title, c.due_date from public.commitments c
    join public.organization_members m on m.user_id = c.user_id and m.active
    where c.status <> 'complete' and c.due_date < v_today
  loop
    perform private.notify(r.user_id, 'overdue', 'Overdue: ' || r.title, 'Was due ' || r.due_date,
      'commitment', r.id, 'overdue:' || r.id || ':' || v_week);
    for v_target in select private.escalation_targets(r.user_id) loop
      perform private.notify(v_target, 'overdue_team', 'Overdue: ' || r.title, 'Was due ' || r.due_date,
        'commitment', r.id, 'overdue_team:' || r.id || ':' || v_week);
    end loop;
  end loop;

  -- Verification waiting more than 3 days
  for r in
    select c.id, c.user_id, c.title from public.commitments c
    where c.verification_status = 'pending' and c.completed_at < now() - interval '3 days'
  loop
    for v_target in select private.escalation_targets(r.user_id) loop
      perform private.notify(v_target, 'verification_stale', 'Still awaiting verification: ' || r.title, '',
        'commitment', r.id, 'verify_stale:' || r.id || ':' || v_week);
    end loop;
  end loop;

  -- Weekly assessment reminder from Thursday
  if v_dow >= 4 then
    for r in
      select m.user_id from public.organization_members m
      where m.active and not exists (
        select 1 from public.assessments a
        where a.user_id = m.user_id and a.assessment_type = 'weekly' and a.period_start = v_week
      )
    loop
      perform private.notify(r.user_id, 'assessment_reminder', 'Submit your weekly position',
        'Your weekly scorecard for the week of ' || v_week || ' has not been submitted.',
        'cycle', null, 'assess:' || r.user_id || ':' || v_week);
    end loop;
  end if;

  -- Manager summary of missing submissions from Friday
  if v_dow >= 5 then
    for r in
      select m.manager_user_id as mgr, count(*) as missing
      from public.organization_members m
      where m.active and m.manager_user_id is not null and not exists (
        select 1 from public.assessments a
        where a.user_id = m.user_id and a.assessment_type = 'weekly' and a.period_start = v_week
      )
      group by m.manager_user_id
    loop
      perform private.notify(r.mgr, 'team_missing', r.missing || ' team member(s) have not submitted this week', '',
        'cycle', null, 'team_missing:' || r.mgr || ':' || v_week);
    end loop;
  end if;

  -- Review follow-ups
  for r in
    select rv.id, rv.reviewer_id, rv.follow_up_date from public.management_reviews rv
    where rv.status = 'completed' and rv.follow_up_date between v_today - 14 and v_today
  loop
    perform private.notify(r.reviewer_id, 'review_followup', 'Review follow-up due', 'Follow-up date ' || r.follow_up_date,
      'management_review', r.id, 'review_followup:' || r.id || ':' || r.follow_up_date);
  end loop;

  select count(*) into v_after from public.notifications;
  return (v_after - v_before)::integer;
end;
$$;
revoke all on function private.generate_notifications() from public, anon, authenticated;

do $cron$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron not available; schedule private.generate_notifications() externally';
    return;
  end if;
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'vision-activ-notifications';
  perform cron.schedule('vision-activ-notifications', '0 5 * * *', 'select private.generate_notifications()');
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end
$cron$;
