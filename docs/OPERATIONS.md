# Operations runbook

## 1. Production checklist (Supabase dashboard → Authentication)

These settings cannot be changed by migrations and must be set by a project owner.

| Setting | Value | Why |
|---|---|---|
| Site URL | `https://visionactiv.aurisnexus.co.za` | Reset and invite links use it. It was `http://localhost:3000`. |
| Redirect URLs | `https://visionactiv.aurisnexus.co.za/**` | Only our origin may receive tokens. |
| Allow new users to sign up | **Off** | People join by invitation; accounts without membership can see nothing anyway. |
| Leaked password protection | **On** | Blocks passwords found in breaches (currently a security advisor warning). |
| Minimum password length | 10 | The reset screen enforces 10 client-side. |
| Custom SMTP | Configure a real provider | The built-in mailer is heavily rate-limited; invitations and resets depend on it. |
| MFA (TOTP) | Enable, and require for CEO/admin | Executive data. |

Project settings → enable daily backups / point-in-time recovery (paid plans) and confirm restore steps with Supabase support.

## 2. First administrator

An account without a membership sees an "awaiting access" screen and no data. To bootstrap (once), in the SQL editor:

```sql
insert into public.organization_members (organization_id, user_id, role)
select o.id, u.id, 'admin'
from public.organizations o, auth.users u
where u.email = 'you@example.com';
```

Afterwards use **People** to invite everyone else and set roles and reporting lines. Deactivate leavers; do not delete them
(history is protected by foreign keys and would be lost).

## 3. Migrations

1. Change the schema in a new file `supabase/migrations/<timestamp>_<name>.sql` (never edit an applied one).
2. Add or update a pgTAP test in `supabase/tests/`.
3. `./scripts/e2e-stack.sh && ./scripts/db-test.sh` locally; CI repeats this from an empty database.
4. After merge, run **Production migrations** (Actions → manual). It dry-runs first; tick *apply* to execute. Approval on the `production` environment is required.

Rollback: migrations are forward-only. Ship a corrective migration; restore from backup for data loss.

## 4. Edge Function

`invite-user` is deployed with JWT verification on. It needs no secrets of its own (Supabase injects the URL, anon and service keys).
Deploy: `supabase functions deploy invite-user --project-ref <ref>`. Allowed origins are listed at the top of `index.ts`.

## 5. Scheduled notifications

`pg_cron` runs `private.generate_notifications()` daily at 05:00 UTC (07:00 SAST): due-soon and overdue reminders, stale verification
chasers, Thursday assessment reminders, Friday manager summaries, review follow-ups. It is idempotent (dedupe keys). Check with
`select * from cron.job_run_details order by start_time desc limit 5;`.

## 6. Monitoring

Set `VITE_SENTRY_DSN` to capture browser errors. Watch the Supabase security and performance advisors after every migration
(`get_advisors`) and the Postgres logs for `42501` (permission) spikes.

## 7. Incident response for suspected data exposure

1. Rotate the affected user's sessions (Auth → Users → sign out) and the JWT secret if a service key leaked.
2. Use **Audit log** (append-only) to see who changed what and when; query `audit_log` for `old_row`/`new_row` values.
3. Follow the organisation's POPIA incident process (regulator and data-subject notification duties).
