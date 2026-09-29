-- Intervention queue for managers and executives: what needs management action right now.
-- SECURITY INVOKER, so reporting-line row level security applies.

create or replace function public.report_commitment_attention()
returns table (
  commitment_id uuid, user_id uuid, dimension_id text, title text, status text, priority text,
  due_date date, progress_percent numeric, blocker text, blocked_at timestamptz,
  verification_status text, completed_at timestamptz,
  is_overdue boolean, days_overdue integer,
  accepted_evidence integer, unreviewed_evidence integer
)
language sql
stable
set search_path = ''
as $$
  with today as (select private.org_today() as d)
  select c.id, c.user_id, c.dimension_id, c.title, c.status, c.priority,
         c.due_date, c.progress_percent, c.blocker, c.blocked_at,
         c.verification_status, c.completed_at,
         (c.status <> 'complete' and c.due_date < (select d from today)) as is_overdue,
         case when c.status <> 'complete' and c.due_date < (select d from today)
              then (select d from today) - c.due_date else 0 end as days_overdue,
         (select count(*)::integer from public.evidence_items e
           where e.commitment_id = c.id and e.review_status = 'accepted') as accepted_evidence,
         (select count(*)::integer from public.evidence_items e
           where e.commitment_id = c.id and e.review_status = 'pending') as unreviewed_evidence
  from public.commitments c
  where c.user_id in (select private.visible_user_ids())
    and c.user_id <> auth.uid()
    and (
      c.status = 'blocked'
      or (c.status <> 'complete' and c.due_date < (select d from today))
      or c.verification_status = 'pending'
    )
  order by (c.status = 'blocked') desc, c.due_date nulls last, c.created_at
  limit 500;
$$;

revoke all on function public.report_commitment_attention() from public, anon;
grant execute on function public.report_commitment_attention() to authenticated;
