import type { MemberRow, ProfileRow, Role } from "../domain";
import { AppError, db, unwrap } from "./supabase";

export type Person = ProfileRow & {
  role: Role | null;
  manager_user_id: string | null;
  active: boolean;
  tracked: boolean;
};

/** Everyone the caller may see (their reporting line plus own manager). */
export async function listDirectory(): Promise<Person[]> {
  const [profiles, members] = await Promise.all([
    db().from("profiles").select("id, full_name, email").limit(1000),
    db()
      .from("organization_members")
      .select("user_id, role, manager_user_id, active, performance_tracked")
      .limit(1000),
  ]);
  const byUser = new Map((unwrap(members) as MemberRow[]).map((m) => [m.user_id, m]));
  return (unwrap(profiles) as ProfileRow[])
    .map((p) => {
      const m = byUser.get(p.id);
      return {
        ...p,
        role: m?.role ?? null,
        manager_user_id: m?.manager_user_id ?? null,
        active: m?.active ?? false,
        tracked: m?.performance_tracked ?? true,
      };
    })
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));
}

export function displayName(p: Pick<ProfileRow, "full_name" | "email"> | undefined | null): string {
  if (!p) return "Unknown";
  return p.full_name.trim() || p.email || "Unknown";
}

export async function adminUpdateMember(args: {
  userId: string;
  role?: Role;
  managerId?: string | null;
  clearManager?: boolean;
  active?: boolean;
  tracked?: boolean;
}): Promise<void> {
  unwrap(
    await db().rpc("admin_update_member", {
      p_user: args.userId,
      p_role: args.role ?? null,
      p_manager: args.managerId ?? null,
      p_clear_manager: args.clearManager ?? false,
      p_active: args.active ?? null,
      p_tracked: args.tracked ?? null,
    }),
  );
}

export async function inviteUser(args: {
  email: string;
  fullName: string;
  role: Role;
  managerId: string | null;
}): Promise<void> {
  const { data, error } = await db().functions.invoke("invite-user", {
    body: {
      email: args.email,
      full_name: args.fullName,
      role: args.role,
      manager_user_id: args.managerId,
    },
  });
  if (error) {
    // supabase-js hides the function's JSON body inside error.context
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = (await ctx.json()) as { error?: string };
        if (body.error) throw new AppError(body.error);
      } catch (e) {
        if (e instanceof AppError) throw e;
      }
    }
    throw new AppError("The invitation could not be sent.");
  }
  if (data && typeof data === "object" && "error" in data && data.error)
    throw new AppError(String(data.error));
}

export async function adminAddMember(args: {
  userId: string;
  role: Role;
  managerId: string | null;
}): Promise<void> {
  unwrap(
    await db().rpc("admin_add_member", {
      p_user: args.userId,
      p_role: args.role,
      p_manager: args.managerId,
    }),
  );
}
