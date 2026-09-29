-- Reporting lines and visibility.
-- Audit refs: managers could read the whole organisation including executives (P13/P14/P16);
-- there was no team concept and no admin path for membership.

alter table public.organization_members
  add column if not exists manager_user_id uuid references auth.users (id) on delete set null,
  -- Administrators and service accounts may be members without taking part in performance tracking.
  add column if not exists performance_tracked boolean not null default true;

alter table public.organization_members
  drop constraint if exists organization_members_no_self_manager;
alter table public.organization_members
  add constraint organization_members_no_self_manager
  check (manager_user_id is null or manager_user_id <> user_id);

create index if not exists organization_members_manager_idx
  on public.organization_members (manager_user_id);

-- Reject reporting-line cycles (A manages B manages A).
create or replace function private.prevent_reporting_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cursor_id uuid := new.manager_user_id;
  depth int := 0;
begin
  while cursor_id is not null loop
    if cursor_id = new.user_id then
      raise exception 'Reporting line would create a cycle' using errcode = '23514';
    end if;
    depth := depth + 1;
    if depth > 25 then
      raise exception 'Reporting line is too deep' using errcode = '23514';
    end if;
    select m.manager_user_id into cursor_id
    from public.organization_members m
    where m.user_id = cursor_id and m.organization_id = new.organization_id;
  end loop;
  return new;
end;
$$;

drop trigger if exists organization_members_no_cycle on public.organization_members;
create trigger organization_members_no_cycle
  before insert or update of manager_user_id on public.organization_members
  for each row execute function private.prevent_reporting_cycle();

-- Identity helpers --------------------------------------------------------------------
create or replace function private.my_org()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id from public.organization_members
  where user_id = auth.uid() and active
  limit 1;
$$;

create or replace function private.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.organization_members
  where user_id = auth.uid() and active
  limit 1;
$$;

create or replace function private.is_leadership()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.my_role() in ('ceo', 'admin'), false);
$$;

-- Users whose data the caller may see: self + reporting subtree; CEO/admin see everyone.
-- Deactivated people stay visible (history), but a deactivated caller sees nothing.
create or replace function private.visible_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recursive me as (
    select organization_id, role
    from public.organization_members
    where user_id = auth.uid() and active
  ),
  tree as (
    select auth.uid() as user_id, 0 as depth
    where exists (select 1 from me)
    union
    select m.user_id, t.depth + 1
    from public.organization_members m
    join tree t on m.manager_user_id = t.user_id
    where t.depth < 25
  )
  select user_id from tree
  union
  select m.user_id
  from public.organization_members m
  join me on me.organization_id = m.organization_id
  where me.role in ('ceo', 'admin');
$$;

-- People the caller may manage (verify, comment on): visible, excluding self.
create or replace function private.can_manage(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target is not null
    and target <> auth.uid()
    and target in (select private.visible_user_ids());
$$;

-- Directory: people whose name/role the caller may see (visible set + own manager).
create or replace function private.directory_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.visible_user_ids()
  union
  select manager_user_id from public.organization_members
  where user_id = auth.uid() and active and manager_user_id is not null;
$$;

revoke all on function private.prevent_reporting_cycle() from public, anon, authenticated;
revoke all on function private.my_org() from public, anon;
revoke all on function private.my_role() from public, anon;
revoke all on function private.is_leadership() from public, anon;
revoke all on function private.visible_user_ids() from public, anon;
revoke all on function private.can_manage(uuid) from public, anon;
revoke all on function private.directory_user_ids() from public, anon;
grant execute on function private.my_org() to authenticated;
grant execute on function private.my_role() to authenticated;
grant execute on function private.is_leadership() to authenticated;
grant execute on function private.visible_user_ids() to authenticated;
grant execute on function private.can_manage(uuid) to authenticated;
grant execute on function private.directory_user_ids() to authenticated;

-- Read policies: reporting-line scoped ---------------------------------------------------
drop policy if exists assessments_read on public.assessments;
create policy assessments_read on public.assessments for select to authenticated
  using (user_id in (select private.visible_user_ids()));

drop policy if exists commitments_read on public.commitments;
create policy commitments_read on public.commitments for select to authenticated
  using (user_id in (select private.visible_user_ids()));

drop policy if exists scorecards_read on public.scorecard_entries;
create policy scorecards_read on public.scorecard_entries for select to authenticated
  using (user_id in (select private.visible_user_ids()));

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id in (select private.directory_user_ids()));

drop policy if exists memberships_self_read on public.organization_members;
create policy memberships_read on public.organization_members for select to authenticated
  using (user_id in (select private.directory_user_ids()));

-- Reviews: reviewer, subject, or CEO/admin.
drop policy if exists reviews_lead_select on public.management_reviews;
create policy reviews_read on public.management_reviews for select to authenticated
  using (
    reviewer_id = (select auth.uid())
    or subject_user_id = (select auth.uid())
    or (select private.is_leadership())
  );

-- Cycles: only CEO/admin may change a cycle; creation goes through ensure_current_cycle().
drop policy if exists cycles_member_insert on public.weekly_cycles;
drop policy if exists cycles_lead_update on public.weekly_cycles;
create policy cycles_leadership_update on public.weekly_cycles for update to authenticated
  using ((select private.is_leadership()) and organization_id = (select private.my_org()))
  with check ((select private.is_leadership()) and organization_id = (select private.my_org()));
