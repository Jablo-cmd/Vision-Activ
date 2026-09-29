import type { AuditRow } from "../domain";
import { db, unwrap } from "./supabase";

export type AuditFilter = {
  table?: string;
  actorId?: string;
  subjectUserId?: string;
  page?: number;
};

const PAGE = 50;

export async function listAudit(f: AuditFilter): Promise<{ rows: AuditRow[]; total: number }> {
  const from = (f.page ?? 0) * PAGE;
  let q = db().from("audit_log").select("*", { count: "exact" });
  if (f.table) q = q.eq("table_name", f.table);
  if (f.actorId) q = q.eq("actor_id", f.actorId);
  if (f.subjectUserId) q = q.eq("subject_user_id", f.subjectUserId);
  const res = await q.order("id", { ascending: false }).range(from, from + PAGE - 1);
  const rows = unwrap(res) as AuditRow[];
  return { rows, total: res.count ?? rows.length };
}
