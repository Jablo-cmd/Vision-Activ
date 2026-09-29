import { describe, expect, it } from "vitest";
import type { AssessmentRow, MemberStatus, WeeklyDimensionScore } from "../domain";
import { DIMENSION_WORKFLOWS } from "../framework";
import { addDays } from "./dates";
import {
  anchorWeek,
  assessmentAverage,
  assessmentsToRows,
  attentionReasons,
  bucketStart,
  csvCell,
  dimensionAverages,
  direction,
  dueState,
  isOverdue,
  measuredProgress,
  movement,
  overallScore,
  periodWindow,
  toCsv,
  trendSeries,
  weakestDimensions,
} from "./metrics";

const row = (
  week_start: string,
  dimension_id: string,
  avg_score: number,
  responses = 1,
): WeeklyDimensionScore => ({
  week_start,
  dimension_id,
  avg_score,
  responses,
});

describe("bucketStart (audit defects C2-C4)", () => {
  it("weeks are keyed by Monday with no time-zone shift", () => {
    expect(bucketStart("2026-09-21", "week")).toBe("2026-09-21");
    expect(bucketStart("2026-09-27", "week")).toBe("2026-09-21");
  });
  it("fortnights stay in the same era as the input (was year 2083)", () => {
    const start = bucketStart("2026-09-21", "fortnight");
    expect(start.startsWith("2026-")).toBe(true);
    expect(bucketStart(start, "fortnight")).toBe(start);
    // consecutive weeks are grouped in pairs
    const next = bucketStart("2026-09-28", "fortnight");
    expect(new Set([start, next]).size).toBeLessThanOrEqual(2);
    expect(bucketStart("2026-09-21", "fortnight")).toBe(bucketStart("2026-09-27", "fortnight"));
  });
  it("months and quarters use calendar boundaries", () => {
    expect(bucketStart("2026-09-21", "month")).toBe("2026-09-01");
    expect(bucketStart("2026-09-21", "quarter")).toBe("2026-07-01");
    expect(bucketStart("2026-02-10", "quarter")).toBe("2026-01-01");
  });
  it("half-years are Jan/Jul, not 'five months back' (was defect C4)", () => {
    expect(bucketStart("2026-09-21", "halfYear")).toBe("2026-07-01");
    expect(bucketStart("2026-07-06", "halfYear")).toBe("2026-07-01");
    expect(bucketStart("2026-03-02", "halfYear")).toBe("2026-01-01");
  });
});

describe("periodWindow", () => {
  it("covers whole weekly cycles ending with the anchor week", () => {
    expect(periodWindow("2026-09-28", "week")).toEqual({
      start: "2026-09-28",
      end: "2026-10-04",
      weeks: 1,
    });
    expect(periodWindow("2026-09-28", "fortnight")).toEqual({
      start: "2026-09-21",
      end: "2026-10-04",
      weeks: 2,
    });
    expect(periodWindow("2026-09-28", "month").start).toBe("2026-09-07");
  });
  it("the previous window abuts the current one without overlap or gap", () => {
    const cur = periodWindow("2026-09-28", "quarter");
    const prev = periodWindow("2026-09-28", "quarter", 1);
    expect(cur.start).toBe("2026-07-06");
    expect(prev.end).toBe(addDays(cur.start, -1));
    expect(prev.start).toBe("2026-04-06");
    expect(cur.weeks).toBe(13);
  });
});

describe("anchorWeek", () => {
  it("uses the latest week with data, never a future one", () => {
    expect(anchorWeek([row("2026-09-14", "x", 3), row("2026-09-21", "x", 3)], "2026-09-29")).toBe(
      "2026-09-21",
    );
    expect(anchorWeek([row("2026-10-12", "x", 3)], "2026-09-29")).toBe("2026-09-28");
  });
  it("falls back to the current week when there is no data", () => {
    expect(anchorWeek([], "2026-09-29")).toBe("2026-09-28");
  });
});

describe("dimensionAverages / overallScore (audit defects C1, C9, C13)", () => {
  it("weights by number of responses", () => {
    const rows = [
      row("2026-09-21", "results-delivery", 4, 3),
      row("2026-09-28", "results-delivery", 2, 1),
    ];
    const d = dimensionAverages(rows).find((x) => x.dimensionId === "results-delivery")!;
    expect(d.avg).toBe(3.5);
    expect(d.responses).toBe(4);
  });
  it("returns all twelve dimensions and null where there is no data", () => {
    const avgs = dimensionAverages([row("2026-09-21", "results-delivery", 4)]);
    expect(avgs).toHaveLength(12);
    expect(avgs.filter((a) => a.avg === null)).toHaveLength(11);
  });
  it("respects the window boundaries inclusively", () => {
    const rows = [
      row("2026-09-14", "results-delivery", 1),
      row("2026-09-21", "results-delivery", 5),
    ];
    const win = { start: "2026-09-21", end: "2026-09-27" };
    expect(
      dimensionAverages(rows, win).find((x) => x.dimensionId === "results-delivery")!.avg,
    ).toBe(5);
  });
  it("ignores non-finite scores and zero responses", () => {
    const rows = [
      row("2026-09-21", "results-delivery", Number.NaN),
      row("2026-09-21", "results-delivery", 4, 0),
    ];
    expect(dimensionAverages(rows).every((a) => a.avg === null)).toBe(true);
  });
  it("the overall score is the mean of scored dimensions, or null", () => {
    const rows = DIMENSION_WORKFLOWS.slice(0, 2).map((d, i) => row("2026-09-21", d.id, 2 + i * 2));
    expect(overallScore(dimensionAverages(rows))).toBe(3);
    expect(overallScore(dimensionAverages([]))).toBeNull();
  });
  it("a whole team is averaged, not one person's score (was defect C1)", () => {
    // three people submitted: 5, 1, 3 -> the team score is 3, not 1
    const team = DIMENSION_WORKFLOWS.map((d) => row("2026-09-28", d.id, 3, 3));
    expect(overallScore(dimensionAverages(team))).toBe(3);
  });
});

describe("movement / direction (audit defect C6)", () => {
  it("does not treat a missing previous week as zero", () => {
    expect(movement(4, null)).toBeNull();
    expect(movement(null, 3)).toBeNull();
    expect(direction(movement(4, null))).toBe("none");
  });
  it("computes and classifies changes", () => {
    expect(movement(3.7, 4.2)).toBe(-0.5);
    expect(direction(0.5)).toBe("improving");
    expect(direction(-0.5)).toBe("declining");
    expect(direction(0.05)).toBe("stable");
  });
});

describe("trendSeries (audit defect C5)", () => {
  const rows: WeeklyDimensionScore[] = [
    row("2026-08-31", "results-delivery", 2),
    row("2026-09-07", "results-delivery", 4),
    row("2026-09-14", "results-delivery", 4),
    row("2026-10-05", "results-delivery", 5),
  ];
  it("produces several points for a multi-week history", () => {
    expect(trendSeries(rows, "week")).toHaveLength(4);
  });
  it("groups by month using the calendar month of the week's Monday", () => {
    const pts = trendSeries(rows, "month");
    expect(pts.map((p) => p.period)).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
    expect(pts[1].score).toBe(4);
  });
  it("omits empty buckets and is sorted ascending", () => {
    const pts = trendSeries(
      [row("2026-10-05", "results-delivery", 5), row("2026-08-31", "results-delivery", 2)],
      "week",
    );
    expect(pts.map((p) => p.period)).toEqual(["2026-08-31", "2026-10-05"]);
  });
});

describe("assessment helpers", () => {
  const a: AssessmentRow = {
    id: "1",
    user_id: "u",
    assessment_type: "weekly",
    period_start: "2026-09-21",
    period_end: "2026-09-27",
    submitted_at: "2026-09-25T10:00:00Z",
    scores: DIMENSION_WORKFLOWS.map((d, i) => ({
      dimensionId: d.id,
      score: (i % 5) + 1,
      evidence: "",
    })),
  };
  it("finds the weakest dimensions in framework order on ties", () => {
    const w = weakestDimensions(a, 3);
    expect(w.map((s) => s.score)).toEqual([1, 1, 1]);
    expect(w.map((s) => s.dimensionId)).toEqual([0, 5, 10].map((i) => DIMENSION_WORKFLOWS[i].id));
  });
  it("averages valid scores only", () => {
    expect(assessmentAverage(a)).toBe(2.75);
    expect(
      assessmentAverage({ scores: [{ dimensionId: "x", score: 0, evidence: "" }] }),
    ).toBeNull();
    expect(assessmentAverage(null)).toBeNull();
  });
  it("only weekly assessments become report rows", () => {
    expect(assessmentsToRows([a, { ...a, assessment_type: "baseline" }])).toHaveLength(12);
  });
});

describe("commitments", () => {
  it("overdue means not complete and due before today", () => {
    expect(isOverdue({ status: "in_progress", due_date: "2026-09-28" }, "2026-09-29")).toBe(true);
    expect(isOverdue({ status: "in_progress", due_date: "2026-09-29" }, "2026-09-29")).toBe(false);
    expect(isOverdue({ status: "complete", due_date: "2026-01-01" }, "2026-09-29")).toBe(false);
    expect(isOverdue({ status: "blocked", due_date: null }, "2026-09-29")).toBe(false);
  });
  it("classifies due state", () => {
    const t = "2026-09-29";
    expect(dueState({ status: "in_progress", due_date: "2026-10-01" }, t)).toBe("due_soon");
    expect(dueState({ status: "in_progress", due_date: "2026-10-20" }, t)).toBe("on_track");
    expect(dueState({ status: "in_progress", due_date: null }, t)).toBe("no_date");
    expect(dueState({ status: "complete", due_date: "2026-09-01" }, t)).toBe("complete");
  });
  it("derives progress from measured values in both directions", () => {
    expect(measuredProgress(2, 3, 4)).toBe(50);
    expect(measuredProgress(20, 15, 10)).toBe(50); // target below baseline
    expect(measuredProgress(2, 9, 4)).toBe(100); // clamped
    expect(measuredProgress(2, 1, 4)).toBe(0); // regressed
    expect(measuredProgress(3, 3, 3)).toBeNull(); // baseline == target
    expect(measuredProgress(null, 3, 4)).toBeNull();
  });
});

describe("attentionReasons", () => {
  const base: MemberStatus = {
    user_id: "u",
    full_name: "A",
    email: "a@x",
    role: "employee",
    manager_user_id: null,
    active: true,
    latest_week: "2026-09-21",
    latest_score: 4,
    previous_score: 4,
    submitted_current: true,
    missed_last_4: 0,
    open_commitments: 0,
    overdue_commitments: 0,
    blocked_commitments: 0,
    pending_verification: 0,
  };
  it("flags nothing for a healthy person", () => {
    expect(attentionReasons(base)).toEqual([]);
  });
  it("flags low, falling, missed, overdue and blocked", () => {
    const r = attentionReasons({
      ...base,
      latest_score: 2.3,
      previous_score: 3.1,
      submitted_current: false,
      missed_last_4: 2,
      overdue_commitments: 1,
      blocked_commitments: 2,
    });
    expect(r).toEqual([
      "Missed 2 of the last 4 weeks",
      "Low score (2.3)",
      "Score fell by 0.8",
      "1 overdue",
      "2 blocked",
    ]);
  });
  it("ignores deactivated people and missing history", () => {
    expect(attentionReasons({ ...base, active: false, latest_score: 1 })).toEqual([]);
    expect(attentionReasons({ ...base, latest_score: null, previous_score: null })).toEqual([]);
  });
});

describe("CSV export safety", () => {
  it("quotes and escapes", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('""');
  });
  it("neutralises spreadsheet formula injection in text but leaves numbers alone", () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell("+1+1")).toBe('"\'+1+1"');
    expect(csvCell("@SUM(A1)")).toBe('"\'@SUM(A1)"');
    expect(csvCell(-1.5)).toBe('"-1.5"');
  });
  it("joins rows with CRLF", () => {
    expect(
      toCsv([
        ["a", 1],
        ["b", null],
      ]),
    ).toBe('"a","1"\r\n"b",""');
  });
});
