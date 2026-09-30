import { expect, test } from "@playwright/test";
import { API, PASSWORD, userId } from "./helpers";

/** Attacks the real Storage and REST APIs with real sessions (the pgTAP suite cannot run Storage). */
async function token(email: string, anon: string): Promise<string> {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return ((await res.json()) as { access_token: string }).access_token;
}

test("storage: evidence files stay private and cannot be forged, overwritten or listed by others", async () => {
  const anon = (await import("../scripts/e2e-keys.mjs")).sign("anon");
  const e1 = await token("e1@va.test", anon);
  const e2 = await token("e2@va.test", anon);
  const headers = (jwt: string, extra: Record<string, string> = {}) => ({
    apikey: anon,
    authorization: `Bearer ${jwt}`,
    ...extra,
  });
  const body = Buffer.from("%PDF-1.4 secret");
  const upload = (jwt: string, path: string, bucket = "evidence", upsert = false) =>
    fetch(`${API}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: headers(jwt, {
        "content-type": "application/pdf",
        ...(upsert ? { "x-upsert": "true" } : {}),
      }),
      body,
    });

  const mine = `${userId("e1")}/attack-${Date.now()}.pdf`;
  expect((await upload(e1, mine)).status, "owner can upload into own folder").toBe(200);

  // forging into another person's folder, or another bucket
  expect((await upload(e1, `${userId("e2")}/forged.pdf`)).status).toBeGreaterThanOrEqual(400);
  expect((await upload(e1, `${userId("e1")}/x.pdf`, "avatars")).status).toBeGreaterThanOrEqual(400);

  // overwrite is refused (no update policy), so evidence cannot be silently replaced
  expect((await upload(e1, mine, "evidence", true)).status).toBeGreaterThanOrEqual(400);

  // a peer cannot read or sign the file
  const peerRead = await fetch(`${API}/storage/v1/object/authenticated/evidence/${mine}`, {
    headers: headers(e2),
  });
  expect(peerRead.status).toBeGreaterThanOrEqual(400);
  const peerSign = await fetch(`${API}/storage/v1/object/sign/evidence/${mine}`, {
    method: "POST",
    headers: headers(e2, { "content-type": "application/json" }),
    body: JSON.stringify({ expiresIn: 60 }),
  });
  expect(peerSign.status).toBeGreaterThanOrEqual(400);

  // a peer cannot list the folder
  const list = await fetch(`${API}/storage/v1/object/list/evidence`, {
    method: "POST",
    headers: headers(e2, { "content-type": "application/json" }),
    body: JSON.stringify({ prefix: `${userId("e1")}/`, limit: 100 }),
  });
  expect(await list.json()).toEqual([]);

  // the public (unauthenticated) URL must not serve private evidence
  const publicUrl = await fetch(`${API}/storage/v1/object/public/evidence/${mine}`);
  expect(publicUrl.status).toBeGreaterThanOrEqual(400);

  // anonymous users get nothing
  const anonRead = await fetch(`${API}/storage/v1/object/evidence/${mine}`, {
    headers: { apikey: anon },
  });
  expect(anonRead.status).toBeGreaterThanOrEqual(400);

  // the owner can still read their own file
  const own = await fetch(`${API}/storage/v1/object/authenticated/evidence/${mine}`, {
    headers: headers(e1),
  });
  expect(own.status).toBe(200);
});

test("rest: a client cannot escalate its own role or read the membership of others", async () => {
  const anon = (await import("../scripts/e2e-keys.mjs")).sign("anon");
  const e1 = await token("e1@va.test", anon);
  const h = {
    apikey: anon,
    authorization: `Bearer ${e1}`,
    "content-type": "application/json",
    prefer: "return=representation",
  };
  const patch = await fetch(`${API}/rest/v1/organization_members?user_id=eq.${userId("e1")}`, {
    method: "PATCH",
    headers: h,
    body: JSON.stringify({ role: "admin" }),
  });
  expect(patch.status).toBe(403);
  const all = await fetch(`${API}/rest/v1/organization_members?select=user_id,role`, {
    headers: h,
  });
  const rows = (await all.json()) as { user_id: string }[];
  expect(rows.map((r) => r.user_id)).not.toContain(userId("e2"));
  const rpc = await fetch(`${API}/rest/v1/rpc/admin_update_member`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ p_user: userId("e1"), p_role: "admin" }),
  });
  expect(rpc.status).toBe(403);
});
