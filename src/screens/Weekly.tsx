import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Spinner,
  Textarea,
} from "../components/ui";
import { ScoreSelector } from "../components/domain";
import { DIMENSION_WORKFLOWS } from "../framework";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { keys, useAssessments, useCycle, useScorecardEntries, useUserId } from "../hooks/queries";
import { formatDate } from "../lib/dates";
import {
  buildWeeklyPayload,
  completedDimensions,
  emptyWeeklyDraft,
  validateWeekly,
  type WeeklyDraft,
} from "../lib/validation";
import { submitWeeklyPosition } from "../services/assessments";
import { errorText } from "../services/supabase";

const draftKey = (userId: string, weekStart: string) => `va-weekly-draft:${userId}:${weekStart}`;

function loadDraft(key: string): WeeklyDraft | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as WeeklyDraft) : null;
  } catch {
    return null;
  }
}

function saveDraft(key: string, draft: WeeklyDraft | null) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable: the form still works, it just cannot keep a draft */
  }
}

export function Weekly() {
  useDocumentTitle("Weekly scorecard");
  const userId = useUserId();
  const queryClient = useQueryClient();
  const cycle = useCycle();
  const assessments = useAssessments(userId);
  const entries = useScorecardEntries(cycle.data?.id, userId);

  const [draft, setDraft] = useState<WeeklyDraft>(emptyWeeklyDraft);
  const [showErrors, setShowErrors] = useState(false);
  const [restored, setRestored] = useState<"none" | "server" | "draft">("none");
  const initialised = useRef(false);

  const weekStart = cycle.data?.week_start;
  const submitted = useMemo(
    () =>
      assessments.data?.find(
        (a) => a.assessment_type === "weekly" && a.period_start === weekStart,
      ) ?? null,
    [assessments.data, weekStart],
  );

  // Initialise once from the server (if already submitted this week) or from a local draft.
  useEffect(() => {
    if (initialised.current || !weekStart || assessments.isPending || entries.isPending) return;
    initialised.current = true;
    if (submitted) {
      const next = emptyWeeklyDraft();
      for (const s of submitted.scores) {
        next.ratings[s.dimensionId] = s.score;
        next.evidence[s.dimensionId] = s.evidence;
      }
      for (const e of entries.data ?? []) {
        next.metrics[e.dimension_id] = Object.fromEntries(
          Object.entries(e.metrics).map(([k, v]) => [k, String(v)]),
        );
      }
      setDraft(next);
      setRestored("server");
      return;
    }
    const local = loadDraft(draftKey(userId, weekStart));
    if (local) {
      setDraft(local);
      setRestored("draft");
    }
  }, [weekStart, assessments.isPending, entries.isPending, entries.data, submitted, userId]);

  // Keep a local draft while editing (debounced).
  useEffect(() => {
    if (!initialised.current || !weekStart) return;
    const t = setTimeout(() => saveDraft(draftKey(userId, weekStart), draft), 500);
    return () => clearTimeout(t);
  }, [draft, userId, weekStart]);

  const errors = useMemo(() => validateWeekly(draft), [draft]);
  const done = useMemo(() => completedDimensions(draft), [draft]);

  const submit = useMutation({
    mutationFn: () => {
      const { scores, entries: payload } = buildWeeklyPayload(draft);
      return submitWeeklyPosition(scores, payload);
    },
    onSuccess: async () => {
      if (weekStart) saveDraft(draftKey(userId, weekStart), null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.assessments(userId) }),
        queryClient.invalidateQueries({ queryKey: ["scorecard"] }),
      ]);
    },
  });

  if (cycle.isPending || assessments.isPending) return <Spinner />;
  if (cycle.isError || assessments.isError)
    return <Alert tone="error">{errorText(cycle.error ?? assessments.error)}</Alert>;

  const closed = cycle.data.status === "closed";
  const firstError = Object.keys(errors)[0];

  const onSubmit = () => {
    setShowErrors(true);
    if (firstError) {
      const el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(firstError)}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
      return;
    }
    submit.mutate();
  };

  const err = (key: string) => (showErrors ? errors[key] : undefined);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly scorecard"
        subtitle={`Week of ${formatDate(cycle.data.week_start)} to ${formatDate(cycle.data.week_end)}. Rate each dimension, record its measures, and back your rating with evidence.`}
        actions={
          submitted ? (
            <Badge tone="ok">Submitted {formatDate(submitted.submitted_at)}</Badge>
          ) : (
            <Badge tone="warn">Not yet submitted</Badge>
          )
        }
      />

      {closed && (
        <Alert tone="warning">
          This weekly cycle is closed. You can review your submission but not change it.
        </Alert>
      )}
      {restored === "draft" && (
        <Alert tone="info">
          We restored the draft you were working on. It is saved on this device until you submit.
        </Alert>
      )}
      {restored === "server" && !closed && (
        <Alert tone="info">
          You already submitted this week. You can amend your answers until the cycle closes.
        </Alert>
      )}
      {submit.isSuccess && (
        <Alert tone="success">
          Your weekly position has been submitted.{" "}
          <Link className="font-semibold underline" to="/commitments">
            Review your commitments
          </Link>{" "}
          or{" "}
          <Link className="font-semibold underline" to="/trends">
            see your trend
          </Link>
          .
        </Alert>
      )}
      {submit.isError && <Alert tone="error">{errorText(submit.error)}</Alert>}
      {showErrors && firstError && (
        <Alert tone="error">
          Some answers are missing or invalid. The first one has been highlighted below.
        </Alert>
      )}

      <div className="space-y-4">
        {DIMENSION_WORKFLOWS.map((d, i) => {
          const complete = !Object.keys(errors).some((k) => k.startsWith(`${d.id}:`));
          return (
            <Card key={d.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                    Dimension {i + 1}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-ink-900">{d.name}</h2>
                  <p className="mt-1 text-sm text-ink-500">{d.weeklyPrompt}</p>
                </div>
                {complete && <Badge tone="ok">Complete</Badge>}
              </div>

              <div className="mt-4" data-field={`${d.id}:rating`} tabIndex={-1}>
                <p className="mb-1.5 text-sm font-semibold text-ink-900">Self-rating (1–5)</p>
                <ScoreSelector
                  name={`weekly-${d.id}`}
                  legend={`${d.name} self-rating`}
                  value={draft.ratings[d.id] ?? 0}
                  error={Boolean(err(`${d.id}:rating`))}
                  onChange={(n) =>
                    !closed && setDraft((v) => ({ ...v, ratings: { ...v.ratings, [d.id]: n } }))
                  }
                />
                {err(`${d.id}:rating`) && (
                  <p className="mt-1 text-xs font-medium text-bad-700">{err(`${d.id}:rating`)}</p>
                )}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {d.scorecardMetrics.map((metric) => (
                  <Field key={metric} label={metric} error={err(`${d.id}:metric:${metric}`)}>
                    {(p) => (
                      <Input
                        {...p}
                        data-field={`${d.id}:metric:${metric}`}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min={0}
                        disabled={closed}
                        value={draft.metrics[d.id]?.[metric] ?? ""}
                        onChange={(e) =>
                          setDraft((v) => ({
                            ...v,
                            metrics: {
                              ...v.metrics,
                              [d.id]: { ...v.metrics[d.id], [metric]: e.target.value },
                            },
                          }))
                        }
                      />
                    )}
                  </Field>
                ))}
              </div>

              <Field
                label="Evidence, variance or reflection"
                className="mt-4"
                error={err(`${d.id}:evidence`)}
              >
                {(p) => (
                  <Textarea
                    {...p}
                    data-field={`${d.id}:evidence`}
                    maxLength={2000}
                    disabled={closed}
                    value={draft.evidence[d.id] ?? ""}
                    onChange={(e) =>
                      setDraft((v) => ({
                        ...v,
                        evidence: { ...v.evidence, [d.id]: e.target.value },
                      }))
                    }
                    placeholder="What happened, what evidence supports your rating, what will you do next?"
                  />
                )}
              </Field>
            </Card>
          );
        })}
      </div>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-line bg-white/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <p className="text-sm text-ink-700" aria-live="polite">
          {done} of 12 dimensions complete
        </p>
        <Button onClick={onSubmit} loading={submit.isPending} disabled={closed}>
          {submitted ? "Update weekly position" : "Submit weekly position"}
        </Button>
      </div>
    </div>
  );
}
