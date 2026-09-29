-- Member administration and catalog-level security invariants.
begin;
\i supabase/tests/helpers.sql
select plan(29);
select tests.seed();

-- Member administration -------------------------------------------------------------------------------------
select tests.as_user(5);
select throws_ok($$select public.admin_add_member(tests.uid(8), 'employee')$$, '42501', null, 'employee cannot add members');
select tests.as_user(3);
select throws_ok($$select public.admin_update_member(tests.uid(5), 'manager')$$, '42501', null, 'manager cannot change roles');
select tests.as_user(2);
select throws_ok($$select public.admin_add_member(tests.uid(8), 'admin')$$, '42501', null, 'CEO cannot grant admin');
select throws_ok($$select public.admin_update_member(tests.uid(1), null, null, false, false)$$, '42501', null, 'CEO cannot deactivate an administrator');
select lives_ok($$select public.admin_add_member(tests.uid(8), 'employee', tests.uid(3))$$, 'CEO can add an employee under a manager');
select is((select manager_user_id from public.organization_members where user_id = tests.uid(8)), tests.uid(3), 'reporting line recorded');
select throws_ok($$select public.admin_add_member(tests.uid(8), 'employee')$$, '23505', null, 'duplicate membership rejected');
select throws_ok($$select public.admin_update_member(tests.uid(8), null, tests.uid(8))$$, '23503', null, 'cannot manage yourself');
select throws_ok($$select public.admin_update_member(tests.uid(2), 'employee')$$, '42501', null, 'cannot change your own role');
select tests.as_user(1);
select lives_ok($$select public.admin_update_member(tests.uid(8), 'manager')$$, 'admin can promote to manager');
select throws_ok($$select public.admin_update_member(tests.uid(1), 'employee')$$, '42501', null, 'admin cannot demote themselves');
select throws_ok($$select public.admin_update_member(tests.uid(8), null, gen_random_uuid())$$, '23503', null, 'manager must be a real member');
select lives_ok($$select public.admin_update_member(tests.uid(8), null, null, true, false)$$, 'admin can clear manager and deactivate');
select tests.as_owner();
select is((select count(*)::int from public.audit_log where table_name = 'organization_members' and subject_user_id = tests.uid(8)), 3, 'membership changes are audited');

-- Profiles are provisioned automatically ------------------------------------------------------------------------
select is((select count(*)::int from public.profiles), 8, 'every auth user received a profile');
update auth.users set email = 'renamed@test.invalid' where id = tests.uid(5);
select is((select email from public.profiles where id = tests.uid(5)), 'renamed@test.invalid', 'profile email follows auth email');

-- Catalog invariants -------------------------------------------------------------------------------------------------
select is((select count(*)::int from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'), 0, 'anon holds no privileges on any public table');
select is((select count(*)::int from information_schema.role_table_grants
           where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')), 0, 'authenticated has no DELETE/TRUNCATE/REFERENCES/TRIGGER anywhere');
select is((select count(*)::int from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity), 0, 'every public table has RLS enabled');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'private') and p.prosecdef
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 0, 'every SECURITY DEFINER function pins search_path');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')), 0, 'anon can execute no application function');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and p.prokind = 'f' and p.prorettype = 'trigger'::regtype
             and has_function_privilege('authenticated', p.oid, 'execute')), 0, 'trigger functions are not callable by clients');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('generate_notifications', 'notify')), 0, 'scheduler and notify internals are not exposed through the API schema');
select is((select count(*)::int from pg_constraint
           where contype = 'f' and confrelid = 'auth.users'::regclass and confdeltype = 'c'
             and conrelid in ('public.assessments'::regclass, 'public.commitments'::regclass, 'public.scorecard_entries'::regclass,
                              'public.management_reviews'::regclass, 'public.commitment_updates'::regclass, 'public.evidence_items'::regclass)), 0, 'no history table cascades from auth.users');
select is((select array_agg(privilege_type::text order by privilege_type) from information_schema.role_table_grants
           where grantee = 'authenticated' and table_schema = 'public' and table_name = 'audit_log'), array['SELECT'], 'authenticated may only read the audit log');
select is((select array_agg(privilege_type::text order by privilege_type) from information_schema.role_table_grants
           where grantee = 'authenticated' and table_schema = 'public' and table_name = 'assessments'), array['SELECT'], 'authenticated may only read assessments (writes are RPC-only)');
select is(has_schema_privilege('anon', 'private', 'usage'), false, 'anon has no access to the private schema');
select is((select count(*)::int from pg_extension where extname = 'pg_cron'), 1, 'pg_cron is installed for scheduled notifications');
select is((select count(*)::int from cron.job where jobname = 'vision-activ-notifications'), 1, 'notification job is scheduled');

select * from finish();
rollback;
