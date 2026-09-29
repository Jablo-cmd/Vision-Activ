/**
 * Pure performance calculations. Everything here is deterministic and independent of the
 * browser's time zone: callers pass calendar dates as 'YYYY-MM-DD' strings.
 */
import { DIMENSION_WORKFLOWS } from "../framework";
import type { AssessmentRow, CommitmentRow, MemberStatus, WeeklyDimensionScore } from "../domain";
import { addDays, diffDays, weekStart } from "./dates";

export type Grain = "week" | "fortnight" | "month" | "quarter" | "halfYear";
export type Period = "week" | "fortnight" | "month" | "quarter" | "halfYear";

export const PERIODS: { key: Period; label: string; weeks: number }[] = [
  { key: "week", label: "Weekly", weeks: 1 },
  { key: "fortnight", label: "Fortnightly", weeks: 2 },
  { key: "month", label: "Monthly", weeks: 4 },
  { key: "quarter", label: "3 months", weeks: 13 },
  { key: "halfYear", label: "6 months", weeks: 26 },
];

export const GRAINS: { key: Grain; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "fortnight", label: "Fortnight" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "halfYear", label: "Half-year" },
];

/** A fixed Monday so fortnights are stable across years. */
const FORTNIGHT_ANCHOR = "1970-01-05";

/** Start date of the bucket containing `date` (buckets are keyed by the week's Monday). */
export function bucketStart(date: string, grain: Grain): string {
  switch (grain) {
    case "week":
      return weekStart(date);
    case "fortnight": {
      const monday = weekStart(date);
      const n = Math.floor(diffDays(monday, FORTNIGHT_ANCHOR) / 14);
      return addDays(FORTNIGHT_ANCHOR, n * 14);
    }
    case "month":
      return `${date.slice(0, 7)}-01`;
    case "quarter": {
      const month = Number(date.slice(5, 7));
      const first = Math.floor((month - 1) / 3) * 3 + 1;
      return `${date.slice(0, 4)}-${String(first).padStart(2, "0")}-01`;
    }
    case "halfYear":
      return `${date.slice(0, 4)}-${Number(date.slice(5, 7)) <= 6 ? "01" : "07"}-01`;
  }
}

export type Window = { start: string; end: string; weeks: number };

/**
 * A reporting window made of whole weekly cycles ending with the week starting `anchorWeek`.
 * offset 0 = the window itself, offset 1 = the immediately preceding window of the same length.
 */
export function periodWindow(anchorWeek: string, period: Period, offset = 0): Window {
  const weeks = PERIODS.find((p) => p.key === period)!.weeks;
  return {
    start: addDays(anchorWeek, -7 * (weeks - 1) - 7 * weeks * offset),
    end: addDays(anchorWeek, 6 - 7 * weeks * offset),
    weeks,
  };
}

/** The week to report on: the latest week that has data, never later than the current week. */
export function anchorWeek(rows: { week_start: string }[], today: string): string {
  const current = weekStart(today);
  let latest: string | null = null;
  for (const r of rows) {
    if (r.week_start <= current && (latest === null || r.week_start > latest))
      latest = r.week_start;
  }
  return latest ?? current;
}

export type DimensionAverage = { dimensionId: string; avg: number | null; responses: number };

const round = (n: number, dp = 2) => Number(n.toFixed(dp));

/** Response-weighted average per dimension for rows inside [start, end]. All 12 dimensions are returned. */
export function dimensionAverages(
  rows: WeeklyDimensionScore[],
  window?: { start: string; end: string },
): DimensionAverage[] {
  const sums = new Map<string, { total: number; n: number }>();
  for (const r of rows) {
    if (window && (r.week_start < window.start || r.week_start > window.end)) continue;
    if (!Number.isFinite(r.avg_score) || r.responses <= 0) continue;
    const s = sums.get(r.dimension_id) ?? { total: 0, n: 0 };
    s.total += r.avg_score * r.responses;
    s.n += r.responses;
    sums.set(r.dimension_id, s);
  }
  return DIMENSION_WORKFLOWS.map((d) => {
    const s = sums.get(d.id);
    return {
      dimensionId: d.id,
      avg: s && s.n > 0 ? round(s.total / s.n) : null,
      responses: s?.n ?? 0,
    };
  });
}

/** Equal-weight mean of the dimensions that have data; null when nothing was scored. */
export function overallScore(avgs: DimensionAverage[]): number | null {
  const scored = avgs.filter((a): a is DimensionAverage & { avg: number } => a.avg !== null);
  if (scored.length === 0) return null;
  return round(scored.reduce((sum, a) => sum + a.avg, 0) / scored.length);
}

/** Change between two possibly-missing scores. A missing side means "no comparison", never zero. */
export function movement(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return round(current - previous);
}

export type Direction = "improving" | "declining" | "stable" | "none";

export function direction(delta: number | null, threshold = 0.15): Direction {
  if (delta === null) return "none";
  if (delta >= threshold) return "improving";
  if (delta <= -threshold) return "declining";
  return "stable";
}

export type TrendPoint = { period: string; score: number | null; responses: number };

/** Overall score per bucket, ascending, only buckets that contain data. */
export function trendSeries(rows: WeeklyDimensionScore[], grain: Grain): TrendPoint[] {
  const buckets = new Map<string, WeeklyDimensionScore[]>();
  for (const r of rows) {
    const key = bucketStart(r.week_start, grain);
    const list = buckets.get(key);
    if (list) list.push(r);
    else buckets.set(key, [r]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, list]) => {
      const avgs = dimensionAverages(list);
      return {
        period,
        score: overallScore(avgs),
        responses: avgs.reduce((n, a) => n + a.responses, 0),
      };
    })
    .filter((p) => p.score !== null);
}

/** Turn a person's own assessments into the same row shape the reports use (1 response each). */
export function assessmentsToRows(assessments: AssessmentRow[]): WeeklyDimensionScore[] {
  const rows: WeeklyDimensionScore[] = [];
  for (const a of assessments) {
    if (a.assessment_type !== "weekly") continue;
    for (const s of a.scores) {
      if (typeof s.score === "number" && s.score >= 1 && s.score <= 5) {
        rows.push({
          week_start: a.period_start,
          dimension_id: s.dimensionId,
          avg_score: s.score,
          responses: 1,
        });
      }
    }
  }
  return rows;
}

/** Lowest-scoring dimensions of an assessment (ties keep framework order). */
export function weakestDimensions(assessment: Pick<AssessmentRow, "scores"> | null, count = 3) {
  if (!assessment) return [];
  const order = new Map(DIMENSION_WORKFLOWS.map((d, i) => [d.id, i]));
  return [...assessment.scores]
    .filter((s) => order.has(s.dimensionId))
    .sort((a, b) => a.score - b.score || order.get(a.dimensionId)! - order.get(b.dimensionId)!)
    .slice(0, count);
}

export function assessmentAverage(assessment: Pick<AssessmentRow, "scores"> | null): number | null {
  if (!assessment || assessment.scores.length === 0) return null;
  const valid = assessment.scores.filter((s) => s.score >= 1 && s.score <= 5);
  if (valid.length === 0) return null;
  return round(valid.reduce((n, s) => n + s.score, 0) / valid.length);
}

/* ---------------------------------------------------------------------------------------------- */
/* Commitments                                                                                     */
/* ---------------------------------------------------------------------------------------------- */

type DueFields = Pick<CommitmentRow, "status" | "due_date">;

export function isOverdue(c: DueFields, today: string): boolean {
  return c.status !== "complete" && c.due_date !== null && c.due_date < today;
}

export type DueState = "complete" | "overdue" | "due_soon" | "on_track" | "no_date";

export function dueState(c: DueFields, today: string, soonDays = 3): DueState {
  if (c.status === "complete") return "complete";
  if (!c.due_date) return "no_date";
  if (c.due_date < today) return "overdue";
  return diffDays(c.due_date, today) <= soonDays ? "due_soon" : "on_track";
}

/**
 * Progress derived from measured values, direction-aware (targets may be below the baseline).
 * Returns null when it cannot be computed.
 */
export function measuredProgress(
  baseline: number | null,
  current: number | null,
  target: number | null,
): number | null {
  if (baseline === null || current === null || target === null || baseline === target) return null;
  const pct = ((current - baseline) / (target - baseline)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function countBy<T>(items: T[], predicate: (item: T) => boolean): number {
  let n = 0;
  for (const i of items) if (predicate(i)) n++;
  return n;
}

/* ---------------------------------------------------------------------------------------------- */
/* People                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

export function attentionReasons(m: MemberStatus): string[] {
  if (!m.active) return [];
  const reasons: string[] = [];
  if (!m.submitted_current && m.missed_last_4 >= 2)
    reasons.push(`Missed ${m.missed_last_4} of the last 4 weeks`);
  if (m.latest_score !== null && m.latest_score <= 2.5)
    reasons.push(`Low score (${m.latest_score.toFixed(1)})`);
  const delta = movement(m.latest_score, m.previous_score);
  if (delta !== null && delta <= -0.5) reasons.push(`Score fell by ${Math.abs(delta).toFixed(1)}`);
  if (m.overdue_commitments > 0) reasons.push(`${m.overdue_commitments} overdue`);
  if (m.blocked_commitments > 0) reasons.push(`${m.blocked_commitments} blocked`);
  return reasons;
}

/* ---------------------------------------------------------------------------------------------- */
/* Export                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

/** RFC 4180 quoting plus protection against spreadsheet formula injection. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
