import { DIMENSION_WORKFLOWS } from "../framework";
import type { ScoreItem, ScorecardMetrics } from "../domain";

export type WeeklyDraft = {
  ratings: Record<string, number>;
  evidence: Record<string, string>;
  /** metric values as typed by the user, per dimension */
  metrics: Record<string, Record<string, string>>;
};

export const emptyWeeklyDraft = (): WeeklyDraft => ({ ratings: {}, evidence: {}, metrics: {} });

export function metricError(metric: string, raw: string): string | null {
  const text = raw.trim();
  if (text === "") return "Enter a value.";
  const n = Number(text);
  if (!Number.isFinite(n)) return "Enter a number.";
  if (n < 0) return "Cannot be negative.";
  if (metric.includes("%") && n > 100) return "Cannot exceed 100%.";
  if (/score|indicator/i.test(metric) && n > 5) return "Must be between 0 and 5.";
  return null;
}

/** Field errors keyed by `${dimensionId}:rating|evidence|metric:<name>`. Empty object = valid. */
export function validateWeekly(draft: WeeklyDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const d of DIMENSION_WORKFLOWS) {
    const rating = draft.ratings[d.id];
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      errors[`${d.id}:rating`] = "Choose a rating from 1 to 5.";
    if (!(draft.evidence[d.id] ?? "").trim())
      errors[`${d.id}:evidence`] = "Add evidence or a short reflection.";
    for (const metric of d.scorecardMetrics) {
      const err = metricError(metric, draft.metrics[d.id]?.[metric] ?? "");
      if (err) errors[`${d.id}:metric:${metric}`] = err;
    }
  }
  return errors;
}

export function completedDimensions(draft: WeeklyDraft): number {
  const errors = validateWeekly(draft);
  return DIMENSION_WORKFLOWS.filter(
    (d) => !Object.keys(errors).some((k) => k.startsWith(`${d.id}:`)),
  ).length;
}

export function buildWeeklyPayload(draft: WeeklyDraft) {
  const scores: ScoreItem[] = DIMENSION_WORKFLOWS.map((d) => ({
    dimensionId: d.id,
    score: draft.ratings[d.id],
    evidence: (draft.evidence[d.id] ?? "").trim(),
  }));
  const entries = DIMENSION_WORKFLOWS.map((d) => {
    const metrics: ScorecardMetrics = {};
    for (const metric of d.scorecardMetrics)
      metrics[metric] = Number(draft.metrics[d.id][metric].trim());
    return { dimensionId: d.id, metrics, evidence: (draft.evidence[d.id] ?? "").trim() };
  });
  return { scores, entries };
}

export type BaselineDraft = { ratings: Record<string, number>; evidence: Record<string, string> };

export function validateBaseline(draft: BaselineDraft): string | null {
  const unrated = DIMENSION_WORKFLOWS.filter(
    (d) =>
      !Number.isInteger(draft.ratings[d.id]) || draft.ratings[d.id] < 1 || draft.ratings[d.id] > 5,
  );
  return unrated.length
    ? `Rate all 12 dimensions before submitting (${unrated.length} remaining).`
    : null;
}

export function buildBaselinePayload(draft: BaselineDraft): ScoreItem[] {
  return DIMENSION_WORKFLOWS.map((d) => ({
    dimensionId: d.id,
    score: draft.ratings[d.id],
    evidence: (draft.evidence[d.id] ?? "").trim(),
  }));
}

export type CommitmentFormValues = {
  dimension_id: string;
  title: string;
  action: string;
  timeframe: string;
  evidence_plan: string;
  priority: "low" | "normal" | "high" | "critical";
  due_date: string;
  measure: string;
  baseline_value: string;
  target_value: string;
};

export function validateCommitment(v: CommitmentFormValues, today: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (!v.dimension_id) e.dimension_id = "Choose the dimension this improves.";
  if (v.title.trim().length < 3) e.title = "Give the commitment a short title.";
  if (v.action.trim().length < 5) e.action = "Describe the specific action you will take.";
  if (!v.due_date) e.due_date = "Set a due date.";
  else if (v.due_date < today) e.due_date = "The due date cannot be in the past.";
  const hasB = v.baseline_value.trim() !== "";
  const hasT = v.target_value.trim() !== "";
  if (hasB !== hasT) e.target_value = "Give both a baseline and a target, or neither.";
  if (hasB && !Number.isFinite(Number(v.baseline_value))) e.baseline_value = "Enter a number.";
  if (hasT && !Number.isFinite(Number(v.target_value))) e.target_value = "Enter a number.";
  if (hasB && hasT && Number(v.baseline_value) === Number(v.target_value))
    e.target_value = "The target must differ from the baseline.";
  if ((hasB || hasT) && !v.measure.trim())
    e.measure = "Say what is being measured (e.g. “deadlines met per week”).";
  return e;
}
