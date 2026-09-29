import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
  Textarea,
  Field,
} from "../components/ui";
import { ScoreSelector, ScoreValue, dimensionName } from "../components/domain";
import { DIMENSION_WORKFLOWS } from "../framework";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { keys, useAssessments, useUserId } from "../hooks/queries";
import { assessmentAverage, weakestDimensions } from "../lib/metrics";
import { buildBaselinePayload, validateBaseline } from "../lib/validation";
import { formatDate } from "../lib/dates";
import { submitBaseline } from "../services/assessments";
import { errorText } from "../services/supabase";

export function Baseline() {
  useDocumentTitle("Baseline assessment");
  const userId = useUserId();
  const queryClient = useQueryClient();
  const assessments = useAssessments(userId);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  const existing = useMemo(
    () => assessments.data?.find((a) => a.assessment_type === "baseline") ?? null,
    [assessments.data],
  );

  const submit = useMutation({
    mutationFn: () => submitBaseline(buildBaselinePayload({ ratings, evidence })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.assessments(userId) }),
  });

  if (assessments.isPending) return <Spinner />;
  if (assessments.isError) return <Alert tone="error">{errorText(assessments.error)}</Alert>;

  if (existing) {
    const weak = weakestDimensions(existing, 3);
    return (
      <div className="space-y-6">
        <PageHeader
          title="Baseline assessment"
          subtitle={`Submitted on ${formatDate(existing.submitted_at)}. Your baseline is the fixed starting point that later progress is measured against.`}
          actions={<Badge tone="ok">Submitted</Badge>}
        />
        {submit.isSuccess && (
          <Alert tone="success">
            Baseline saved. Next, turn your weakest dimensions into commitments:{" "}
            {weak.map((w, i) => (
              <span key={w.dimensionId}>
                {i > 0 && ", "}
                <Link
                  className="font-semibold underline"
                  to={`/commitments?dimension=${w.dimensionId}`}
                >
                  {dimensionName(w.dimensionId)}
                </Link>
              </span>
            ))}
            .
          </Alert>
        )}
        <Card className="p-5">
          <p className="text-sm text-ink-500">Overall baseline score</p>
          <p className="mt-1">
            <ScoreValue score={assessmentAverage(existing)} className="text-2xl" />
          </p>
        </Card>
        <Card className="divide-y divide-line">
          {existing.scores.map((s) => (
            <div
              key={s.dimensionId}
              className="flex flex-col gap-1 p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div>
                <h2 className="font-semibold text-ink-900">{dimensionName(s.dimensionId)}</h2>
                {s.evidence && <p className="mt-1 text-sm text-ink-500">{s.evidence}</p>}
              </div>
              <ScoreValue score={s.score} />
            </div>
          ))}
        </Card>
      </div>
    );
  }

  const remaining = DIMENSION_WORKFLOWS.filter((d) => !ratings[d.id]).length;

  const onSubmit = () => {
    const problem = validateBaseline({ ratings, evidence });
    setFormError(problem ?? "");
    if (!problem) submit.mutate();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Baseline assessment"
        subtitle="Rate yourself honestly on all 12 dimensions (1 = significant development needed, 5 = role model). This is submitted once and becomes your starting point."
      />
      {(formError || submit.isError) && (
        <Alert tone="error">{formError || errorText(submit.error)}</Alert>
      )}
      <div className="space-y-4">
        {DIMENSION_WORKFLOWS.map((d, i) => (
          <Card key={d.id} className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
              Dimension {i + 1}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-ink-900">{d.name}</h2>
            <p className="mt-1 text-sm text-ink-500">{d.weeklyPrompt}</p>
            <div className="mt-4">
              <ScoreSelector
                name={`baseline-${d.id}`}
                legend={`${d.name} rating`}
                value={ratings[d.id] ?? 0}
                onChange={(n) => setRatings((r) => ({ ...r, [d.id]: n }))}
              />
            </div>
            <Field label="Evidence or reflection (optional)" className="mt-4">
              {(p) => (
                <Textarea
                  {...p}
                  value={evidence[d.id] ?? ""}
                  maxLength={2000}
                  onChange={(e) => setEvidence((v) => ({ ...v, [d.id]: e.target.value }))}
                  placeholder="An example that supports your rating…"
                />
              )}
            </Field>
          </Card>
        ))}
      </div>
      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-line bg-white/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <p className="text-sm text-ink-700" aria-live="polite">
          {remaining === 0
            ? "All 12 dimensions rated."
            : `${12 - remaining} of 12 dimensions rated.`}
        </p>
        <Button onClick={onSubmit} loading={submit.isPending}>
          Submit baseline
        </Button>
      </div>
      {!assessments.data?.length && (
        <EmptyState title="First time here?">
          Your baseline is the reference point for every later comparison, so take a few minutes
          over it.
        </EmptyState>
      )}
    </div>
  );
}
