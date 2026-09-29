/** Pure request validation for the invite-user function (no Deno APIs, so it can be unit-tested). */

export const ROLES = ["employee", "manager", "ceo", "admin"] as const;
export type InviteRole = (typeof ROLES)[number];

export type InviteRequest = {
  email: string;
  fullName: string;
  role: InviteRole;
  managerId: string | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseInvite(
  body: unknown,
): { ok: true; value: InviteRequest } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null)
    return { ok: false, error: "A JSON body is required." };
  const b = body as Record<string, unknown>;

  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL.test(email))
    return { ok: false, error: "Enter a valid email address." };

  const fullName = typeof b.full_name === "string" ? b.full_name.trim() : "";
  if (fullName.length < 1 || fullName.length > 120)
    return { ok: false, error: "Enter the person's full name (up to 120 characters)." };

  if (typeof b.role !== "string" || !(ROLES as readonly string[]).includes(b.role))
    return { ok: false, error: "Choose a valid role." };

  let managerId: string | null = null;
  if (b.manager_user_id !== undefined && b.manager_user_id !== null && b.manager_user_id !== "") {
    if (typeof b.manager_user_id !== "string" || !UUID.test(b.manager_user_id))
      return { ok: false, error: "The manager is not valid." };
    managerId = b.manager_user_id;
  }
  return { ok: true, value: { email, fullName, role: b.role as InviteRole, managerId } };
}

/** The invite link may only send people back to an origin we control. */
export function redirectFor(origin: string | null, allowed: string[]): string | null {
  if (!origin || !allowed.includes(origin)) return null;
  return `${origin}/reset-password`;
}

/** CEOs may add employees and managers; only administrators grant CEO/administrator access. */
export function mayGrant(callerRole: string, target: InviteRole): boolean {
  if (callerRole === "admin") return true;
  if (callerRole === "ceo") return target === "employee" || target === "manager";
  return false;
}
