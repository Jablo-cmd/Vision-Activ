-- One assessment per user, organisation, type and period.
create unique index if not exists assessments_org_user_type_period_uidx
on public.assessments(organization_id,user_id,assessment_type,period_start);