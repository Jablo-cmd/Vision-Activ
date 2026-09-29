import type {
  CommitmentOutcome,
  MemberStatus,
  SubmissionRate,
  WeeklyDimensionScore,
} from "../domain";
import { db, unwrap } from "./supabase";

export async function weeklyDimensionScores(
  from: string,
  to: string,
): Promise<WeeklyDimensionScore[]> {
  const rows = unwrap(
    await db().rpc("report_weekly_dimension_scores", { p_from: from, p_to: to }),
  ) as WeeklyDimensionScore[];
  return rows.map((r) => ({ ...r, avg_score: Number(r.avg_score) }));
}

export async function submissionRates(from: string, to: string): Promise<SubmissionRate[]> {
  return unwrap(
    await db().rpc("report_submission_rate", { p_from: from, p_to: to }),
  ) as SubmissionRate[];
}

export async function memberStatus(): Promise<MemberStatus[]> {
  const rows = unwrap(await db().rpc("report_member_status")) as MemberStatus[];
  return rows.map((r) => ({
    ...r,
    latest_score: r.latest_score === null ? null : Number(r.latest_score),
    previous_score: r.previous_score === null ? null : Number(r.previous_score),
  }));
}

export async function commitmentOutcomes(): Promise<CommitmentOutcome[]> {
  const rows = unwrap(await db().rpc("report_commitment_outcomes")) as CommitmentOutcome[];
  return rows.map((r) => ({
    ...r,
    score_before: r.score_before === null ? null : Number(r.score_before),
    score_after: r.score_after === null ? null : Number(r.score_after),
    delta: r.delta === null ? null : Number(r.delta),
  }));
}

export type AttentionItem = {
  commitment_id: string;
  user_id: string;
  dimension_id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  progress_percent: number;
  blocker: string;
  blocked_at: string | null;
  verification_status: string;
  completed_at: string | null;
  is_overdue: boolean;
  days_overdue: number;
  accepted_evidence: number;
  unreviewed_evidence: number;
};

export async function commitmentAttention(): Promise<AttentionItem[]> {
  return unwrap(await db().rpc("report_commitment_attention")) as AttentionItem[];
}
