-- Attack scenarios driven through the same grants/RLS a PostgREST client gets.
-- Each assertion is something an authenticated (or anonymous) attacker would actually try.
begin;
\i supabase/tests/helpers.sql
select plan(30);
select tests.seed();

-- Fixtures as owner: e1 has a baseline, weekly, commitment, evidence, review, notification, consent.
insert into public.assessments (id, user_id, organization_id, assessment_type, period_start, period_end, scores)
values ('bbbbbbbb-0000-0000-0000-000000000011', tests.uid(5), (select id from public.organizations limit 1),
        'baseline', private.org_today(), private.org_today(), tests.scores(3));
insert into public.commitments (id, user_id, organization_id, dimension_id, title, action, due_date, baseline_value, target_value)
values ('cccccccc-0000-0000-0000-000000000011', tests.uid(5), (select id from public.organizations limit 1),
        'results-delivery', 'Private plan', 'Do it', private.org_today() + 10, 2, 4);
insert into public.evidence_items (id, organization_id, user_id, commitment_id, kind, title, body)
values ('dddddddd-0000-0000-0000-000000000011', (select id from public.organizations limit 1), tests.uid(5),
        'cccccccc-0000-0000-0000-000000000011', 'note', 'Private evidence', 'confidential');
insert into public.privacy_consents (user_id, purpose, consent_status, lawful_basis, privacy_notice_version)
values (tests.uid(5), 'performance', 'granted', 'consent', 'v1');
select private.notify(tests.uid(5), 'test', 'Private notification', '', null, null, 'k1');

-- 1. Direct writes to protected tables are impossible for every role ------------------------------------------
select tests.as_user(5);
select throws_ok($$update public.organization_members set role = 'admin' where user_id = tests.uid(5)$$, '42501', null, 'employee cannot self-promote via the table');
select throws_ok($$update public.organization_members set manager_user_id = tests.uid(2) where user_id = tests.uid(5)$$, '42501', null, 'employee cannot re-parent themselves');
select throws_ok($$update public.profiles set email = 'ceo@test.invalid' where id = tests.uid(5)$$, '42501', null, 'profile identity cannot be rewritten');
select throws_ok($$insert into public.audit_log (table_name) values ('forged')$$, '42501', null, 'audit log cannot be written directly');
select throws_ok($$insert into public.notifications (organization_id, user_id, kind, title, dedupe_key) values ((select id from public.organizations limit 1), tests.uid(6), 'x', 'forged', 'f')$$, '42501', null, 'notifications cannot be forged');
select throws_ok($$insert into public.assessments (user_id, organization_id, assessment_type, period_start, period_end, scores) values (tests.uid(5), (select id from public.organizations limit 1), 'weekly', private.org_today(), private.org_today(), tests.scores(5))$$, '42501', null, 'assessments cannot be written around the RPC');
select throws_ok($$update public.assessments set scores = tests.scores(5)$$, '42501', null, 'assessments cannot be rewritten');
select throws_ok($$insert into public.weekly_cycles (organization_id, week_start, week_end) values ((select id from public.organizations limit 1), date '2030-01-07', date '2030-01-13')$$, '42501', null, 'cycles cannot be invented');
select throws_ok($$update public.organizations set name = 'pwned'$$, '42501', null, 'organisation cannot be edited');
select throws_ok($$delete from public.commitments$$, '42501', null, 'nothing can be deleted by clients');

-- 2. A peer, and a manager from another line, see none of e1's private data -----------------------------
select tests.as_user(6);
select is((select count(*)::int from public.assessments where user_id = tests.uid(5)), 0, 'peer cannot read assessments');
select is((select count(*)::int from public.commitments where user_id = tests.uid(5)), 0, 'peer cannot read commitments');
select is((select count(*)::int from public.evidence_items), 0, 'peer cannot read evidence');
select is((select count(*)::int from public.notifications where user_id = tests.uid(5)), 0, 'peer cannot read notifications');
select is((select count(*)::int from public.privacy_consents where user_id = tests.uid(5)), 0, 'peer cannot read consents');
select is((select count(*)::int from public.audit_log where subject_user_id is distinct from tests.uid(6)), 0, 'employees see audit entries about themselves only');
select is((select count(*)::int from public.profiles where id = tests.uid(5)), 0, 'peer cannot even see the colleague''s profile');
select is((select count(*)::int from public.report_member_status()), 1, 'reporting shows only the caller');
select tests.as_user(4);
select is((select count(*)::int from public.commitments where user_id = tests.uid(5)), 0, 'manager of another team cannot read commitments');
select is((select count(*)::int from public.evidence_items), 0, 'manager of another team cannot read evidence');
select throws_ok($$select public.verify_commitment('cccccccc-0000-0000-0000-000000000011', 'verified')$$, '42501', null, 'manager of another team cannot verify');
select is((select count(*)::int from public.report_weekly_dimension_scores(date '2000-01-01', date '2100-01-01')), 0, 'aggregated reports respect the reporting line');

-- 3. Consent records belong to their owner only -----------------------------------------------------------------
select tests.as_user(6);
select throws_ok($$insert into public.privacy_consents (user_id, purpose, consent_status, lawful_basis, privacy_notice_version) values (tests.uid(5), 'performance', 'withdrawn', 'consent', 'v1')$$, '42501', null, 'cannot record consent on someone else''s behalf');
update public.privacy_consents set consent_status = 'withdrawn' where user_id = tests.uid(5);
select tests.as_owner();
select is((select consent_status from public.privacy_consents where user_id = tests.uid(5)), 'granted', 'cannot withdraw someone else''s consent');

-- (Storage policies are attacked over the real Storage API in e2e/08-security.spec.ts.)

-- 5. Anonymous and non-member callers -------------------------------------------------------------------------------------
select tests.as_anon();
select throws_ok($$select * from public.commitments$$, '42501', null, 'anonymous users cannot read commitments');
select throws_ok($$select public.ensure_current_cycle()$$, '42501', null, 'anonymous users cannot call RPCs');
select tests.as_user(8);
select is((select count(*)::int from public.commitments), 0, 'a user without membership sees nothing');
select throws_ok($$select public.submit_baseline(tests.scores(3))$$, '42501', null, 'a user without membership cannot submit');
select tests.as_owner();
update public.organization_members set active = false where user_id = tests.uid(6);
select tests.as_user(6);
select is((select count(*)::int from public.assessments), 0, 'a deactivated member sees nothing, including their own history');
select throws_ok($$select public.submit_baseline(tests.scores(3))$$, '42501', null, 'a deactivated member cannot submit');

select * from finish();
rollback;
