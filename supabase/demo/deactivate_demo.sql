-- Deactivates every demonstration account (history is kept; nobody is deleted).
-- Run before real go-live, then remove the demonstration people from reporting lines if desired.
-- Sign-in is refused for deactivated members, and they disappear from active reporting.
update public.organization_members m
set active = false
from auth.users u
where u.id = m.user_id
  and u.email like '%@demo.visionactiv.example'
  and m.active;

-- Also block the credentials themselves.
update auth.users
set banned_until = 'infinity'
where email like '%@demo.visionactiv.example';
