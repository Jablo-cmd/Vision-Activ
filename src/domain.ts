/** Row and value types shared by services and screens. Mirrors the database schema. */

export type Role = "employee" | "manager" | "ceo" | "admin";

export const MANAGEMENT_ROLES: readonly Role[] = ["manager", "ceo", "admin"];
export const EXECUTIVE_ROLES: readonly Role[] = ["ceo", "admin"];

export type ScoreItem = { dimensionId: string; score: number; evidence: string };
export type AssessmentType = "baseline" | "weekly";

export type AssessmentRow = {
  id: string;
  user_id: string;
  assessment_type: AssessmentType;
  period_start: string;
  period_end: string;
  scores: ScoreItem[];
  submitted_at: string;
};

export type ScorecardMetrics = Record<string, number>;
export type ScorecardEntryRow = {
  id: string;
  dimension_id: string;
  metrics: ScorecardMetrics;
  evidence: string;
};

export type CycleRow = {
  id: string;
  week_start: string;
  week_end: string;
  status: "open" | "closed";
};

export type CommitmentStatus = "not_started" | "in_progress" | "blocked" | "complete";
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";
export type Priority = "low" | "normal" | "high" | "critical";

export type CommitmentRow = {
  id: string;
  user_id: string;
  owner_user_id: string | null;
  dimension_id: string;
  title: string;
  action: string;
  timeframe: string;
  evidence_plan: string;
  status: CommitmentStatus;
  priority: Priority;
  due_date: string | null;
  measure: string;
  baseline_value: number | null;
  target_value: number | null;
  current_value: number | null;
  progress_percent: number;
  blocker: string;
  blocked_at: string | null;
  completed_at: string | null;
  verification_status: VerificationStatus;
  verified_by: string | null;
  verified_at: string | null;
  verification_note: string;
  source_assessment_id: string | null;
  source_score: number | null;
  created_at: string;
  updated_at: string;
};

export type NewCommitment = {
  dimension_id: string;
  title: string;
  action: string;
  timeframe: string;
  evidence_plan: string;
  priority: Priority;
  due_date: string | null;
  measure: string;
  baseline_value: number | null;
  target_value: number | null;
  source_assessment_id: string | null;
  source_score: number | null;
};

export type CommitmentUpdateRow = {
  id: string;
  commitment_id: string;
  author_id: string;
  kind: "note" | "manager_note" | "verification" | "evidence";
  body: string;
  created_at: string;
};

export type EvidenceKind = "note" | "link" | "file" | "metric";
export type EvidenceReviewStatus = "pending" | "accepted" | "rejected";
export type EvidenceRow = {
  id: string;
  user_id: string;
  commitment_id: string | null;
  kind: EvidenceKind;
  title: string;
  body: string;
  url: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  metric_value: number | null;
  review_status: EvidenceReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string;
  created_at: string;
};

export type ReviewRow = {
  id: string;
  reviewer_id: string;
  subject_user_id: string;
  assessment_id: string | null;
  notes: string;
  barriers: string;
  support: string;
  action_items: string[];
  follow_up_date: string | null;
  duration_minutes: number;
  status: "scheduled" | "completed" | "cancelled";
  reviewed_at: string;
};

export type ProfileRow = { id: string; full_name: string; email: string };
export type MemberRow = {
  user_id: string;
  role: Role;
  manager_user_id: string | null;
  active: boolean;
};
export type Membership = { organization_id: string; role: Role; manager_user_id: string | null };

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  read_at: string | null;
};

export type AuditRow = {
  id: number;
  at: string;
  actor_id: string | null;
  subject_user_id: string | null;
  table_name: string;
  row_id: string | null;
  op: "INSERT" | "UPDATE" | "DELETE";
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
  changed_columns: string[] | null;
};

/* Report shapes (public.report_* functions) */
export type WeeklyDimensionScore = {
  week_start: string;
  dimension_id: string;
  avg_score: number;
  responses: number;
};
export type SubmissionRate = { week_start: string; submitted: number; expected: number };
export type MemberStatus = {
  user_id: string;
  full_name: string;
  email: string;
  role: Role;
  manager_user_id: string | null;
  active: boolean;
  latest_week: string | null;
  latest_score: number | null;
  previous_score: number | null;
  submitted_current: boolean;
  missed_last_4: number;
  open_commitments: number;
  overdue_commitments: number;
  blocked_commitments: number;
  pending_verification: number;
};
export type CommitmentOutcome = {
  commitment_id: string;
  user_id: string;
  dimension_id: string;
  title: string;
  completed_at: string;
  verification_status: VerificationStatus;
  score_before: number | null;
  score_after: number | null;
  after_week: string | null;
  delta: number | null;
};
