create schema if not exists private;
create or replace function private.is_org_member(target_org uuid) returns boolean language sql stable security definer set search_path=public,private as $$ select exists(select 1 from public.organization_members where organization_id=target_org and user_id=auth.uid() and active); $$;
create or replace function private.has_org_role(target_org uuid, roles text[]) returns boolean language sql stable security definer set search_path=public,private as $$ select exists(select 1 from public.organization_members where organization_id=target_org and user_id=auth.uid() and active and role=any(roles)); $$;
revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.has_org_role(uuid,text[]) from public;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid,text[]) to authenticated;
