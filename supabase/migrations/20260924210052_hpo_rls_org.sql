alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.weekly_cycles enable row level security;
alter table public.scorecard_entries enable row level security;

create policy organizations_member_read on public.organizations for select to authenticated using((select private.is_org_member(id)));
create policy profiles_self_read on public.profiles for select to authenticated using((select auth.uid())=id);
create policy memberships_self_read on public.organization_members for select to authenticated using((select auth.uid())=user_id or (select private.has_org_role(organization_id,array['manager','ceo','admin'])));
create policy cycles_member_read on public.weekly_cycles for select to authenticated using((select private.is_org_member(organization_id)));
