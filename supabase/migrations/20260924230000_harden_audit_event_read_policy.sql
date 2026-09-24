drop policy if exists audit_events_member_read on public.audit_events;
create policy audit_events_lead_read on public.audit_events for select to authenticated using (private.has_org_role(organization_id, array['manager','ceo','admin']));
