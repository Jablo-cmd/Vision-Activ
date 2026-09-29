// Creates the E2E cast through GoTrue's admin API and assigns memberships (idempotent).
import { execFileSync } from "node:child_process";
import { sign } from "./e2e-keys.mjs";

const API = process.env.E2E_API ?? "http://127.0.0.1:54321";
const PG = process.env.E2E_PG ?? "postgresql://postgres:postgres@127.0.0.1:54329/postgres";
export const PASSWORD = "Passw0rd!Passw0rd";

export const CAST = [
  { key: "admin", email: "admin@va.test", name: "Ada Admin", role: "admin", manager: null },
  { key: "ceo", email: "ceo@va.test", name: "Carl Chief", role: "ceo", manager: null },
  { key: "mgr", email: "mgr@va.test", name: "Maya Manager", role: "manager", manager: "ceo" },
  { key: "e1", email: "e1@va.test", name: "Eli Employee", role: "employee", manager: "mgr" },
  { key: "e2", email: "e2@va.test", name: "Ezra Employee", role: "employee", manager: "mgr" },
  { key: "outsider", email: "outsider@va.test", name: "Olga Outsider", role: null, manager: null },
];

const sql = (q) => execFileSync("psql", [PG, "-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" }).trim();

export async function seed() {
  const service = sign("service_role");
  const ids = {};
  for (const u of CAST) {
    const res = await fetch(`${API}/auth/v1/admin/users`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: service, authorization: `Bearer ${service}` },
      body: JSON.stringify({ email: u.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: u.name } }),
    });
    if (res.ok) ids[u.key] = (await res.json()).id;
    else if (res.status === 422) ids[u.key] = sql(`select id from auth.users where email = '${u.email}'`);
    else throw new Error(`could not create ${u.email}: ${res.status} ${await res.text()}`);
  }
  const org = sql("select id from public.organizations limit 1");
  for (const u of CAST) {
    if (!u.role) continue;
    const mgr = u.manager ? `'${ids[u.manager]}'` : "null";
    sql(
      `insert into public.organization_members (organization_id, user_id, role, manager_user_id)
       values ('${org}', '${ids[u.key]}', '${u.role}', ${mgr})
       on conflict (organization_id, user_id) do update set role = excluded.role, manager_user_id = excluded.manager_user_id, active = true`,
    );
  }
  return ids;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(await seed(), null, 2));
}
