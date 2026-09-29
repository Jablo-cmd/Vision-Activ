-- Commitment state machine, verification, evidence, act log (audit refs P3, P4, P5, P15).
begin;
\i supabase/tests/helpers.sql
select plan(56);
select tests.seed();

-- Fixtures written as owner: an assessment for e2 (to test foreign source assessments).
insert into public.assessments (id, user_id, organization_id, assessment_type, period_start, period_end, scores)
values ('bbbbbbbb-0000-0000-0000-000000000002', tests.uid(6), (select id from public.organizations limit 1),
        'baseline', private.org_today(), private.org_today(), tests.scores(3));

select tests.as_user(5);

-- Creation rules ---------------------------------------------------------------------------------------
select lives_ok($$insert into public.commitments (id, user_id, organization_id, dimension_id, title, action, due_date, baseline_value, target_value)
  values ('cccccccc-0000-0000-0000-000000000001', tests.uid(5), (select id from public.organizations limit 1),
          'results-delivery', 'Hit deadlines', 'Plan weekly', private.org_today() + 10, 2, 4)$$, 'employee can create own commitment');
select results_eq($$select status, progress_percent::int, verification_status from public.commitments$$,
  $$values ('not_started'::text, 0, 'unverified'::text)$$, 'new commitment starts not_started / 0 / unverified');
select throws_ok($$insert into public.commitments (user_id, organization_id, dimension_id, title, action, status)
  values (tests.uid(5), (select id from public.organizations limit 1), 'results-delivery', 'x', 'x', 'complete')$$, '42501', null, 'cannot create a pre-completed commitment');
select throws_ok($$insert into public.commitments (user_id, organization_id, dimension_id, title, action, progress_percent)
  values (tests.uid(5), (select id from public.organizations limit 1), 'results-delivery', 'x', 'x', 100)$$, '42501', null, 'cannot create a commitment at 100%');
select throws_ok($$insert into public.commitments (user_id, organization_id, dimension_id, title, action, verification_status, verified_by, verified_at)
  values (tests.uid(5), (select id from public.organizations limit 1), 'results-delivery', 'x', 'x', 'verified', tests.uid(3), now())$$, '42501', null, 'cannot forge verification on insert');
select throws_ok($$insert into public.commitments (user_id, organization_id, dimension_id, title, action)
  values (tests.uid(5), (select id from public.organizations limit 1), 'no-such-dimension', 'x', 'x')$$, '23503', null, 'unknown dimension rejected');
select throws_ok($$insert into public.commitments (user_id, organization_id, dimension_id, title, action, due_date)
  values (tests.uid(5), (select id from public.organizations limit 1), 'results-delivery', 'x', 'x', '1900-01-01')$$, '23514', null, 'past due date rejected');
select throws_ok($$insert into public.commitments (user_id, organization_id, dimension_id, title, action, owner_user_id)
  values (tests.uid(5), (select id from public.organizations limit 1), 'results-delivery', 'x', 'x', tests.uid(3))$$, '42501', null, 'cannot assign ownership to someone else');
select throws_ok($$insert into public.commitments (user_id, organization_id, dimension_id, title, action, source_assessment_id)
  values (tests.uid(5), (select id from public.organizations limit 1), 'results-delivery', 'x', 'x', 'bbbbbbbb-0000-0000-0000-000000000002')$$, '23514', null, 'source assessment must be your own');
select throws_ok($$insert into public.commitments (user_id, organization_id, dimension_id, title, action, baseline_value, target_value)
  values (tests.uid(5), (select id from public.organizations limit 1), 'results-delivery', 'x', 'x', 3, 3)$$, '23514', null, 'target must differ from baseline');

-- Progress drives status -----------------------------------------------------------------------------------
update public.commitments set progress_percent = 40;
select is((select status from public.commitments), 'in_progress', 'progress > 0 moves not_started to in_progress');
update public.commitments set progress_percent = 100;
select results_eq($$select status, progress_percent::int, verification_status, completed_at is not null from public.commitments$$,
  $$values ('complete'::text, 100, 'pending'::text, true)$$, 'progress 100 completes and awaits verification (P4)');
update public.commitments set progress_percent = 60;
select results_eq($$select status, completed_at is null, verification_status from public.commitments$$,
  $$values ('in_progress'::text, true, 'unverified'::text)$$, 'lowering progress reopens cleanly (P5)');
update public.commitments set status = 'complete';
select is((select verification_status from public.commitments), 'pending', 'status complete awaits verification');

-- Protected fields ---------------------------------------------------------------------------------------------
select throws_ok($$update public.commitments set verification_status = 'verified'$$, '42501', null, 'owner cannot self-verify (P4)');
select throws_ok($$update public.commitments set verified_by = tests.uid(3)$$, '42501', null, 'owner cannot set verifier');
select throws_ok($$update public.commitments set user_id = tests.uid(6)$$, '42501', null, 'owner cannot reassign the commitment');
select throws_ok($$update public.commitments set completed_at = now() - interval '30 days'$$, '42501', null, 'owner cannot backdate completion');
select throws_ok($$update public.commitments set verification_note = 'approved by CEO'$$, '42501', null, 'owner cannot forge verification notes (P3)');

-- Verification --------------------------------------------------------------------------------------------------------
select throws_ok($$select public.verify_commitment('cccccccc-0000-0000-0000-000000000001', 'verified')$$, '42501', null, 'owner cannot verify their own commitment');
select tests.as_user(4);
select throws_ok($$select public.verify_commitment('cccccccc-0000-0000-0000-000000000001', 'verified')$$, '42501', null, 'another team''s manager cannot verify');
select tests.as_user(3);
select throws_ok($$select public.verify_commitment('cccccccc-0000-0000-0000-000000000001', 'verified')$$, '55000', null, 'verification requires accepted evidence');

select tests.as_user(5);
select lives_ok($$insert into public.evidence_items (id, organization_id, user_id, commitment_id, kind, title, body)
  values ('dddddddd-0000-0000-0000-000000000001', (select id from public.organizations limit 1), tests.uid(5),
          'cccccccc-0000-0000-0000-000000000001', 'note', 'Deadline report', 'All 12 deadlines met in October')$$, 'owner can add evidence');
select throws_ok($$insert into public.evidence_items (organization_id, user_id, commitment_id, kind, title, body, review_status, reviewed_by, reviewed_at)
  values ((select id from public.organizations limit 1), tests.uid(5), 'cccccccc-0000-0000-0000-000000000001', 'note', 'x', 'x', 'accepted', tests.uid(3), now())$$, '42501', null, 'owner cannot pre-accept evidence');
select throws_ok($$select public.review_evidence('dddddddd-0000-0000-0000-000000000001', 'accepted')$$, '42501', null, 'owner cannot review own evidence');
select throws_ok($$update public.evidence_items set review_status = 'accepted'$$, '42501', null, 'evidence is immutable for the owner');
select tests.as_user(6);
select throws_ok($$insert into public.evidence_items (organization_id, user_id, commitment_id, kind, title, body)
  values ((select id from public.organizations limit 1), tests.uid(6), 'cccccccc-0000-0000-0000-000000000001', 'note', 'x', 'x')$$, '42501', null, 'cannot attach evidence to a peer''s commitment');
select is((select count(*)::int from public.evidence_items), 0, 'peers cannot read evidence');

select tests.as_user(3);
select is((select count(*)::int from public.evidence_items), 1, 'manager can read a report''s evidence');
select throws_ok($$select public.review_evidence('dddddddd-0000-0000-0000-000000000001', 'rejected', '')$$, '22023', null, 'rejecting evidence needs a reason');
select lives_ok($$select public.review_evidence('dddddddd-0000-0000-0000-000000000001', 'accepted', 'Looks right')$$, 'manager accepts evidence');
select lives_ok($$select public.verify_commitment('cccccccc-0000-0000-0000-000000000001', 'verified', 'Confirmed with delivery log')$$, 'manager verifies with accepted evidence');
select results_eq($$select verification_status, verified_by = tests.uid(3) from public.commitments$$,
  $$values ('verified'::text, true)$$, 'verification records who verified');

select tests.as_user(5);
select throws_ok($$update public.commitments set title = 'edited after verification'$$, '42501', null, 'verified commitments are locked for the owner');

-- Rejection / reopening --------------------------------------------------------------------------------------------------
select tests.as_user(3);
select throws_ok($$select public.verify_commitment('cccccccc-0000-0000-0000-000000000001', 'rejected', '')$$, '22023', null, 'reopening needs a reason');
select lives_ok($$select public.verify_commitment('cccccccc-0000-0000-0000-000000000001', 'rejected', 'Evidence covers 3 of 12 weeks')$$, 'manager can reopen a verified commitment');
select results_eq($$select status, verification_status, completed_at is null from public.commitments$$,
  $$values ('in_progress'::text, 'rejected'::text, true)$$, 'reopened commitment is in progress and marked rejected');
select tests.as_user(5);
update public.commitments set status = 'complete';
select results_eq($$select verification_status, verified_by is null from public.commitments$$,
  $$values ('pending'::text, true)$$, 're-completion awaits fresh verification');

-- Blockers -------------------------------------------------------------------------------------------------------------------
select lives_ok($$insert into public.commitments (id, user_id, organization_id, dimension_id, title, action)
  values ('cccccccc-0000-0000-0000-000000000002', tests.uid(5), (select id from public.organizations limit 1), 'planning-prioritisation', 'Second', 'Do it')$$, 'second commitment created');
select throws_ok($$update public.commitments set status = 'blocked' where id = 'cccccccc-0000-0000-0000-000000000002'$$, '23514', null, 'blocked requires a blocker description');
select lives_ok($$update public.commitments set status = 'blocked', blocker = 'Waiting for finance sign-off' where id = 'cccccccc-0000-0000-0000-000000000002'$$, 'blocking with a reason works');
select is((select blocked_at is not null from public.commitments where id = 'cccccccc-0000-0000-0000-000000000002'), true, 'blocked_at is recorded');
select tests.as_owner();
select is((select count(*)::int from public.notifications where user_id = tests.uid(3) and kind = 'blocked'), 1, 'the manager is notified of the blocker');

-- Act log ------------------------------------------------------------------------------------------------------------------------
select tests.as_user(5);
select lives_ok($$insert into public.commitment_updates (commitment_id, author_id, kind, body)
  values ('cccccccc-0000-0000-0000-000000000002', tests.uid(5), 'note', 'Chased finance')$$, 'owner can post a progress note');
select throws_ok($$insert into public.commitment_updates (commitment_id, author_id, kind, body)
  values ('cccccccc-0000-0000-0000-000000000002', tests.uid(5), 'manager_note', 'I approve')$$, '42501', null, 'owner cannot post as manager');
select throws_ok($$insert into public.commitment_updates (commitment_id, author_id, kind, body)
  values ('cccccccc-0000-0000-0000-000000000002', tests.uid(5), 'verification', 'Verified by CEO')$$, '42501', null, 'owner cannot forge a system verification entry');
select tests.as_user(3);
select lives_ok($$insert into public.commitment_updates (commitment_id, author_id, kind, body)
  values ('cccccccc-0000-0000-0000-000000000002', tests.uid(3), 'manager_note', 'Escalating to CFO')$$, 'manager can comment on a report''s commitment');
select throws_ok($$insert into public.commitment_updates (commitment_id, author_id, kind, body)
  values ('cccccccc-0000-0000-0000-000000000002', tests.uid(3), 'note', 'pretending to be the owner')$$, '42501', null, 'manager cannot post as owner');
select tests.as_user(4);
select throws_ok($$insert into public.commitment_updates (commitment_id, author_id, kind, body)
  values ('cccccccc-0000-0000-0000-000000000002', tests.uid(4), 'manager_note', 'not my team')$$, '42501', null, 'unrelated manager cannot comment');
select throws_ok($$update public.commitment_updates set body = 'edited'$$, '42501', null, 'the act log is append-only');

-- Evidence constraints and storage visibility ----------------------------------------------------------------------------------------
select tests.as_owner();
select throws_ok($$insert into public.evidence_items (organization_id, user_id, commitment_id, kind, title)
  values ((select id from public.organizations limit 1), tests.uid(5), 'cccccccc-0000-0000-0000-000000000002', 'file', 'no path')$$, '23514', null, 'file evidence needs a storage path');
select throws_ok($$insert into public.evidence_items (organization_id, user_id, commitment_id, kind, title, storage_path, file_name)
  values ((select id from public.organizations limit 1), tests.uid(5), 'cccccccc-0000-0000-0000-000000000002', 'file', 'x', 'someone-else/file.pdf', 'file.pdf')$$, '23514', null, 'storage path must live under the owner''s folder');
select throws_ok($$insert into public.evidence_items (organization_id, user_id, commitment_id, kind, title, url)
  values ((select id from public.organizations limit 1), tests.uid(5), 'cccccccc-0000-0000-0000-000000000002', 'link', 'x', 'javascript:alert(1)')$$, '23514', null, 'links must be http(s)');
select tests.as_user(3);
select is(private.evidence_object_visible(tests.uid(5)::text || '/c1/report.pdf'), true, 'manager may read a report''s evidence file');
select is(private.evidence_object_visible(tests.uid(7)::text || '/c1/report.pdf'), false, 'manager may not read another team''s evidence file');
select is(private.evidence_object_visible('not-a-uuid/report.pdf'), false, 'malformed paths are never visible');

select * from finish();
rollback;
