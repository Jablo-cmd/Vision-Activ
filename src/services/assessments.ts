import type {
  AssessmentRow,
  CycleRow,
  Membership,
  ScoreItem,
  ScorecardEntryRow,
  ScorecardMetrics,
} from "../domain";
import { AppError, db, unwrap } from "./supabase";

export async function currentUserId(): Promise<string> {
  const { data, error } = await db().auth.getSession();
  const id = data.session?.user.id;
  if (error || !id) throw new AppError("Please sign in to continue.", "no-session");
  return id;
}

export async function fetchMembership(userId: string): Promise<Membership | null> {
  const res = await db()
    .from("organization_members")
    .select("organization_id, role, manager_user_id")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  return unwrap(res) as Membership | null;
}

const ASSESSMENT_COLUMNS =
  "id, user_id, assessment_type, period_start, period_end, scores, submitted_at";

export async function listAssessments(userId: string, limit = 80): Promise<AssessmentRow[]> {
  const res = await db()
    .from("assessments")
    .select(ASSESSMENT_COLUMNS)
    .eq("user_id", userId)
    .order("period_start", { ascending: false })
    .limit(limit);
  return unwrap(res) as AssessmentRow[];
}

export async function ensureCurrentCycle(): Promise<CycleRow> {
  const res = await db().rpc("ensure_current_cycle");
  const row = unwrap(res) as {
    id: string;
    week_start: string;
    week_end: string;
    status: "open" | "closed";
  };
  return { id: row.id, week_start: row.week_start, week_end: row.week_end, status: row.status };
}

export async function listScorecardEntries(
  cycleId: string,
  userId: string,
): Promise<ScorecardEntryRow[]> {
  const res = await db()
    .from("scorecard_entries")
    .select("id, dimension_id, metrics, evidence")
    .eq("cycle_id", cycleId)
    .eq("user_id", userId);
  return unwrap(res) as ScorecardEntryRow[];
}

export async function submitBaseline(scores: ScoreItem[]): Promise<string> {
  return unwrap(await db().rpc("submit_baseline", { p_scores: scores })) as string;
}

export type ScorecardEntryInput = {
  dimensionId: string;
  metrics: ScorecardMetrics;
  evidence: string;
};

export async function submitWeeklyPosition(
  scores: ScoreItem[],
  entries: ScorecardEntryInput[],
): Promise<string> {
  return unwrap(
    await db().rpc("submit_weekly_position", { p_scores: scores, p_entries: entries }),
  ) as string;
}
