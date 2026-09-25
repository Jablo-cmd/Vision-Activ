-- Reconcile production RLS helpers, policy performance, and foreign-key indexes.

create schema if not exists private;

create or replace function private.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists(
    select 1 from public.organization_members
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
    select 1 from public.organization_members
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

-- Replace per-row auth calls with initplan-safe forms and consolidate
-- overlapping SELECT policies on assessments, commitments, and scorecards.
drop policy if exists assessments_lead_read on public.assessments;
drop policy if exists assessments_owner_select on public.assessments;
create policy assessments_read on public.assessments
for select to authenticated
using (
  (
    (select private.has_org_role(organization_id, array['manager','ceo','admin']))
  )
  or
  (
    (select auth.uid()) = user_id
    and (select private.is_org_member(organization_id))
  )
);

drop policy if exists assessments_owner_insert on public.assessments;
create policy assessments_owner_insert on public.assessments
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (select private.is_org_member(organization_id))
);

drop policy if exists assessments_owner_update on public.assessments;
create policy assessments_owner_update on public.assessments
for update to authenticated
using (
  (select auth.uid()) = user_id
  and (select private.is_org_member(organization_id))
)
with check (
  (select auth.uid()) = user_id
  and (select private.is_org_member(organization_id))
);

drop policy if exists commitments_lead_read on public.commitments;
drop policy if exists commitments_owner_select on public.commitments;
create policy commitments_read on public.commitments
for select to authenticated
using (
  (select private.has_org_role(organization_id, array['manager','ceo','admin']))
  or (
    (select auth.uid()) = user_id
    and (select private.is_org_member(organization_id))
  )
);

drop policy if exists commitments_owner_insert on public.commitments;
create policy commitments_owner_insert on public.commitments
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (select private.is_org_member(organization_id))
);

drop policy if exists commitments_owner_update on public.commitments;
create policy commitments_owner_update on public.commitments
for update to authenticated
using (
  (select auth.uid()) = user_id
  and (select private.is_org_member(organization_id))
)
with check (
  (select auth.uid()) = user_id
  and (select private.is_org_member(organization_id))
);

drop policy if exists scorecards_lead_read on public.scorecard_entries;
drop policy if exists scorecards_owner_select on public.scorecard_entries;
create policy scorecards_read on public.scorecard_entries
for select to authenticated
using (
  (select private.has_org_role(organization_id, array['manager','ceo','admin']))
  or (
    (select auth.uid()) = user_id
    and (select private.is_org_member(organization_id))
  )
);

drop policy if exists scorecards_owner_insert on public.scorecard_entries;
create policy scorecards_owner_insert on public.scorecard_entries
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (select private.is_org_member(organization_id))
);

drop policy if exists scorecards_owner_update on public.scorecard_entries;
create policy scorecards_owner_update on public.scorecard_entries
for update to authenticated
using (
  (select auth.uid()) = user_id
  and (select private.is_org_member(organization_id))
)
with check (
  (select auth.uid()) = user_id
  and (select private.is_org_member(organization_id))
);

-- Harden management review reads so a subject can only see reviews
-- belonging to an organisation they actually belong to.
drop policy if exists reviews_lead_select on public.management_reviews;
create policy reviews_lead_select on public.management_reviews
for select to authenticated
using (
  (
    (select private.has_org_role(organization_id, array['manager','ceo','admin']))
    and reviewer_id = (select auth.uid())
  )
  or (
    subject_user_id = (select auth.uid())
    and (select private.is_org_member(organization_id))
  )
);

drop policy if exists reviews_lead_insert on public.management_reviews;
create policy reviews_lead_insert on public.management_reviews
for insert to authenticated
with check (
  reviewer_id = (select auth.uid())
  and (select private.has_org_role(organization_id, array['manager','ceo','admin']))
);

drop policy if exists reviews_lead_update on public.management_reviews;
create policy reviews_lead_update on public.management_reviews
for update to authenticated
using (
  reviewer_id = (select auth.uid())
  and (select private.has_org_role(organization_id, array['manager','ceo','admin']))
)
with check (
  reviewer_id = (select auth.uid())
  and (select private.has_org_role(organization_id, array['manager','ceo','admin']))
);

-- Optimise remaining auth calls.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists memberships_self_read on public.organization_members;
create policy memberships_self_read on public.organization_members
for select to authenticated
using (
  (select auth.uid()) = user_id
  or (select private.has_org_role(organization_id, array['manager','ceo','admin']))
);

drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations
for select to authenticated
using ((select private.is_org_member(id)));

drop policy if exists cycles_member_read on public.weekly_cycles;
create policy cycles_member_read on public.weekly_cycles
for select to authenticated
using ((select private.is_org_member(organization_id)));

drop policy if exists audit_events_lead_read on public.audit_events;
create policy audit_events_lead_read on public.audit_events
for select to authenticated
using ((select private.has_org_role(organization_id, array['manager','ceo','admin'])));

drop policy if exists audit_events_member_insert on public.audit_events;
create policy audit_events_member_insert on public.audit_events
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_org_member(organization_id))
);

-- Cover all foreign keys identified by the Supabase performance advisor.
create index if not exists assessments_user_id_idx on public.assessments(user_id);
create index if not exists audit_events_user_id_idx on public.audit_events(user_id);
create index if not exists commitments_user_id_idx on public.commitments(user_id);
create index if not exists framework_dimensions_organization_id_idx on public.framework_dimensions(organization_id);
create index if not exists management_reviews_assessment_id_idx on public.management_reviews(assessment_id);
create index if not exists management_reviews_reviewer_id_idx on public.management_reviews(reviewer_id);
create index if not exists management_reviews_subject_user_id_idx on public.management_reviews(subject_user_id);
create index if not exists management_reviews_organization_id_idx on public.management_reviews(organization_id);
create index if not exists organization_members_user_id_idx on public.organization_members(user_id);
create index if not exists scorecard_entries_user_id_idx on public.scorecard_entries(user_id);

-- Keep the existing organisation-scoped composite indexes for application queries.
