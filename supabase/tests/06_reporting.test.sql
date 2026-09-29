-- Server-side reporting is correct and respects reporting lines (audit refs C1, C9, C10).
begin;
\i supabase/tests/helpers.sql
select plan(22);
select tests.seed();

update public.organization_members set created_at = now() - interval '90 days';

-- Weekly data (written as owner): weeks W-2 and W-1 for e1; W-1 for e2, e3; W-1 for mgr.
create temp table wk on commit drop as select private.current_week_start() as cur;
grant select on wk to authenticated;
insert into public.assessments (user_id, organization_id, assessment_type, period_start, period_end, scores)
select tests.uid(u), (select id from public.organizations limit 1), 'weekly', (select cur from wk) - w, (select cur from wk) - w + 6, tests.scores(s)
from (values (5, 14, 2), (5, 7, 3), (6, 7, 4), (7, 7, 5), (3, 7, 1)) v(u, w, s);

-- Dimension averages are weighted by responses and scoped by reporting line ----------------------------------
select tests.as_user(5);
select results_eq($$select avg_score, responses from public.report_weekly_dimension_scores((select cur from wk) - 7, (select cur from wk) - 7) where dimension_id = 'results-delivery'$$,
  $$values (3.000::numeric, 1)$$, 'employee report contains only their own scores');
select tests.as_user(3);
select results_eq($$select avg_score, responses from public.report_weekly_dimension_scores((select cur from wk) - 7, (select cur from wk) - 7) where dimension_id = 'results-delivery'$$,
  $$values (2.667::numeric, 3)$$, 'manager report averages self + reports (1,3,4) / 3');
select tests.as_user(2);
select results_eq($$select avg_score, responses from public.report_weekly_dimension_scores((select cur from wk) - 7, (select cur from wk) - 7) where dimension_id = 'results-delivery'$$,
  $$values (3.250::numeric, 4)$$, 'CEO report averages everyone (1,3,4,5) / 4');
select is((select count(distinct dimension_id)::int from public.report_weekly_dimension_scores((select cur from wk) - 14, (select cur from wk))), 12, 'all twelve dimensions are reported');
select is((select count(*)::int from public.report_weekly_dimension_scores((select cur from wk) - 3, (select cur from wk))), 0, 'no data yields no rows, not zeros');
select is((select count(distinct week_start)::int from public.report_weekly_dimension_scores((select cur from wk) - 14, (select cur from wk) - 7)), 2, 'date boundaries are inclusive on both ends');

-- Submission rate ---------------------------------------------------------------------------------------------------
select tests.as_user(3);
select results_eq($$select submitted, expected from public.report_submission_rate((select cur from wk) - 7, (select cur from wk) - 7)$$,
  $$values (3, 3)$$, 'manager submission rate counts only their own line (3 of 3)');
select tests.as_user(2);
select results_eq($$select submitted, expected from public.report_submission_rate((select cur from wk) - 7, (select cur from wk) - 7)$$,
  $$values (4, 7)$$, 'CEO submission rate: 4 of 7 people submitted');
select results_eq($$select submitted, expected from public.report_submission_rate((select cur from wk) - 14, (select cur from wk) - 14)$$,
  $$values (1, 7)$$, 'earlier week: 1 of 7');

-- Member status ---------------------------------------------------------------------------------------------------------
select tests.as_user(3);
select is((select count(*)::int from public.report_member_status()), 3, 'manager sees self + two reports (not their own manager)');
select results_eq($$select latest_score, previous_score, submitted_current from public.report_member_status() where user_id = tests.uid(5)$$,
  $$values (3.00::numeric, 2.00::numeric, false)$$, 'latest and previous scores are per person, with current-week flag');
select is((select missed_last_4 from public.report_member_status() where user_id = tests.uid(6)), 3, 'e2 submitted 1 of the last 4 weeks -> 3 missed');
select is((select missed_last_4 from public.report_member_status() where user_id = tests.uid(5)), 2, 'e1 submitted 2 of the last 4 weeks -> 2 missed');
select tests.as_user(5);
select is((select count(*)::int from public.report_member_status()), 1, 'employee sees only themselves');

-- Outcomes: did the completed action improve the dimension? -------------------------------------------------------------------
select tests.as_owner();
insert into public.commitments (id, user_id, organization_id, dimension_id, title, action, source_score)
  values ('cccccccc-0000-0000-0000-000000000020', tests.uid(5), (select id from public.organizations limit 1), 'results-delivery', 'Improve delivery', 'a', 2);
update public.commitments set status = 'complete' where id = 'cccccccc-0000-0000-0000-000000000020';
insert into public.assessments (user_id, organization_id, assessment_type, period_start, period_end, scores)
  values (tests.uid(5), (select id from public.organizations limit 1), 'weekly', (select cur from wk) + 7, (select cur from wk) + 13, tests.scores(4));
select tests.as_user(3);
select results_eq($$select score_before, score_after, delta from public.report_commitment_outcomes() where commitment_id = 'cccccccc-0000-0000-0000-000000000020'$$,
  $$values (2::numeric, 4::numeric, 2.00::numeric)$$, 'outcome compares source score with the next weekly score after completion');
select tests.as_owner();
insert into public.commitments (id, user_id, organization_id, dimension_id, title, action)
  values ('cccccccc-0000-0000-0000-000000000021', tests.uid(6), (select id from public.organizations limit 1), 'results-delivery', 'No follow-up yet', 'a');
update public.commitments set status = 'complete' where id = 'cccccccc-0000-0000-0000-000000000021';
select tests.as_user(3);
select results_eq($$select score_after is null, delta is null from public.report_commitment_outcomes() where commitment_id = 'cccccccc-0000-0000-0000-000000000021'$$,
  $$values (true, true)$$, 'no later assessment means no claimed improvement');
select tests.as_user(4);
select is((select count(*)::int from public.report_commitment_outcomes()), 0, 'another manager sees no outcomes from this team');

-- Members who are not part of performance tracking (e.g. administrators) are neither counted nor flagged -----------
select tests.as_owner();
update public.organization_members set performance_tracked = false where user_id = tests.uid(1);
select tests.as_user(2);
select results_eq($$select submitted, expected from public.report_submission_rate((select cur from wk) - 7, (select cur from wk) - 7)$$,
  $$values (4, 6)$$, 'untracked members are excluded from the expected submissions (4 of 6)');
select is((select tracked from public.report_member_status() where user_id = tests.uid(1)), false, 'member status exposes the tracked flag');
select is((select missed_last_4 from public.report_member_status() where user_id = tests.uid(1)), 0, 'an untracked member is never counted as missing submissions');
select tests.as_user(1);
select lives_ok($$select public.admin_update_member(tests.uid(6), null, null, false, null, false)$$, 'an administrator can exclude someone from tracking');
select tests.as_owner();
select is((select performance_tracked from public.organization_members where user_id = tests.uid(6)), false, 'the change is stored');

select * from finish();
rollback;
