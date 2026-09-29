-- Membership administration through audited RPCs.
-- Audit refs: no admin capability existed anywhere (users, roles and reporting lines needed raw SQL).

create or replace function private.assert_member_admin()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.my_role();
begin
  if v_role is null or v_role not in ('admin', 'ceo') then
    raise exception 'Only an administrator or the CEO can manage members' using errcode = '42501';
  end if;
  return v_role;
end;
$$;
revoke all on function private.assert_member_admin() from public, anon, authenticated;

create or replace function public.admin_add_member(p_user uuid, p_role text, p_manager uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller text := private.assert_member_admin();
  v_org uuid := private.my_org();
begin
  if p_role not in ('employee', 'manager', 'ceo', 'admin') then
    raise exception 'Unknown role %', p_role using errcode = '22023';
  end if;
  if v_caller = 'ceo' and p_role in ('ceo', 'admin') then
    raise exception 'Only an administrator can grant the % role', p_role using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'User does not exist' using errcode = '23503';
  end if;
  if p_manager is not null and not exists (
    select 1 from public.organization_members where user_id = p_manager and organization_id = v_org and active
  ) then
    raise exception 'Manager must be an active member' using errcode = '23503';
  end if;
  insert into public.organization_members (organization_id, user_id, role, manager_user_id)
  values (v_org, p_user, p_role, p_manager);
end;
$$;

create or replace function public.admin_update_member(
  p_user uuid,
  p_role text default null,
  p_manager uuid default null,
  p_clear_manager boolean default false,
  p_active boolean default null,
  p_tracked boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller text := private.assert_member_admin();
  v_org uuid := private.my_org();
  m public.organization_members;
begin
  select * into m from public.organization_members where user_id = p_user and organization_id = v_org for update;
  if not found then
    raise exception 'Member not found' using errcode = '23503';
  end if;
  if p_user = auth.uid() and (p_role is not null or p_active is not null) then
    raise exception 'You cannot change your own role or active status' using errcode = '42501';
  end if;
  if p_role is not null and p_role not in ('employee', 'manager', 'ceo', 'admin') then
    raise exception 'Unknown role %', p_role using errcode = '22023';
  end if;
  if v_caller = 'ceo' and (p_role in ('ceo', 'admin') or m.role in ('ceo', 'admin')) then
    raise exception 'Only an administrator can change CEO or administrator memberships' using errcode = '42501';
  end if;
  if p_manager is not null and (p_manager = p_user or not exists (
    select 1 from public.organization_members where user_id = p_manager and organization_id = v_org and active
  )) then
    raise exception 'Manager must be a different, active member' using errcode = '23503';
  end if;

  update public.organization_members
  set role = coalesce(p_role, role),
      active = coalesce(p_active, active),
      performance_tracked = coalesce(p_tracked, performance_tracked),
      manager_user_id = case when p_clear_manager then null else coalesce(p_manager, manager_user_id) end
  where user_id = p_user and organization_id = v_org;

  if not exists (
    select 1 from public.organization_members where organization_id = v_org and active and role = 'admin'
  ) then
    raise exception 'At least one active administrator is required' using errcode = '23514';
  end if;
end;
$$;

revoke all on function public.admin_add_member(uuid, text, uuid) from public, anon;
revoke all on function public.admin_update_member(uuid, text, uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.admin_add_member(uuid, text, uuid) to authenticated;
grant execute on function public.admin_update_member(uuid, text, uuid, boolean, boolean, boolean) to authenticated;
