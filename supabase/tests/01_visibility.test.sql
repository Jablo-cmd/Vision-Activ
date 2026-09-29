-- Reporting-line visibility: who can read whose data (audit refs P6, P7, P10, P13, P14, P16, P19).
begin;
\i supabase/tests/helpers.sql
select plan(28);

select tests.seed();
-- One weekly assessment per person (written as owner; RPC paths are covered elsewhere).
insert into public.assessments (user_id, organization_id, assessment_type, period_start, period_end, scores)
select tests.uid(n), (select id from public.organizations limit 1), 'weekly',
       private.current_week_start(), private.current_week_start() + 6, tests.scores(((n - 1) % 5) + 1)
from generate_series(1, 7) n;
insert into public.commitments (user_id, organization_id, dimension_id, title, action)
select tests.uid(n), (select id from public.organizations limit 1), 'accountability-ownership', 'c' || n, 'a'
from generate_series(1, 7) n;

-- Employee sees only themselves ------------------------------------------------------------------
select tests.as_user(5);
select is((select count(*)::int from public.assessments), 1, 'employee sees only their own assessment');
select is((select count(*)::int from public.commitments), 1, 'employee sees only their own commitment');
select is((select count(*)::int from public.commitments where user_id = tests.uid(6)), 0, 'employee cannot read a peer commitment (IDOR)');
select is((select count(*)::int from public.profiles), 2, 'employee directory = self + own manager');
select is((select count(*)::int from public.organization_members), 2, 'employee sees own membership + manager membership only');

-- Manager sees self + reports, not peers' reports or executives ---------------------------------
select tests.as_user(3);
select is((select array_agg(user_id order by user_id) from public.assessments),
          array[tests.uid(3), tests.uid(5), tests.uid(6)], 'manager sees self and direct reports only');
select is((select count(*)::int from public.assessments where user_id = tests.uid(2)), 0, 'manager cannot read CEO assessments');
select is((select count(*)::int from public.assessments where user_id = tests.uid(7)), 0, 'manager cannot read another manager''s reports');
select is((select count(*)::int from public.commitments where user_id = tests.uid(7)), 0, 'manager cannot read another team''s commitments');

select tests.as_user(4);
select is((select array_agg(user_id order by user_id) from public.assessments),
          array[tests.uid(4), tests.uid(7)], 'second manager sees only their own team');

-- CEO and admin see everyone ----------------------------------------------------------------------
select tests.as_user(2);
select is((select count(*)::int from public.assessments), 7, 'CEO sees all assessments');
select is((select count(*)::int from public.profiles), 7, 'CEO sees all member profiles');
select tests.as_user(1);
select is((select count(*)::int from public.commitments), 7, 'admin sees all commitments');

-- Outsider (authenticated, no membership) sees nothing -------------------------------------------
select tests.as_user(8);
select is((select count(*)::int from public.assessments), 0, 'non-member sees no assessments');
select is((select count(*)::int from public.commitments), 0, 'non-member sees no commitments');
select is((select count(*)::int from public.organization_members), 0, 'non-member sees no memberships');
select is((select count(*)::int from public.organizations), 0, 'non-member does not see the organisation');
select is((select count(*)::int from public.framework_dimensions), 12, 'framework dimensions are readable by any authenticated user');

-- anon sees nothing and cannot even select ---------------------------------------------------------
select tests.as_anon();
select throws_ok($$select count(*) from public.assessments$$, '42501', null, 'anon has no privilege on assessments');
select throws_ok($$select count(*) from public.profiles$$, '42501', null, 'anon has no privilege on profiles');

-- Cross-user writes are impossible -----------------------------------------------------------------
select tests.as_user(5);
with u as (update public.commitments set title = 'hacked' where user_id = tests.uid(6) returning 1)
select is((select count(*)::int from u), 0, 'employee cannot update a peer commitment');
select throws_ok($$insert into public.commitments (user_id, organization_id, dimension_id, title, action)
  values (tests.uid(6), (select id from public.organizations limit 1), 'accountability-ownership', 'x', 'x')$$,
  '42501', null, 'employee cannot create a commitment for someone else');

-- Managers cannot write to commitments directly (no policy) -----------------------------------------
select tests.as_user(3);
with u as (update public.commitments set priority = 'critical' where user_id = tests.uid(5) returning 1)
select is((select count(*)::int from u), 0, 'manager cannot edit a report''s commitment directly');

-- Membership cannot be self-promoted -----------------------------------------------------------------
select tests.as_user(5);
select throws_ok($$update public.organization_members set role = 'admin' where user_id = tests.uid(5)$$,
  '42501', null, 'employee cannot self-promote (no UPDATE privilege)');
select throws_ok($$insert into public.organization_members (organization_id, user_id, role)
  values ((select id from public.organizations limit 1), tests.uid(8), 'admin')$$,
  '42501', null, 'employee cannot add memberships');

-- Deleting anything is impossible ---------------------------------------------------------------------
select throws_ok($$delete from public.commitments$$, '42501', null, 'authenticated cannot delete commitments');
select throws_ok($$delete from public.assessments$$, '42501', null, 'authenticated cannot delete assessments');

-- Deactivated caller loses all access --------------------------------------------------------------------
select tests.as_owner();
update public.organization_members set active = false where user_id = tests.uid(5);
select tests.as_user(5);
select is((select count(*)::int from public.assessments), 0, 'deactivated member sees nothing');

select * from finish();
rollback;
