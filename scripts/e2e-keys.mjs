// Prints ANON_KEY / SERVICE_KEY JWTs signed with the local-development secret.
import { createHmac } from "node:crypto";

export const JWT_SECRET = process.env.JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export function sign(role) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ iss: "supabase-demo", role, exp: 1983812996 });
  const sig = createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`ANON_KEY=${sign("anon")}`);
  console.log(`SERVICE_KEY=${sign("service_role")}`);
}
