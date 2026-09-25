-- Leadership needs read-only access to active team-member profiles within the same organisation.
drop policy if exists profiles_self_read on public.profiles;

create policy profiles_read on public.profiles
for select to authenticated
using (
  (select auth.uid()) = id
  or exists (
    select 1
    from public.organization_members viewer
    join public.organization_members subject
      on subject.organization_id = viewer.organization_id
    where viewer.user_id = (select auth.uid())
      and viewer.active
      and viewer.role in ('manager','ceo','admin')
      and subject.user_id = profiles.id
      and subject.active
  )
);