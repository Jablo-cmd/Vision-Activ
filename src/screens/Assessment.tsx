import { useState } from "react";
import { DIMENSION_WORKFLOWS, type AssessmentScore } from "../types";
import { Button, Card } from "../components/ui";
import { saveAssessment, getMyOrganization, logAuditEvent } from "../services/data";
export function Assessment({ type }: { type: "baseline" | "weekly" }) {
  const [scores, setScores] = useState<AssessmentScore[]>(
    DIMENSION_WORKFLOWS.map((d) => ({ dimensionId: d.id, score: 0, evidence: "" })),
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setScore = (id: string, score: number) =>
    setScores((p) => p.map((s) => (s.dimensionId === id ? { ...s, score } : s)));
  const setEvidence = (id: string, evidence: string) =>
    setScores((p) => p.map((s) => (s.dimensionId === id ? { ...s, evidence } : s)));
  const submit = async () => {
    setError("");
    setSaved(false);
    setBusy(true);
    if (scores.some((s) => s.score < 1 || s.score > 5)) {
      setError("Rate all 12 dimensions before submitting.");
      setBusy(false);
      return;
    }
    try {
      const org = await getMyOrganization();
      if (!org?.organization_id) throw new Error("Account is not assigned to an organisation.");
      const today = new Date().toISOString().slice(0, 10);
      await saveAssessment(
        {
          id: crypto.randomUUID(),
          userId: "",
          type,
          periodStart: today,
          periodEnd: today,
          scores,
          submittedAt: new Date().toISOString(),
        },
        org.organization_id,
      );
      await logAuditEvent(
        type === "baseline" ? "baseline_assessment_submitted" : "assessment_submitted",
        "assessment",
        null,
        { assessmentType: type, periodStart: today },
      );
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save assessment.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#2563EB]">
          {type === "baseline" ? "Baseline Assessment" : "Weekly Assessment"}
        </h1>
        <p className="mt-2 text-[#64748B]">
          Assess all 12 dimensions using a 1–5 rating, then record evidence or reflection.
        </p>
      </div>
      <Card className="divide-y divide-slate-100">
        {DIMENSION_WORKFLOWS.map((d, index) => {
          const current = scores.find((s) => s.dimensionId === d.id)?.score ?? 0;
          const evidence = scores.find((s) => s.dimensionId === d.id)?.evidence ?? "";
          return (
            <div key={d.id} className="p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-[#60A5FA]">
                    Dimension {index + 1}
                  </div>
                  <h2 className="mt-1 font-bold text-[#2563EB]">{d.name}</h2>
                  <p className="mt-2 text-sm font-medium text-slate-700">{d.weeklyPrompt}</p>
                </div>
                <div className="rounded-lg bg-[#EFF6FF] px-3 py-2 text-sm font-bold">
                  {current ? current : "—"}/5
                </div>
              </div>
              <div className="mt-5 grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    aria-label={d.name + ": " + n + " out of 5"}
                    key={n}
                    type="button"
                    onClick={() => setScore(d.id, n)}
                    className={
                      "rounded-xl border py-3 text-sm font-bold " +
                      (current === n
                        ? "border-[#60A5FA] bg-[#60A5FA] text-white"
                        : "border-slate-200 bg-white hover:border-[#93C5FD]")
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
              <textarea
                aria-label={d.name + " evidence"}
                value={evidence}
                onChange={(e) => setEvidence(d.id, e.target.value)}
                placeholder="Evidence, example, or reflection..."
                className="mt-4 min-h-20 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#2563EB]"
              />
            </div>
          );
        })}
      </Card>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {error && (
          <span role="alert" className="text-sm text-red-600">
            {error}
          </span>
        )}
        <span className="text-sm text-[#64748B]">
          {saved ? "Assessment saved." : "Complete all dimensions before submission."}
        </span>
        <Button
          disabled={busy}
          onClick={submit}
          className="bg-[#60A5FA] text-white hover:bg-[#3B82F6]"
        >
          Submit assessment
        </Button>
      </div>
    </div>
  );
}
