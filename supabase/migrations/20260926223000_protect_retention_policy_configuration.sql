create policy data_retention_policies_management_select
  on public.data_retention_policies
  for select to authenticated
  using (
    exists (
      select 1
      from public.organization_members om
      where om.organization_id = (select id from public.organizations limit 1)
        and om.user_id = (select auth.uid())
        and om.active
        and om.role = any (array['ceo','admin']::text[])
    )
  );
