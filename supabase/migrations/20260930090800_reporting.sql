-- Server-side reporting for managers and executives.
-- Audit refs: aggregation done in the browser over truncated row sets (500/1000 caps); "latest
-- team score" was one person's score; no per-person, overdue, blocked or outcome views.
-- All functions are SECURITY INVOKER: row level security (reporting-line scope) applies.

grant usage on schema private to authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- Per-week, per-dimension averages (weighted by number of responses) ------------------------------
create or replace function public.report_weekly_dimension_scores(p_from date, p_to date)
returns table (week_start date, dimension_id text, avg_score numeric, responses integer)
language sql
stable
set search_path = ''
as $$
  select a.period_start as week_start,
         e ->> 'dimensionId' as dimension_id,
         round(avg((e ->> 'score')::numeric), 3) as avg_score,
         count(*)::integer as responses
  from public.assessments a
  cross join lateral jsonb_array_elements(a.scores) e
  where a.assessment_type = 'weekly'
    and a.period_start between p_from and p_to
  group by a.period_start, e ->> 'dimensionId'
  order by a.period_start, e ->> 'dimensionId';
$$;

-- Submission compliance ------------------------------------------------------------------------------
create or replace function public.report_submission_rate(p_from date, p_to date)
returns table (week_start date, submitted integer, expected integer)
language sql
stable
set search_path = ''
as $$
  select g.wk::date as week_start,
         (select count(distinct a.user_id) from public.assessments a
           where a.assessment_type = 'weekly' and a.period_start = g.wk::date)::integer as submitted,
         (select count(*) from public.organization_members m
           where m.active and m.created_at::date <= g.wk::date + 6
             and m.user_id in (select private.visible_user_ids()))::integer as expected
  from generate_series(date_trunc('week', p_from::timestamp), p_to::timestamp, interval '7 days') as g (wk)
  order by 1;
$$;

-- One row per visible person: who needs attention ---------------------------------------------------
create or replace function public.report_member_status()
returns table (
  user_id uuid, full_name text, email text, role text, manager_user_id uuid, active boolean,
  latest_week date, latest_score numeric, previous_score numeric,
  submitted_current boolean, missed_last_4 integer,
  open_commitments integer, overdue_commitments integer, blocked_commitments integer,
  pending_verification integer
)
language sql
stable
set search_path = ''
as $$
  with cur as (select private.current_week_start() as wk, private.org_today() as today),
  weekly as (
    select a.user_id, a.period_start,
           (select avg((e ->> 'score')::numeric) from jsonb_array_elements(a.scores) e) as avg_score,
           row_number() over (partition by a.user_id order by a.period_start desc) as rn
    from public.assessments a
    where a.assessment_type = 'weekly'
  ),
  cm as (
    select c.user_id,
           count(*) filter (where c.status <> 'complete') as open_c,
           count(*) filter (where c.status <> 'complete' and c.due_date < (select today from cur)) as overdue_c,
           count(*) filter (where c.status = 'blocked') as blocked_c,
           count(*) filter (where c.verification_status = 'pending') as pending_c
    from public.commitments c
    group by c.user_id
  )
  select m.user_id, p.full_name, p.email, m.role, m.manager_user_id, m.active,
         w1.period_start,
         round(w1.avg_score, 2),
         round(w2.avg_score, 2),
         exists (select 1 from weekly w where w.user_id = m.user_id and w.period_start = (select wk from cur)),
         (select count(*)::integer from generate_series(1, 4) g
           where m.created_at::date <= (select wk from cur) - 7 * g + 6
             and not exists (select 1 from weekly w
                             where w.user_id = m.user_id and w.period_start = (select wk from cur) - 7 * g)),
         coalesce(cm.open_c, 0)::integer,
         coalesce(cm.overdue_c, 0)::integer,
         coalesce(cm.blocked_c, 0)::integer,
         coalesce(cm.pending_c, 0)::integer
  from public.organization_members m
  join public.profiles p on p.id = m.user_id
  left join weekly w1 on w1.user_id = m.user_id and w1.rn = 1
  left join weekly w2 on w2.user_id = m.user_id and w2.rn = 2
  left join cm on cm.user_id = m.user_id
  where m.user_id in (select private.visible_user_ids())
  order by p.full_name, p.email;
$$;

-- Did completed actions improve the targeted dimension? ---------------------------------------------
create or replace function public.report_commitment_outcomes()
returns table (
  commitment_id uuid, user_id uuid, dimension_id text, title text,
  completed_at timestamptz, verification_status text,
  score_before numeric, score_after numeric, after_week date, delta numeric
)
language sql
stable
set search_path = ''
as $$
  select c.id, c.user_id, c.dimension_id, c.title, c.completed_at, c.verification_status,
         bs.score, af.score, af.week_start,
         case when bs.score is not null and af.score is not null then round(af.score - bs.score, 2) end
  from public.commitments c
  left join lateral (
    select coalesce(
      c.source_score::numeric,
      (select (e ->> 'score')::numeric
         from public.assessments a
         cross join lateral jsonb_array_elements(a.scores) e
        where a.user_id = c.user_id
          and a.period_start <= (c.created_at at time zone 'Africa/Johannesburg')::date
          and e ->> 'dimensionId' = c.dimension_id
        order by a.period_start desc
        limit 1)
    ) as score
  ) bs on true
  left join lateral (
    select (e ->> 'score')::numeric as score, a.period_start as week_start
      from public.assessments a
      cross join lateral jsonb_array_elements(a.scores) e
     where a.user_id = c.user_id
       and a.assessment_type = 'weekly'
       and a.period_start > (c.completed_at at time zone 'Africa/Johannesburg')::date
       and e ->> 'dimensionId' = c.dimension_id
     order by a.period_start desc
     limit 1
  ) af on true
  where c.status = 'complete'
  order by c.completed_at desc;
$$;

revoke all on function public.report_weekly_dimension_scores(date, date) from public, anon;
revoke all on function public.report_submission_rate(date, date) from public, anon;
revoke all on function public.report_member_status() from public, anon;
revoke all on function public.report_commitment_outcomes() from public, anon;
grant execute on function public.report_weekly_dimension_scores(date, date) to authenticated;
grant execute on function public.report_submission_rate(date, date) to authenticated;
grant execute on function public.report_member_status() to authenticated;
grant execute on function public.report_commitment_outcomes() to authenticated;
