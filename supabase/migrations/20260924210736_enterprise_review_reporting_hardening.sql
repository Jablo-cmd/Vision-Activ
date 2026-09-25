alter table public.management_reviews add duration_minutes integer not null default 20 check(duration_minutes between 5 and 120);
alter table public.management_reviews add action_items jsonb not null default '[]'::jsonb;
alter table public.management_reviews add follow_up_date date;
alter table public.management_reviews add status text not null default 'completed' check(status in ('scheduled','completed','cancelled'));
create index audit_events_org_created_idx on public.audit_events(organization_id,created_at desc);
create index assessments_org_user_period_idx on public.assessments(organization_id,user_id,period_start desc);
create index commitments_org_user_status_idx on public.commitments(organization_id,user_id,status);
create index scorecard_org_cycle_user_idx on public.scorecard_entries(organization_id,cycle_id,user_id);
