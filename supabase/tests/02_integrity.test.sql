-- Data integrity and validated submission (audit refs P1, P2, P9, C13).
begin;
\i supabase/tests/helpers.sql
select plan(36);
select tests.seed();

select tests.as_user(5);

-- Baseline validation ------------------------------------------------------------------------------
select throws_ok($$select public.submit_baseline(tests.scores(9))$$, '23514', null, 'score 9 rejected');
select throws_ok($$select public.submit_baseline(tests.scores(0))$$, '23514', null, 'score 0 rejected');
select throws_ok($$select public.submit_baseline(tests.scores(-7))$$, '23514', null, 'score -7 rejected');
select throws_ok($$select public.submit_baseline(tests.scores() - 0)$$, '23514', null, 'missing dimension rejected');
select throws_ok($$select public.submit_baseline(jsonb_set(tests.scores(), '{0,dimensionId}', '"bogus"'))$$, '23514', null, 'unknown dimension rejected');
select throws_ok($$select public.submit_baseline(jsonb_set(tests.scores(), '{1,dimensionId}', to_jsonb(tests.scores() -> 0 ->> 'dimensionId')))$$, '23514', null, 'duplicate dimension rejected');
select throws_ok($$select public.submit_baseline(jsonb_set(tests.scores(), '{0,score}', '3.5'))$$, '23514', null, 'fractional score rejected');
select throws_ok($$select public.submit_baseline(jsonb_set(tests.scores(), '{0,score}', '"5"'))$$, '23514', null, 'string score rejected');
select lives_ok($$select public.submit_baseline(tests.scores(3))$$, 'valid baseline accepted');
select throws_ok($$select public.submit_baseline(tests.scores(4))$$, '23505', null, 'second baseline rejected');
select is((select count(*)::int from public.assessments where assessment_type = 'baseline'), 1, 'exactly one baseline stored');

-- Direct writes are closed ---------------------------------------------------------------------------
select throws_ok($$insert into public.assessments (user_id, organization_id, assessment_type, period_start, period_end, scores)
  values (tests.uid(5), (select id from public.organizations limit 1), 'weekly', private.current_week_start(), private.current_week_start() + 6, tests.scores(99))$$,
  '42501', null, 'cannot insert assessments directly (P1)');
select throws_ok($$update public.assessments set scores = '[]'::jsonb$$, '42501', null, 'cannot rewrite submitted assessments (P2)');
select throws_ok($$update public.assessments set period_start = '2020-01-06'$$, '42501', null, 'cannot backdate assessments (P2)');

-- Weekly position ---------------------------------------------------------------------------------------
select lives_ok($$select public.submit_weekly_position(tests.scores(4), tests.entries())$$, 'valid weekly position accepted');
select is((select count(*)::int from public.assessments where assessment_type = 'weekly'), 1, 'one weekly assessment stored');
select is((select count(*)::int from public.scorecard_entries), 12, 'twelve scorecard entries stored');
select lives_ok($$select public.submit_weekly_position(tests.scores(2), tests.entries())$$, 'resubmission in an open cycle is accepted');
select is((select (scores -> 0 ->> 'score')::int from public.assessments where assessment_type = 'weekly'), 2, 'resubmission replaces, not duplicates');
select throws_ok($$select public.submit_weekly_position(tests.scores(3, ''), tests.entries())$$, '23514', null, 'evidence is required for every dimension');
select throws_ok($$select public.submit_weekly_position(tests.scores(3), tests.entries() #- '{0,metrics,Proactive actions}')$$, '23514', null, 'missing required metric rejected');
select throws_ok($$select public.submit_weekly_position(tests.scores(3), jsonb_set(tests.entries(), '{0,metrics,Proactive actions}', '-1'))$$, '23514', null, 'negative metric rejected');
select throws_ok($$select public.submit_weekly_position(tests.scores(3), jsonb_set(tests.entries(), '{1,metrics,Efficiency gain %}', '150'))$$, '23514', null, 'percentage above 100 rejected');
select throws_ok($$select public.submit_weekly_position(tests.scores(3), jsonb_set(tests.entries(), '{9,metrics,Stakeholder feedback score}', '9'))$$, '23514', null, 'score-type metric above 5 rejected');
select throws_ok($$select public.submit_weekly_position(tests.scores(3), jsonb_set(tests.entries(), '{0,metrics,Proactive actions}', '"abc"'))$$, '23514', null, 'non-numeric metric rejected');
select throws_ok($$select public.submit_weekly_position(tests.scores(3), tests.entries() - 0)$$, '23514', null, 'incomplete scorecard rejected');

-- Cycles ---------------------------------------------------------------------------------------------------
select throws_ok($$insert into public.weekly_cycles (organization_id, week_start, week_end)
  values ((select id from public.organizations limit 1), '1999-01-04', '1990-01-01')$$, '42501', null, 'employee cannot create cycles (P9)');
select is((public.ensure_current_cycle()).week_start, private.current_week_start(), 'current cycle starts on the SAST Monday');
select is(extract(isodow from (public.ensure_current_cycle()).week_start)::int, 1, 'cycle starts on a Monday');
with u as (update public.weekly_cycles set status = 'closed' returning 1)
select is((select count(*)::int from u), 0, 'employee cannot close a cycle');

select tests.as_owner();
update public.weekly_cycles set status = 'closed';
select tests.as_user(5);
select throws_ok($$select public.submit_weekly_position(tests.scores(3), tests.entries())$$, '55000', null, 'closed cycle rejects submissions');

-- Structural constraints (as owner) ----------------------------------------------------------------------------
select tests.as_owner();
select throws_ok($$insert into public.assessments (user_id, organization_id, assessment_type, period_start, period_end, scores)
  values (tests.uid(6), (select id from public.organizations limit 1), 'weekly', private.current_week_start() + 1, private.current_week_start() + 7, tests.scores(3))$$,
  '23514', null, 'weekly period must start on a Monday');
select throws_ok($$update public.organization_members set manager_user_id = tests.uid(5) where user_id = tests.uid(3)$$,
  '23514', null, 'reporting-line cycles are rejected');
select throws_ok($$update public.organization_members set manager_user_id = user_id where user_id = tests.uid(5)$$,
  '23514', null, 'a person cannot manage themselves');
select throws_ok($$delete from auth.users where id = tests.uid(5)$$, '23503', null, 'a user with history cannot be deleted');
select throws_ok($$insert into public.organizations (name, slug) values ('Second', 'second')$$, '23505', null, 'the organisation is a singleton');

select * from finish();
rollback;
