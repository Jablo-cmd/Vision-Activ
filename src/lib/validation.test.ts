import { describe, expect, it } from "vitest";
import { DIMENSION_WORKFLOWS } from "../framework";
import {
  buildWeeklyPayload,
  completedDimensions,
  emptyWeeklyDraft,
  metricError,
  validateBaseline,
  validateCommitment,
  validateWeekly,
  type CommitmentFormValues,
  type WeeklyDraft,
} from "./validation";

const fullDraft = (): WeeklyDraft => {
  const d = emptyWeeklyDraft();
  for (const dim of DIMENSION_WORKFLOWS) {
    d.ratings[dim.id] = 4;
    d.evidence[dim.id] = "did the thing";
    d.metrics[dim.id] = Object.fromEntries(dim.scorecardMetrics.map((m) => [m, "1"]));
  }
  return d;
};

describe("weekly validation", () => {
  it("accepts a complete draft", () => {
    expect(validateWeekly(fullDraft())).toEqual({});
    expect(completedDimensions(fullDraft())).toBe(12);
  });
  it("reports every missing field for an empty draft", () => {
    const errors = validateWeekly(emptyWeeklyDraft());
    expect(errors["accountability-ownership:rating"]).toBeDefined();
    expect(errors["accountability-ownership:evidence"]).toBeDefined();
    expect(errors["accountability-ownership:metric:Proactive actions"]).toBeDefined();
    expect(completedDimensions(emptyWeeklyDraft())).toBe(0);
  });
  it("counts partially completed dimensions correctly", () => {
    const d = fullDraft();
    d.ratings["results-delivery"] = 0;
    expect(completedDimensions(d)).toBe(11);
  });
  it("mirrors the database metric rules", () => {
    expect(metricError("Proactive actions", "")).toBe("Enter a value.");
    expect(metricError("Proactive actions", "abc")).toBe("Enter a number.");
    expect(metricError("Proactive actions", "-1")).toBe("Cannot be negative.");
    expect(metricError("Efficiency gain %", "101")).toBe("Cannot exceed 100%.");
    expect(metricError("Efficiency gain %", "100")).toBeNull();
    expect(metricError("Stakeholder feedback score", "5.5")).toBe("Must be between 0 and 5.");
    expect(metricError("Client satisfaction indicator", "4.5")).toBeNull();
  });
  it("builds numeric payloads and trims text", () => {
    const d = fullDraft();
    d.evidence["results-delivery"] = "  padded  ";
    d.metrics["results-delivery"]["Deadlines met"] = " 12 ";
    const { scores, entries } = buildWeeklyPayload(d);
    expect(scores).toHaveLength(12);
    expect(scores.find((s) => s.dimensionId === "results-delivery")!.evidence).toBe("padded");
    expect(
      entries.find((e) => e.dimensionId === "results-delivery")!.metrics["Deadlines met"],
    ).toBe(12);
  });
});

describe("baseline validation", () => {
  it("requires all twelve ratings", () => {
    expect(validateBaseline({ ratings: {}, evidence: {} })).toMatch(/12 remaining/);
    const ratings = Object.fromEntries(DIMENSION_WORKFLOWS.map((d) => [d.id, 3]));
    expect(validateBaseline({ ratings, evidence: {} })).toBeNull();
    expect(
      validateBaseline({ ratings: { ...ratings, "results-delivery": 6 }, evidence: {} }),
    ).toMatch(/1 remaining/);
  });
});

describe("commitment validation", () => {
  const ok: CommitmentFormValues = {
    dimension_id: "results-delivery",
    title: "Hit deadlines",
    action: "Plan every Monday",
    timeframe: "",
    evidence_plan: "",
    priority: "normal",
    due_date: "2026-10-30",
    measure: "",
    baseline_value: "",
    target_value: "",
  };
  const today = "2026-09-29";
  it("accepts a minimal valid commitment", () => {
    expect(validateCommitment(ok, today)).toEqual({});
  });
  it("rejects past due dates and missing fields", () => {
    expect(validateCommitment({ ...ok, due_date: "2026-09-28" }, today).due_date).toMatch(/past/);
    expect(validateCommitment({ ...ok, due_date: "" }, today).due_date).toBeDefined();
    expect(validateCommitment({ ...ok, title: "x" }, today).title).toBeDefined();
    expect(validateCommitment({ ...ok, action: "" }, today).action).toBeDefined();
  });
  it("allows today as a due date", () => {
    expect(validateCommitment({ ...ok, due_date: today }, today).due_date).toBeUndefined();
  });
  it("requires baseline and target together, different, with a measure", () => {
    expect(validateCommitment({ ...ok, baseline_value: "2" }, today).target_value).toBeDefined();
    expect(
      validateCommitment({ ...ok, baseline_value: "2", target_value: "2", measure: "m" }, today)
        .target_value,
    ).toMatch(/differ/);
    expect(
      validateCommitment({ ...ok, baseline_value: "2", target_value: "4" }, today).measure,
    ).toBeDefined();
    expect(
      validateCommitment({ ...ok, baseline_value: "2", target_value: "4", measure: "m" }, today),
    ).toEqual({});
  });
});
