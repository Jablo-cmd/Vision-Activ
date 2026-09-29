-- Management reviews: managers review their reports, not themselves or their superiors.
-- Audit refs: manager reviewed the CEO (P17) and themselves (P18); CEO could not see reviews
-- held by managers (P19); subject was nullable.

alter table public.management_reviews drop constraint if exists management_reviews_no_self_review;
alter table public.management_reviews
  add constraint management_reviews_no_self_review check (reviewer_id <> subject_user_id);

create or replace function private.management_reviews_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
       new.reviewer_id <> old.reviewer_id or new.subject_user_id <> old.subject_user_id
    or new.organization_id <> old.organization_id or new.assessment_id is distinct from old.assessment_id
  ) then
    raise exception 'Review identity fields are immutable' using errcode = '23514';
  end if;
  if new.assessment_id is not null and not exists (
    select 1 from public.assessments a where a.id = new.assessment_id and a.user_id = new.subject_user_id
  ) then
    raise exception 'The assessment does not belong to the person being reviewed' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists management_reviews_before_write on public.management_reviews;
create trigger management_reviews_before_write
  before insert or update on public.management_reviews
  for each row execute function private.management_reviews_before_write();

drop policy if exists reviews_lead_insert on public.management_reviews;
drop policy if exists reviews_lead_update on public.management_reviews;

create policy reviews_insert on public.management_reviews for insert to authenticated
  with check (
    reviewer_id = (select auth.uid())
    and organization_id = (select private.my_org())
    and (select private.my_role()) in ('manager', 'ceo', 'admin')
    and (select private.can_manage(subject_user_id))
  );

create policy reviews_update on public.management_reviews for update to authenticated
  using (reviewer_id = (select auth.uid()) and (select private.can_manage(subject_user_id)))
  with check (reviewer_id = (select auth.uid()) and (select private.can_manage(subject_user_id)));
