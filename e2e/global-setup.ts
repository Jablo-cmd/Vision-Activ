import { execFileSync } from "node:child_process";
import { seed } from "../scripts/e2e-seed.mjs";

/** Fresh application data for every run; users, org and memberships are (re)seeded. */
export default async function globalSetup() {
  const superuser =
    process.env.E2E_PG_ADMIN ?? "postgresql://supabase_admin:postgres@127.0.0.1:54329/postgres";
  execFileSync(
    "psql",
    [
      superuser,
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `set session_replication_role = replica;
       truncate public.audit_log, public.notifications, public.evidence_items, public.commitment_updates,
                public.commitments, public.management_reviews, public.scorecard_entries, public.assessments,
                public.weekly_cycles restart identity cascade;
       delete from storage.objects where bucket_id = 'evidence';`,
    ],
    { encoding: "utf8" },
  );
  await seed();
}
