// Invites a person by email and gives them a membership. Deployed with verify_jwt = true.
//
// Authorisation is decided by the database, not by this function: the membership is created with the
// caller's own JWT through the admin_add_member RPC, so RLS/role checks and the audit actor are the
// caller's. The service-role key is used for one thing only: sending the auth invitation.
import { createClient } from "npm:@supabase/supabase-js@2";
import { mayGrant, parseInvite, redirectFor } from "./validate.ts";

const ALLOWED_ORIGINS = [
  "https://visionactiv.aurisnexus.co.za",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
];

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin":
        origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      vary: "origin",
    },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return json({}, 204, origin);
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);

  const authorization = req.headers.get("authorization");
  if (!authorization) return json({ error: "Please sign in again." }, 401, origin);

  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { authorization } },
  });

  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return json({ error: "Please sign in again." }, 401, origin);

  const { data: me } = await caller
    .from("organization_members")
    .select("role")
    .eq("user_id", auth.user.id)
    .eq("active", true)
    .maybeSingle();
  if (!me) return json({ error: "You do not have access." }, 403, origin);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "A JSON body is required." }, 400, origin);
  }
  const parsed = parseInvite(raw);
  if (!parsed.ok) return json({ error: parsed.error }, 400, origin);
  const { email, fullName, role, managerId } = parsed.value;

  if (!mayGrant(me.role, role)) return json({ error: "You cannot grant that role." }, 403, origin);

  const redirectTo = redirectFor(origin, ALLOWED_ORIGINS);
  if (!redirectTo) return json({ error: "This origin may not send invitations." }, 403, origin);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const invited = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo,
  });
  if (invited.error || !invited.data.user) {
    const already = /already|registered|exists/i.test(invited.error?.message ?? "");
    return json(
      {
        error: already
          ? "That email address already has an account."
          : "The invitation could not be sent.",
      },
      already ? 409 : 502,
      origin,
    );
  }

  const { error: memberError } = await caller.rpc("admin_add_member", {
    p_user: invited.data.user.id,
    p_role: role,
    p_manager: managerId,
  });
  if (memberError) {
    // Do not leave an account without a membership behind.
    await admin.auth.admin.deleteUser(invited.data.user.id);
    return json({ error: memberError.message }, 400, origin);
  }

  return json({ ok: true }, 200, origin);
});
