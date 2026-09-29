-- Shared test helpers. Every test file runs inside one transaction that is rolled back.
create extension if not exists pgtap with schema extensions;
create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

-- Fixed cast: 2 executives, 2 managers under the CEO, 3 employees, 1 outsider (no membership).
--   admin(1)  ceo(2)  mgr(3)->ceo  mgr2(4)->ceo  e1(5)->mgr  e2(6)->mgr  e3(7)->mgr2  outsider(8)
create or replace function tests.uid(p_n int) returns uuid language sql immutable as $$
  select ('aaaaaaaa-0000-0000-0000-00000000000' || p_n)::uuid;
$$;

create or replace function tests.as_user(p_n int) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', tests.uid(p_n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', tests.uid(p_n)::text, true);
  set local role authenticated;
end $$;

create or replace function tests.as_anon() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
end $$;

create or replace function tests.as_owner() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

grant execute on function tests.uid(int) to authenticated, anon;

create or replace function tests.seed() returns void language plpgsql as $$
declare v_org uuid := (select id from public.organizations limit 1);
begin
  insert into auth.users (id, email, aud, role)
  select tests.uid(n), name || '@test.invalid', 'authenticated', 'authenticated'
  from (values (1,'admin'),(2,'ceo'),(3,'mgr'),(4,'mgr2'),(5,'e1'),(6,'e2'),(7,'e3'),(8,'outsider')) v(n, name);

  insert into public.organization_members (organization_id, user_id, role, manager_user_id) values
    (v_org, tests.uid(1), 'admin',    null),
    (v_org, tests.uid(2), 'ceo',      null),
    (v_org, tests.uid(3), 'manager',  tests.uid(2)),
    (v_org, tests.uid(4), 'manager',  tests.uid(2)),
    (v_org, tests.uid(5), 'employee', tests.uid(3)),
    (v_org, tests.uid(6), 'employee', tests.uid(3)),
    (v_org, tests.uid(7), 'employee', tests.uid(4));
end $$;

-- 12 valid dimension scores.
create or replace function tests.scores(p_score int default 3, p_evidence text default 'evidence') returns jsonb
language sql stable as $$
  select jsonb_agg(jsonb_build_object('dimensionId', slug, 'score', p_score, 'evidence', p_evidence) order by sort_order)
  from public.framework_dimensions where organization_id is null;
$$;

-- 12 valid scorecard entries (every required metric = 1).
create or replace function tests.entries() returns jsonb
language sql stable as $$
  select jsonb_agg(jsonb_build_object(
    'dimensionId', slug,
    'metrics', (select jsonb_object_agg(m, 1) from unnest(scorecard_metrics) m),
    'evidence', 'evidence') order by sort_order)
  from public.framework_dimensions where organization_id is null;
$$;

grant execute on function tests.scores(int, text) to authenticated;
grant execute on function tests.entries() to authenticated;
