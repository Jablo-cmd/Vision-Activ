create schema if not exists private;

create or replace function private.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists(
    select 1
    from public.organization_members
    where organization_id = target_org
      and user_id = auth.uid()
      and active
  );
$$;

create or replace function private.has_org_role(target_org uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists(
    select 1
    from public.organization_members
    where organization_id = target_org
      and user_id = auth.uid()
      and active
      and role = any(roles)
  );
$$;

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.has_org_role(uuid, text[]) from public;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, text[]) to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.weekly_cycles enable row level security;
alter table public.scorecard_entries enable row level security;

create policy org_read on public.organizations
  for select to authenticated
  using ((select private.is_org_member(id)));

create policy profile_read on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy membership_read on public.organization_members
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or (select private.has_org_role(organization_id, array['manager','ceo','admin']))
  );

create policy cycles_read on public.weekly_cycles
  for select to authenticated
  using ((select private.is_org_member(organization_id)));

create policy scorecards_owner on public.scorecard_entries
  for all to authenticated
  using (
    (select auth.uid()) = user_id
    and (select private.is_org_member(organization_id))
  )
  with check (
    (select auth.uid()) = user_id
    and (select private.is_org_member(organization_id))
  );

create policy scorecards_manager_read on public.scorecard_entries
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['manager','ceo','admin'])));

insert into public.framework_dimensions(name,description,weight,sort_order,active)
values
('Accountability & Ownership','Own commitments and distinguish proactive from reactive work.',.083333,1,true),
('Innovation & Improvement','Improve processes and measure efficiency gains.',.083333,2,true),
('Results Orientation & Delivery','Deliver quality work on time and address recurring delivery issues.',.083333,3,true),
('Planning & Prioritisation','Align quarter, month, week and hour execution.',.083333,4,true),
('Oversight, Governance & Assurance','Maintain visibility, detect variance and act on it.',.083333,5,true),
('Focus & Execution Discipline','Manage distraction, availability and productive time.',.083333,6,true),
('Lessons Learned & Continuous Improvement','Apply lessons and demonstrate changed behaviour.',.083333,7,true),
('Decision-Making & Problem Solving','Make timely decisions and resolve issues proactively.',.083333,8,true),
('Collaboration & Teamwork','Strengthen cross-functional cooperation and joint delivery.',.083333,9,true),
('Communication & Stakeholder Management','Communicate clearly and escalate issues in time.',.083333,10,true),
('Client Engagement & Representation','Represent the organisation professionally with clients.',.083333,11,true),
('Capability & Skills Development','Apply skills, grow capability and turn training into practice.',.083333,12,true)
on conflict do nothing;