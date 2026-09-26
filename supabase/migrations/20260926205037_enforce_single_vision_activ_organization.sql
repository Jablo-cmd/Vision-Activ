-- Vision Activ is a single-organization application.
-- Keep one canonical organization record and prevent additional organizations.

insert into public.organizations (name, slug)
select 'Vision Activ', 'vision-activ'
where not exists (select 1 from public.organizations);

create unique index if not exists organizations_singleton_idx
on public.organizations ((true));
