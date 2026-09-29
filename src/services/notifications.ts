import type { NotificationRow } from "../domain";
import { currentUserId } from "./assessments";
import { db, unwrap } from "./supabase";

export async function listNotifications(limit = 50): Promise<NotificationRow[]> {
  const res = await db()
    .from("notifications")
    .select("id, kind, title, body, entity_type, entity_id, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return unwrap(res) as NotificationRow[];
}

export async function unreadCount(): Promise<number> {
  const userId = await currentUserId();
  const res = await db()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  unwrap({ data: null, error: res.error });
  return res.count ?? 0;
}

export async function markRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  unwrap(
    await db().from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids),
  );
}

export async function markAllRead(): Promise<void> {
  const userId = await currentUserId();
  unwrap(
    await db()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null),
  );
}
