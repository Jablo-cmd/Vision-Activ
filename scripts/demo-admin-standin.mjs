// Creates the single "existing administrator" a real deployment already has, on a local stack, so the
// demonstration data can be loaded and verified exactly as it will be in production. Local/CI use only.
import { execFileSync } from "node:child_process";
import { sign } from "./e2e-keys.mjs";

const API = process.env.E2E_API ?? "http://127.0.0.1:54321";
const PG = process.env.E2E_PG ?? "postgresql://postgres:postgres@127.0.0.1:54329/postgres";
const svc = sign("service_role");
const res = await fetch(`${API}/auth/v1/admin/users`, {
  method: "POST",
  headers: { "content-type": "application/json", apikey: svc, authorization: `Bearer ${svc}` },
  body: JSON.stringify({
    email: "owner@prodlike.test",
    password: "Passw0rd!Passw0rd",
    email_confirm: true,
    user_metadata: { full_name: "Existing Administrator" },
  }),
});
if (!res.ok && res.status !== 422)
  throw new Error(`could not create the stand-in administrator: ${res.status}`);
const id = res.ok ? (await res.json()).id : undefined;
execFileSync("psql", [
  PG,
  "-X",
  "-q",
  "-v",
  "ON_ERROR_STOP=1",
  "-c",
  `insert into public.organization_members (organization_id, user_id, role)
   select o.id, u.id, 'admin' from public.organizations o, auth.users u
   where o.slug = 'vision-activ' and u.email = 'owner@prodlike.test'
   on conflict (organization_id, user_id) do nothing`,
]);
console.log("stand-in administrator ready", id ?? "(already existed)");
