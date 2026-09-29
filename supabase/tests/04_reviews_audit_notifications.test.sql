-- Reviews scope, immutable audit trail, notifications (audit refs P8, P17, P18, P19, P20, P21).
begin;
\i supabase/tests/helpers.sql
select plan(37);
select tests.seed();

-- Reviews ------------------------------------------------------------------------------------------------
select tests.as_user(3);
select lives_ok($$insert into public.management_reviews (id, reviewer_id, subject_user_id, organization_id, notes)
  values ('eeeeeeee-0000-0000-0000-000000000001', tests.uid(3), tests.uid(5), (select id from public.organizations limit 1), 'Q3 check-in')$$, 'manager can review a direct report');
select throws_ok($$insert into public.management_reviews (reviewer_id, subject_user_id, organization_id, notes)
  values (tests.uid(3), tests.uid(2), (select id from public.organizations limit 1), 'reviewing the CEO')$$, '42501', null, 'manager cannot review the CEO (P17)');
select throws_ok($$insert into public.management_reviews (reviewer_id, subject_user_id, organization_id, notes)
  values (tests.uid(3), tests.uid(3), (select id from public.organizations limit 1), 'self review')$$, '42501', null, 'manager cannot review themselves (P18)');
select throws_ok($$insert into public.management_reviews (reviewer_id, subject_user_id, organization_id, notes)
  values (tests.uid(3), tests.uid(7), (select id from public.organizations limit 1), 'other team')$$, '42501', null, 'manager cannot review another team''s employee');
select throws_ok($$insert into public.management_reviews (reviewer_id, subject_user_id, organization_id, notes)
  values (tests.uid(4), tests.uid(7), (select id from public.organizations limit 1), 'impersonated reviewer')$$, '42501', null, 'reviewer must be the caller');
select lives_ok($$update public.management_reviews set notes = 'Q3 check-in (amended)'$$, 'reviewer can amend their review');
select throws_ok($$update public.management_reviews set subject_user_id = tests.uid(6)$$, '23514', null, 'review subject is immutable');

select tests.as_user(5);
select is((select count(*)::int from public.management_reviews), 1, 'subject can read a review about them (P19 inverse)');
select throws_ok($$insert into public.management_reviews (reviewer_id, subject_user_id, organization_id, notes)
  values (tests.uid(5), tests.uid(6), (select id from public.organizations limit 1), 'peer review')$$, '42501', null, 'employee cannot create reviews');
select tests.as_user(6);
select is((select count(*)::int from public.management_reviews), 0, 'peer cannot read someone else''s review');
select tests.as_user(4);
select is((select count(*)::int from public.management_reviews), 0, 'other manager cannot read the review');
select tests.as_user(2);
select is((select count(*)::int from public.management_reviews), 1, 'CEO can read reviews held by managers (P19)');
select lives_ok($$insert into public.management_reviews (reviewer_id, subject_user_id, organization_id, notes)
  values (tests.uid(2), tests.uid(3), (select id from public.organizations limit 1), 'CEO reviews manager')$$, 'CEO can review a manager');
select throws_ok($$insert into public.management_reviews (reviewer_id, subject_user_id, organization_id, notes)
  values (tests.uid(2), tests.uid(2), (select id from public.organizations limit 1), 'self')$$, '42501', null, 'CEO cannot review themselves');

-- Audit trail: forgery and tampering ---------------------------------------------------------------------------
select tests.as_user(5);
select throws_ok($$insert into public.audit_log (table_name, op) values ('commitments', 'UPDATE')$$, '42501', null, 'employees cannot forge audit entries (P8)');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'employees cannot delete audit entries');
select tests.as_owner();
select throws_ok($$update public.audit_log set actor_id = null$$, '42501', null, 'audit log is append-only even for the owner role');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'audit log rows cannot be deleted by the owner role');
select throws_ok($$truncate public.audit_log$$, '42501', null, 'audit log cannot be truncated');

-- Audit trail: content -----------------------------------------------------------------------------------------------
select tests.as_user(5);
select public.submit_baseline(tests.scores(3));
insert into public.commitments (id, user_id, organization_id, dimension_id, title, action)
  values ('cccccccc-0000-0000-0000-000000000009', tests.uid(5), (select id from public.organizations limit 1), 'results-delivery', 'Audit me', 'a');
update public.commitments set progress_percent = 55 where id = 'cccccccc-0000-0000-0000-000000000009';
select tests.as_owner();
select is((select count(*)::int from public.audit_log where table_name = 'assessments' and op = 'INSERT' and actor_id = tests.uid(5)), 1, 'assessment submission is audited with the actor');
select results_eq($$select (old_row ->> 'progress_percent')::numeric, (new_row ->> 'progress_percent')::numeric, actor_id = tests.uid(5)
    from public.audit_log where table_name = 'commitments' and op = 'UPDATE' and 'progress_percent' = any (changed_columns)$$,
  $$values (0::numeric, 55::numeric, true)$$, 'updates record previous value, new value and actor');
select ok((select bool_and(not ('updated_at' = any (changed_columns))) from public.audit_log where op = 'UPDATE'), 'updated_at noise is excluded from changed_columns');

select tests.as_user(3);
select ok((select count(*) from public.audit_log where subject_user_id = tests.uid(5)) > 0, 'manager can read audit history of a report');
select is((select count(*)::int from public.audit_log where subject_user_id = tests.uid(7)), 0, 'manager cannot read audit history of another team');
select tests.as_user(6);
select is((select count(*)::int from public.audit_log where subject_user_id = tests.uid(5)), 0, 'peer cannot read another employee''s audit history');
select tests.as_user(2);
select ok((select count(*) from public.audit_log) > 0, 'CEO can read the audit log');

-- History survives people (P20/P21) ----------------------------------------------------------------------------------
select tests.as_owner();
select throws_ok($$delete from auth.users where id = tests.uid(3)$$, '23503', null, 'a manager with reviews cannot be deleted (P21)');
update public.organization_members set active = false where user_id = tests.uid(3);
select is((select count(*)::int from public.management_reviews where reviewer_id = tests.uid(3)), 1, 'deactivating a manager preserves their reviews');
update public.organization_members set active = true where user_id = tests.uid(3);

-- Notifications --------------------------------------------------------------------------------------------------------
select tests.as_user(5);
update public.commitments set status = 'complete' where id = 'cccccccc-0000-0000-0000-000000000009';
select tests.as_user(3);
select is((select count(*)::int from public.notifications where kind = 'verification_requested'), 1, 'manager is asked to verify a completion');
select tests.as_user(5);
select is((select count(*)::int from public.notifications), 0, 'the employee does not see the manager''s notifications');
select tests.as_user(3);
select lives_ok($$update public.notifications set read_at = now()$$, 'a user can mark their notifications read');
select throws_ok($$update public.notifications set title = 'tampered'$$, '42501', null, 'a user cannot edit notification content');
select throws_ok($$insert into public.notifications (organization_id, user_id, kind, title, dedupe_key)
  values ((select id from public.organizations limit 1), tests.uid(5), 'spam', 'x', 'k')$$, '42501', null, 'a user cannot inject notifications');

-- Scheduled generation is idempotent -------------------------------------------------------------------------------------
select tests.as_owner();
insert into public.commitments (id, user_id, organization_id, dimension_id, title, action, due_date)
  values ('cccccccc-0000-0000-0000-000000000010', tests.uid(6), (select id from public.organizations limit 1), 'results-delivery', 'Due soon', 'a', private.org_today() + 2),
         ('cccccccc-0000-0000-0000-000000000011', tests.uid(6), (select id from public.organizations limit 1), 'results-delivery', 'Late', 'a', private.org_today() + 5);
alter table public.commitments disable trigger commitments_before_write;
update public.commitments set due_date = private.org_today() - 3 where id = 'cccccccc-0000-0000-0000-000000000011';
alter table public.commitments enable trigger commitments_before_write;
select ok(private.generate_notifications() > 0, 'generator creates due-soon / overdue notifications');
select is(private.generate_notifications(), 0, 'a second run creates nothing (idempotent)');
select is((select count(*)::int from public.notifications where user_id = tests.uid(6) and kind in ('due_soon', 'overdue')), 2, 'owner is reminded about due-soon and overdue items');
select is((select count(*)::int from public.notifications where user_id = tests.uid(3) and kind = 'overdue_team'), 1, 'manager is told about a report''s overdue commitment');

select * from finish();
rollback;
