create policy audit_events_lead_read on public.audit_events for select to authenticated using((select private.has_org_role(organization_id,array['manager','ceo','admin'])));
