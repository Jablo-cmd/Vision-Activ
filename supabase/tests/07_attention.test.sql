-- Intervention queue (report_commitment_attention).
begin;
\i supabase/tests/helpers.sql
select plan(8);
select tests.seed();

insert into public.commitments (id, user_id, organization_id, dimension_id, title, action, due_date)
select ('cccccccc-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, tests.uid(u), (select id from public.organizations limit 1),
       'results-delivery', t, 'a', private.org_today() + 5
from (values (1, 5, 'overdue one'), (2, 5, 'blocked one'), (3, 6, 'awaiting verification'), (4, 6, 'healthy'), (5, 7, 'other team blocked')) v(n, u, t);

alter table public.commitments disable trigger commitments_before_write;
update public.commitments set due_date = private.org_today() - 4 where id = 'cccccccc-0000-0000-0000-000000000001';
alter table public.commitments enable trigger commitments_before_write;
update public.commitments set status = 'blocked', blocker = 'waiting' where id in ('cccccccc-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000005');
update public.commitments set status = 'complete' where id = 'cccccccc-0000-0000-0000-000000000003';

select tests.as_user(3);
select is((select count(*)::int from public.report_commitment_attention()), 3, 'manager sees overdue, blocked and awaiting-verification items of their team only');
select is((select days_overdue from public.report_commitment_attention() where title = 'overdue one'), 4, 'days overdue is computed in organisation time');
select is((select is_overdue from public.report_commitment_attention() where title = 'blocked one'), false, 'blocked but not yet due is not overdue');
select is((select title from public.report_commitment_attention() limit 1), 'blocked one', 'blocked items are listed first');
select results_eq($$select accepted_evidence, unreviewed_evidence from public.report_commitment_attention() where title = 'awaiting verification'$$,
  $$values (0, 0)$$, 'evidence gaps are visible (nothing accepted yet)');
select is((select count(*)::int from public.report_commitment_attention() where title = 'healthy'), 0, 'healthy commitments are excluded');
select tests.as_user(2);
select is((select count(*)::int from public.report_commitment_attention()), 4, 'CEO sees every team''s items');
select tests.as_user(5);
select is((select count(*)::int from public.report_commitment_attention()), 0, 'an employee''s own items are not part of the management queue');

select * from finish();
rollback;
