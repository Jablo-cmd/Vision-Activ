-- Data integrity and validated submission.
-- Audit refs: scores of 99/-7 accepted (P1); submitted assessments rewritable/backdatable (P2);
-- employee-created bogus cycles (P9); unknown dimensions; nullable tenancy columns; no atomic submit.

-- 1. Time helpers (organisation time zone is fixed: South Africa) -----------------------------
create or replace function private.org_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Africa/Johannesburg')::date; $$;

create or replace function private.current_week_start()
returns date
language sql
stable
set search_path = ''
as $$ select date_trunc('week', now() at time zone 'Africa/Johannesburg')::date; $$;

grant execute on function private.org_today() to authenticated;
grant execute on function private.current_week_start() to authenticated;

-- 2. Framework lives in the database: stable slug + required scorecard metrics ---------------
alter table public.framework_dimensions
  add column if not exists slug text,
  add column if not exists scorecard_metrics text[] not null default '{}';

update public.framework_dimensions d
set slug = v.slug, scorecard_metrics = v.metrics
from (values
  (1,  'accountability-ownership',          array['Proactive actions','Reactive actions']),
  (2,  'innovation-improvement',            array['Efficiency gain %']),
  (3,  'results-delivery',                  array['Deadlines met','Deadlines missed']),
  (4,  'planning-prioritisation',           array['Planned execution %','Actual execution %']),
  (5,  'oversight-governance',              array['Variances detected','Corrective actions']),
  (6,  'focus-execution',                   array['Interruptions','Productive hours']),
  (7,  'lessons-continuous-improvement',    array['Lessons applied']),
  (8,  'decision-problem-solving',          array['Issues resolved','Issues escalated']),
  (9,  'collaboration-teamwork',            array['Joint deliverables']),
  (10, 'communication-stakeholders',        array['Stakeholder feedback score']),
  (11, 'client-engagement',                 array['Client satisfaction indicator']),
  (12, 'capability-skills',                 array['Training completed','Training applied'])
) as v(sort_order, slug, metrics)
where d.sort_order = v.sort_order and d.organization_id is null and d.slug is null;

alter table public.framework_dimensions alter column slug set not null;
create unique index if not exists framework_dimensions_slug_uidx on public.framework_dimensions (slug);

-- 3. Referential integrity for dimension references ------------------------------------------
alter table public.commitments
  drop constraint if exists commitments_dimension_fk;
alter table public.commitments
  add constraint commitments_dimension_fk
  foreign key (dimension_id) references public.framework_dimensions (slug);

alter table public.scorecard_entries
  drop constraint if exists scorecard_entries_dimension_fk;
alter table public.scorecard_entries
  add constraint scorecard_entries_dimension_fk
  foreign key (dimension_id) references public.framework_dimensions (slug);

-- 4. Tenancy / ownership columns are mandatory -------------------------------------------------
alter table public.assessments alter column organization_id set not null;
alter table public.commitments alter column organization_id set not null;
alter table public.commitments alter column dimension_id set not null;
alter table public.management_reviews alter column organization_id set not null;
alter table public.management_reviews alter column subject_user_id set not null;

update public.assessments set submitted_at = created_at where submitted_at is null;
alter table public.assessments alter column submitted_at set default now();
alter table public.assessments alter column submitted_at set not null;

-- 5. History must survive people: no cascade-delete of performance records --------------------
alter table public.assessments drop constraint if exists assessments_user_id_fkey;
alter table public.assessments
  add constraint assessments_user_id_fkey foreign key (user_id) references auth.users (id) on delete restrict;
alter table public.commitments drop constraint if exists commitments_user_id_fkey;
alter table public.commitments
  add constraint commitments_user_id_fkey foreign key (user_id) references auth.users (id) on delete restrict;
alter table public.scorecard_entries drop constraint if exists scorecard_entries_user_id_fkey;
alter table public.scorecard_entries
  add constraint scorecard_entries_user_id_fkey foreign key (user_id) references auth.users (id) on delete restrict;
alter table public.management_reviews drop constraint if exists management_reviews_reviewer_id_fkey;
alter table public.management_reviews
  add constraint management_reviews_reviewer_id_fkey foreign key (reviewer_id) references auth.users (id) on delete restrict;
alter table public.management_reviews drop constraint if exists management_reviews_subject_user_id_fkey;
alter table public.management_reviews
  add constraint management_reviews_subject_user_id_fkey foreign key (subject_user_id) references auth.users (id) on delete restrict;

-- 6. Date sanity ---------------------------------------------------------------------------
alter table public.assessments drop constraint if exists assessments_period_valid;
alter table public.assessments
  add constraint assessments_period_valid check (
    period_end >= period_start
    and (
      assessment_type = 'baseline'
      or (extract(isodow from period_start) = 1 and period_end = period_start + 6)
    )
  );

alter table public.weekly_cycles drop constraint if exists weekly_cycles_period_valid;
alter table public.weekly_cycles
  add constraint weekly_cycles_period_valid check (
    extract(isodow from week_start) = 1 and week_end = week_start + 6
  );

-- One baseline per person; baselines are never rewritten.
create unique index if not exists assessments_one_baseline_per_user
  on public.assessments (organization_id, user_id) where assessment_type = 'baseline';

-- 7. Score validation ------------------------------------------------------------------------
create or replace function private.validate_assessment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  e jsonb;
  seen text[] := '{}';
  dim text;
  sc numeric;
  expected int;
begin
  if tg_op = 'UPDATE' and (
       new.user_id <> old.user_id or new.organization_id <> old.organization_id
    or new.assessment_type <> old.assessment_type or new.period_start <> old.period_start
  ) then
    raise exception 'Assessment identity fields are immutable' using errcode = '23514';
  end if;

  if jsonb_typeof(new.scores) <> 'array' then
    raise exception 'scores must be a JSON array' using errcode = '23514';
  end if;

  select count(*) into expected from public.framework_dimensions where organization_id is null and active;
  if jsonb_array_length(new.scores) <> expected then
    raise exception 'Exactly % dimension scores are required', expected using errcode = '23514';
  end if;

  for e in select * from jsonb_array_elements(new.scores) loop
    if jsonb_typeof(e) <> 'object' then
      raise exception 'Each score must be an object' using errcode = '23514';
    end if;
    dim := e ->> 'dimensionId';
    if dim is null or not exists (
      select 1 from public.framework_dimensions f where f.slug = dim and f.active
    ) then
      raise exception 'Unknown dimension %', coalesce(dim, '(missing)') using errcode = '23514';
    end if;
    if dim = any (seen) then
      raise exception 'Duplicate dimension %', dim using errcode = '23514';
    end if;
    seen := seen || dim;
    if jsonb_typeof(e -> 'score') <> 'number' then
      raise exception 'Score for % must be a number', dim using errcode = '23514';
    end if;
    sc := (e ->> 'score')::numeric;
    if sc <> trunc(sc) or sc < 1 or sc > 5 then
      raise exception 'Score for % must be a whole number from 1 to 5', dim using errcode = '23514';
    end if;
    if e ? 'evidence' and jsonb_typeof(e -> 'evidence') <> 'string' then
      raise exception 'Evidence for % must be text', dim using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists assessments_validate on public.assessments;
create trigger assessments_validate
  before insert or update on public.assessments
  for each row execute function private.validate_assessment();

create or replace function private.validate_scorecard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  n numeric;
  required text[];
  m text;
begin
  if jsonb_typeof(new.metrics) <> 'object' then
    raise exception 'metrics must be a JSON object' using errcode = '23514';
  end if;

  select scorecard_metrics into required from public.framework_dimensions where slug = new.dimension_id;
  foreach m in array coalesce(required, '{}') loop
    if not (new.metrics ? m) then
      raise exception 'Missing metric "%" for %', m, new.dimension_id using errcode = '23514';
    end if;
  end loop;

  for k, v in select * from jsonb_each(new.metrics) loop
    if jsonb_typeof(v) <> 'number' then
      raise exception 'Metric "%" must be numeric', k using errcode = '23514';
    end if;
    n := (v #>> '{}')::numeric;
    if n < 0 then
      raise exception 'Metric "%" cannot be negative', k using errcode = '23514';
    end if;
    if position('%' in k) > 0 and n > 100 then
      raise exception 'Metric "%" cannot exceed 100', k using errcode = '23514';
    end if;
    if k ~* '(score|indicator)' and n > 5 then
      raise exception 'Metric "%" must be between 0 and 5', k using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists scorecard_entries_validate on public.scorecard_entries;
create trigger scorecard_entries_validate
  before insert or update on public.scorecard_entries
  for each row execute function private.validate_scorecard();

-- 8. All assessment/scorecard/cycle writes go through validated RPCs --------------------------
drop policy if exists assessments_owner_insert on public.assessments;
drop policy if exists assessments_owner_update on public.assessments;
drop policy if exists scorecards_owner_insert on public.scorecard_entries;
drop policy if exists scorecards_owner_update on public.scorecard_entries;

revoke insert, update on public.assessments from authenticated;
revoke insert, update on public.scorecard_entries from authenticated;
revoke insert, update on public.weekly_cycles from authenticated;
grant update (status) on public.weekly_cycles to authenticated;
revoke insert, update on public.organization_members from authenticated;
revoke insert, update on public.organizations from authenticated;
revoke insert, update on public.profiles from authenticated;
revoke insert, update on public.framework_dimensions from authenticated;
revoke insert, update on public.data_retention_policies from authenticated;

create or replace function public.ensure_current_cycle()
returns public.weekly_cycles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.my_org();
  v_start date := private.current_week_start();
  v_row public.weekly_cycles;
begin
  if v_org is null then
    raise exception 'Your account is not an active member of the organisation' using errcode = '42501';
  end if;
  insert into public.weekly_cycles (organization_id, week_start, week_end)
  values (v_org, v_start, v_start + 6)
  on conflict (organization_id, week_start) do nothing;
  select * into v_row from public.weekly_cycles where organization_id = v_org and week_start = v_start;
  return v_row;
end;
$$;

create or replace function public.submit_baseline(p_scores jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.my_org();
  v_uid uuid := auth.uid();
  v_today date := private.org_today();
  v_id uuid;
begin
  if v_org is null then
    raise exception 'Your account is not an active member of the organisation' using errcode = '42501';
  end if;
  begin
    insert into public.assessments (user_id, organization_id, assessment_type, period_start, period_end, scores)
    values (v_uid, v_org, 'baseline', v_today, v_today, p_scores)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'A baseline assessment has already been submitted for your account' using errcode = '23505';
  end;
  return v_id;
end;
$$;

create or replace function public.submit_weekly_position(p_scores jsonb, p_entries jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.my_org();
  v_uid uuid := auth.uid();
  v_cycle public.weekly_cycles;
  v_id uuid;
  v_expected int;
  v_distinct int;
  e jsonb;
begin
  if v_org is null then
    raise exception 'Your account is not an active member of the organisation' using errcode = '42501';
  end if;
  v_cycle := public.ensure_current_cycle();
  if v_cycle.status <> 'open' then
    raise exception 'This weekly cycle is closed' using errcode = '55000';
  end if;

  if jsonb_typeof(p_scores) <> 'array' or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Scores and scorecard entries must be arrays' using errcode = '23514';
  end if;

  select count(*) into v_expected from public.framework_dimensions where organization_id is null and active;
  select count(distinct x ->> 'dimensionId') into v_distinct from jsonb_array_elements(p_entries) x;
  if jsonb_array_length(p_entries) <> v_expected or v_distinct <> v_expected then
    raise exception 'A scorecard entry is required for each of the % dimensions', v_expected using errcode = '23514';
  end if;

  for e in select * from jsonb_array_elements(p_scores) loop
    if length(btrim(coalesce(e ->> 'evidence', ''))) = 0 then
      raise exception 'Evidence is required for every dimension' using errcode = '23514';
    end if;
  end loop;

  insert into public.assessments (user_id, organization_id, assessment_type, period_start, period_end, scores, submitted_at)
  values (v_uid, v_org, 'weekly', v_cycle.week_start, v_cycle.week_end, p_scores, now())
  on conflict (organization_id, user_id, assessment_type, period_start)
  do update set scores = excluded.scores, submitted_at = now()
  returning id into v_id;

  insert into public.scorecard_entries (organization_id, cycle_id, user_id, dimension_id, metrics, evidence, updated_at)
  select v_org, v_cycle.id, v_uid, x."dimensionId", x.metrics, coalesce(x.evidence, ''), now()
  from jsonb_to_recordset(p_entries) as x ("dimensionId" text, metrics jsonb, evidence text)
  on conflict (cycle_id, user_id, dimension_id)
  do update set metrics = excluded.metrics, evidence = excluded.evidence, updated_at = now();

  return v_id;
end;
$$;

revoke all on function public.ensure_current_cycle() from public, anon;
revoke all on function public.submit_baseline(jsonb) from public, anon;
revoke all on function public.submit_weekly_position(jsonb, jsonb) from public, anon;
grant execute on function public.ensure_current_cycle() to authenticated;
grant execute on function public.submit_baseline(jsonb) to authenticated;
grant execute on function public.submit_weekly_position(jsonb, jsonb) to authenticated;
