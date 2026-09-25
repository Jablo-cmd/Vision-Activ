-- Employees may create their organisation's weekly cycle; only leadership may modify an existing cycle.
create policy cycles_member_insert on public.weekly_cycles
for insert to authenticated
with check((select private.is_org_member(organization_id)));

create policy cycles_lead_update on public.weekly_cycles
for update to authenticated
using((select private.has_org_role(organization_id,array['manager','ceo','admin'])))
with check((select private.has_org_role(organization_id,array['manager','ceo','admin'])));