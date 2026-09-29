-- Privilege sweep: no application function is executable through the implicit PUBLIC grant.
-- Found by the catalog invariants in supabase/tests/05_admin_and_grants.test.sql: trigger functions
-- and time helpers were callable by anon. Explicit grants below restore only what clients need.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn, p.prorettype = 'trigger'::regtype as is_trigger
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon', r.fn);
    if r.is_trigger then
      -- Trigger functions are never invoked directly; firing does not need EXECUTE.
      execute format('revoke all on function %s from authenticated', r.fn);
    end if;
  end loop;
end
$$;

-- Helpers evaluated inside RLS policies / invoker functions run with the caller's privileges.
grant execute on function private.org_today() to authenticated;
grant execute on function private.current_week_start() to authenticated;

-- From now on, new functions in the application schemas are private by default.
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema private revoke execute on functions from public, anon;
