-- Read-only integrity checks for a database loaded with seed_demo.sql. Every row must say ok = true.
with demo as (select id, email from auth.users where email like '%@demo.visionactiv.example'),
checks(name, ok, detail) as (
  select 'one organisation', (select count(*) from public.organizations) = 1, (select count(*)::text from public.organizations)
  union all select 'sixteen demonstration people', (select count(*) from demo) = 16, (select count(*)::text from demo)
  union all select 'roles: 1 ceo, 3 managers, 12 employees',
    (select count(*) filter (where role = 'ceo') = 1 and count(*) filter (where role = 'manager') = 3 and count(*) filter (where role = 'employee') = 12
       from public.organization_members m join demo d on d.id = m.user_id), ''
  union all select 'Bob Williams is the only ceo and has no manager',
    (select count(*) = 1 from public.organization_members m join public.profiles p on p.id = m.user_id
      where m.role = 'ceo' and p.full_name = 'Bob Williams' and m.manager_user_id is null), ''
  union all select 'every manager reports to Bob',
    (select count(*) = 3 from public.organization_members m where m.role = 'manager' and m.manager_user_id = (select id from demo where email like 'bob.williams@%')), ''
  union all select 'every employee reports to a manager',
    (select count(*) = 12 from public.organization_members e join public.organization_members b on b.user_id = e.manager_user_id and b.role = 'manager' where e.role = 'employee'), ''
  union all select 'each manager has 4 direct reports',
    (select bool_and(n = 4) from (select manager_user_id, count(*) n from public.organization_members where role = 'employee' group by 1) t), ''
  union all select 'no duplicate people by email', (select count(*) = count(distinct lower(email)) from auth.users), ''
  union all select 'profiles exist for every demo user', (select count(*) = 16 from public.profiles p join demo d on d.id = p.id where length(p.full_name) > 3), ''
  union all select 'no administrator has been deactivated or demoted by the load',
    (select count(*) = 0 from public.organization_members where role = 'admin' and not active), ''
  union all select 'every assessment has 12 valid scores',
    (select bool_and(jsonb_array_length(scores) = 12) from public.assessments), ''
  union all select 'one baseline per demonstration person', (select count(*) = 16 from public.assessments a join demo d on d.id = a.user_id where assessment_type = 'baseline'), ''
  union all select 'weekly scorecards have 12 entries per submitted week',
    (select bool_and(n = 12) from (select cycle_id, user_id, count(*) n from public.scorecard_entries group by 1, 2) t), ''
  union all select 'every weekly assessment has matching scorecard entries',
    (select count(*) = 0 from public.assessments a where assessment_type = 'weekly' and not exists (
       select 1 from public.scorecard_entries s join public.weekly_cycles c on c.id = s.cycle_id
       where s.user_id = a.user_id and c.week_start = a.period_start)), ''
  union all select 'no assessment submitted in the future', (select count(*) = 0 from public.assessments where submitted_at > now()), ''
  union all select 'scores vary across people (latest weekly spread >= 1.5)',
    (select max(v) - min(v) >= 1.5 from (select distinct on (user_id) (select avg((e ->> 'score')::numeric) from jsonb_array_elements(scores) e) v
        from public.assessments where assessment_type = 'weekly' order by user_id, period_start desc) t), ''
  union all select 'commitments use all four statuses',
    (select count(distinct status) = 4 from public.commitments), (select string_agg(distinct status, ',') from public.commitments)
  union all select 'commitments use unverified, pending, verified and rejected',
    (select count(distinct verification_status) = 4 from public.commitments), ''
  union all select 'every verified commitment has accepted evidence and a verifier who manages the owner',
    (select count(*) = 0 from public.commitments c where verification_status = 'verified' and (
       not exists (select 1 from public.evidence_items e where e.commitment_id = c.id and e.review_status = 'accepted')
       or not exists (select 1 from public.organization_members m where m.user_id = c.user_id and (m.manager_user_id = c.verified_by
            or exists (select 1 from public.organization_members m2 where m2.user_id = m.manager_user_id and m2.manager_user_id = c.verified_by))))), ''
  union all select 'no self-verification', (select count(*) = 0 from public.commitments where verified_by = user_id), ''
  union all select 'blocked commitments all carry a blocker', (select count(*) = 0 from public.commitments where status = 'blocked' and btrim(blocker) = ''), ''
  union all select 'measures are consistent (progress within 0..100)', (select count(*) = 0 from public.commitments where progress_percent not between 0 and 100), ''
  union all select 'overdue commitments exist but are a minority',
    (select count(*) between 1 and 6 from public.commitments where status <> 'complete' and due_date < private.org_today()), ''
  union all select 'every update and evidence item belongs to its commitment owner',
    (select count(*) = 0 from public.commitment_updates u join public.commitments c on c.id = u.commitment_id where u.user_id <> c.user_id)
    and (select count(*) = 0 from public.evidence_items e join public.commitments c on c.id = e.commitment_id where e.user_id <> c.user_id), ''
  union all select 'reviews are written by the reviewed person''s manager (or the CEO for managers)',
    (select count(*) = 0 from public.management_reviews r join public.organization_members m on m.user_id = r.subject_user_id
      where m.manager_user_id is distinct from r.reviewer_id), ''
  union all select 'reviews include completed and scheduled', (select count(distinct status) >= 2 from public.management_reviews), ''
  union all select 'review action items are JSON arrays of text', (select count(*) = 0 from public.management_reviews where jsonb_typeof(action_items) <> 'array'), ''
  union all select 'notifications are modest (< 60)', (select count(*) between 5 and 59 from public.notifications), (select count(*)::text from public.notifications)
  union all select 'no duplicate notification keys', (select count(*) = count(distinct (user_id, dedupe_key)) from public.notifications), ''
  union all select 'audit log is intact (never rewritten)', (select count(*) > 0 from public.audit_log), ''
)
select name, coalesce(ok, false) as ok, detail from checks order by coalesce(ok, false), name;
