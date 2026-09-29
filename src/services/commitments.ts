import type {
  CommitmentRow,
  CommitmentStatus,
  CommitmentUpdateRow,
  NewCommitment,
  Priority,
  VerificationStatus,
} from "../domain";
import { currentUserId } from "./assessments";
import { db, unwrap } from "./supabase";

export async function listMyCommitments(): Promise<CommitmentRow[]> {
  const userId = await currentUserId();
  const res = await db()
    .from("commitments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(300);
  return unwrap(res) as CommitmentRow[];
}

export async function getCommitment(id: string): Promise<CommitmentRow | null> {
  const res = await db().from("commitments").select("*").eq("id", id).maybeSingle();
  return unwrap(res) as CommitmentRow | null;
}

export async function createCommitment(
  input: NewCommitment,
  organizationId: string,
): Promise<CommitmentRow> {
  const userId = await currentUserId();
  const res = await db()
    .from("commitments")
    .insert({ ...input, user_id: userId, organization_id: organizationId })
    .select("*")
    .single();
  return unwrap(res) as CommitmentRow;
}

export type CommitmentPatch = Partial<{
  title: string;
  action: string;
  timeframe: string;
  evidence_plan: string;
  priority: Priority;
  due_date: string | null;
  measure: string;
  baseline_value: number | null;
  target_value: number | null;
  current_value: number | null;
  progress_percent: number;
  status: CommitmentStatus;
  blocker: string;
}>;

export async function updateCommitment(id: string, patch: CommitmentPatch): Promise<CommitmentRow> {
  const res = await db().from("commitments").update(patch).eq("id", id).select("*").single();
  return unwrap(res) as CommitmentRow;
}

export type TeamCommitmentFilter = {
  userId?: string;
  status?: CommitmentStatus;
  verification?: VerificationStatus;
  dimensionId?: string;
  dueBefore?: string; // only open items due before this date
  page?: number;
  pageSize?: number;
};

export async function listTeamCommitments(
  f: TeamCommitmentFilter,
): Promise<{ rows: CommitmentRow[]; total: number }> {
  const pageSize = f.pageSize ?? 25;
  const from = (f.page ?? 0) * pageSize;
  let q = db().from("commitments").select("*", { count: "exact" });
  if (f.userId) q = q.eq("user_id", f.userId);
  if (f.status) q = q.eq("status", f.status);
  if (f.verification) q = q.eq("verification_status", f.verification);
  if (f.dimensionId) q = q.eq("dimension_id", f.dimensionId);
  if (f.dueBefore) q = q.neq("status", "complete").lt("due_date", f.dueBefore);
  const res = await q
    .order("due_date", { ascending: true, nullsFirst: false })
    .range(from, from + pageSize - 1);
  const rows = unwrap(res) as CommitmentRow[];
  return { rows, total: res.count ?? rows.length };
}

export async function listUpdates(commitmentId: string): Promise<CommitmentUpdateRow[]> {
  const res = await db()
    .from("commitment_updates")
    .select("id, commitment_id, author_id, kind, body, created_at")
    .eq("commitment_id", commitmentId)
    .order("created_at", { ascending: false })
    .limit(200);
  return unwrap(res) as CommitmentUpdateRow[];
}

export async function addUpdate(
  commitmentId: string,
  kind: "note" | "manager_note",
  body: string,
): Promise<void> {
  const authorId = await currentUserId();
  unwrap(
    await db()
      .from("commitment_updates")
      .insert({ commitment_id: commitmentId, author_id: authorId, kind, body }),
  );
}

export async function verifyCommitment(
  id: string,
  decision: "verified" | "rejected",
  note: string,
): Promise<void> {
  unwrap(await db().rpc("verify_commitment", { p_id: id, p_decision: decision, p_note: note }));
}

export type CommitmentCountFilter = {
  createdFrom?: string;
  createdBefore?: string;
  completedFrom?: string;
  completedBefore?: string;
  verifiedFrom?: string;
  verifiedBefore?: string;
};

/** Head-only count queries (no rows transferred); ranges are [from, before). Dates are 'YYYY-MM-DD' in organisation time. */
export async function countCommitments(f: CommitmentCountFilter): Promise<number> {
  const at = (d: string) => `${d}T00:00:00+02:00`; // South Africa observes no daylight saving
  let q = db().from("commitments").select("id", { count: "exact", head: true });
  if (f.createdFrom) q = q.gte("created_at", at(f.createdFrom));
  if (f.createdBefore) q = q.lt("created_at", at(f.createdBefore));
  if (f.completedFrom) q = q.gte("completed_at", at(f.completedFrom));
  if (f.completedBefore) q = q.lt("completed_at", at(f.completedBefore));
  if (f.verifiedFrom)
    q = q.eq("verification_status", "verified").gte("verified_at", at(f.verifiedFrom));
  if (f.verifiedBefore)
    q = q.eq("verification_status", "verified").lt("verified_at", at(f.verifiedBefore));
  const res = await q;
  unwrap({ data: null, error: res.error });
  return res.count ?? 0;
}
