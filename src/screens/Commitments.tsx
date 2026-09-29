import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CommitmentCard } from "../components/CommitmentCard";
import { PRIORITY_OPTIONS, ScoreValue, dimensionName } from "../components/domain";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import type { CommitmentRow, NewCommitment, Priority } from "../domain";
import { DIMENSION_WORKFLOWS } from "../framework";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { keys, useAssessments, useMyCommitments, useUserId } from "../hooks/queries";
import { orgToday } from "../lib/dates";
import { weakestDimensions } from "../lib/metrics";
import { validateCommitment, type CommitmentFormValues } from "../lib/validation";
import { createCommitment } from "../services/commitments";
import { errorText } from "../services/supabase";

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "blocked", label: "Blocked" },
  { key: "pending", label: "Awaiting verification" },
  { key: "complete", label: "Complete" },
  { key: "all", label: "All" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function matches(c: CommitmentRow, f: FilterKey): boolean {
  switch (f) {
    case "open":
      return c.status !== "complete";
    case "blocked":
      return c.status === "blocked";
    case "pending":
      return c.verification_status === "pending";
    case "complete":
      return c.status === "complete";
    default:
      return true;
  }
}

const blankForm = (dimension = ""): CommitmentFormValues => ({
  dimension_id: dimension,
  title: "",
  action: "",
  timeframe: "",
  evidence_plan: "",
  priority: "normal",
  due_date: "",
  measure: "",
  baseline_value: "",
  target_value: "",
});

export function Commitments() {
  useDocumentTitle("Commitments");
  const userId = useUserId();
  const { membership } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const commitments = useMyCommitments();
  const assessments = useAssessments(userId);

  const presetDimension = params.get("dimension") ?? "";
  const validPreset = DIMENSION_WORKFLOWS.some((d) => d.id === presetDimension)
    ? presetDimension
    : "";
  const [showForm, setShowForm] = useState(Boolean(validPreset));
  const [form, setForm] = useState<CommitmentFormValues>(blankForm(validPreset));
  const [showErrors, setShowErrors] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("open");
  const today = orgToday();

  // The assessment the commitment is created from: the most recent one (weekly or baseline).
  const latest = assessments.data?.[0] ?? null;
  const weak = useMemo(() => weakestDimensions(latest, 3), [latest]);
  const scoreFor = (dimensionId: string) =>
    latest?.scores.find((s) => s.dimensionId === dimensionId)?.score ?? null;
  const errors = validateCommitment(form, today);
  const err = (k: string) => (showErrors ? errors[k] : undefined);

  const create = useMutation({
    mutationFn: () => {
      const score = scoreFor(form.dimension_id);
      const input: NewCommitment = {
        dimension_id: form.dimension_id,
        title: form.title.trim(),
        action: form.action.trim(),
        timeframe: form.timeframe.trim(),
        evidence_plan: form.evidence_plan.trim(),
        priority: form.priority,
        due_date: form.due_date || null,
        measure: form.measure.trim(),
        baseline_value: form.baseline_value.trim() === "" ? null : Number(form.baseline_value),
        target_value: form.target_value.trim() === "" ? null : Number(form.target_value),
        source_assessment_id: latest && score !== null ? latest.id : null,
        source_score: score,
      };
      return createCommitment(input, membership!.organization_id);
    },
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: keys.myCommitments });
      navigate(`/commitments/${row.id}`);
    },
  });

  const open = (dimension = "") => {
    setForm(blankForm(dimension));
    setShowErrors(false);
    setShowForm(true);
  };

  const close = () => {
    setShowForm(false);
    if (params.has("dimension")) {
      params.delete("dimension");
      setParams(params, { replace: true });
    }
  };

  const submit = () => {
    setShowErrors(true);
    if (Object.keys(errors).length === 0) create.mutate();
  };

  if (commitments.isPending || assessments.isPending) return <Spinner />;
  if (commitments.isError) return <Alert tone="error">{errorText(commitments.error)}</Alert>;

  const all = commitments.data;
  const visible = all.filter((c) => matches(c, filter));
  const dimensionsWithOpen = new Set(
    all.filter((c) => c.status !== "complete").map((c) => c.dimension_id),
  );
  const suggestions = weak.filter((w) => !dimensionsWithOpen.has(w.dimensionId) && w.score <= 3);
  const sourceScore = form.dimension_id ? scoreFor(form.dimension_id) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personal Improvement Commitment Charter"
        subtitle="Turn a weakness you identified into a measurable commitment with a target, a deadline and the evidence you will show."
        actions={
          !showForm && (
            <Button onClick={() => open()}>
              <Plus size={16} aria-hidden="true" /> New commitment
            </Button>
          )
        }
      />

      {suggestions.length > 0 && !showForm && (
        <Card className="border-brand-200 bg-brand-50 p-4">
          <h2 className="font-semibold text-brand-900">Suggested from your latest assessment</h2>
          <p className="mt-1 text-sm text-brand-900">
            These are your lowest-scoring dimensions without an open commitment.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <li key={s.dimensionId}>
                <Button variant="secondary" size="sm" onClick={() => open(s.dimensionId)}>
                  {dimensionName(s.dimensionId)} <ScoreValue score={s.score} />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {showForm && (
        <Card className="p-5">
          <h2 className="text-lg font-semibold text-ink-900">New commitment</h2>
          {create.isError && (
            <div className="mt-3">
              <Alert tone="error">{errorText(create.error)}</Alert>
            </div>
          )}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Dimension to improve" error={err("dimension_id")}>
              {(p) => (
                <Select
                  {...p}
                  value={form.dimension_id}
                  onChange={(e) => setForm({ ...form, dimension_id: e.target.value })}
                >
                  <option value="">Select a dimension</option>
                  {DIMENSION_WORKFLOWS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="self-end text-sm text-ink-700">
              {sourceScore !== null && latest ? (
                <p>
                  Your latest score here is <ScoreValue score={sourceScore} /> — recorded as the
                  starting point for this commitment.
                </p>
              ) : (
                <p className="text-ink-500">
                  Submit an assessment first so improvement can be measured against a score.
                </p>
              )}
            </div>
            <Field label="Title" error={err("title")} className="md:col-span-2">
              {(p) => (
                <Input
                  {...p}
                  maxLength={120}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              )}
            </Field>
            <Field
              label="Specific action"
              hint={DIMENSION_WORKFLOWS.find((d) => d.id === form.dimension_id)?.piccPrompt}
              error={err("action")}
              className="md:col-span-2"
            >
              {(p) => (
                <Textarea
                  {...p}
                  maxLength={1000}
                  value={form.action}
                  onChange={(e) => setForm({ ...form, action: e.target.value })}
                />
              )}
            </Field>
            <Field label="Due date" error={err("due_date")}>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  min={today}
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              )}
            </Field>
            <Field label="Priority">
              {(p) => (
                <Select
                  {...p}
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
                >
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label="What will you measure? (optional)"
              hint="For example: deadlines met per week"
              error={err("measure")}
              className="md:col-span-2"
            >
              {(p) => (
                <Input
                  {...p}
                  maxLength={80}
                  value={form.measure}
                  onChange={(e) => setForm({ ...form, measure: e.target.value })}
                />
              )}
            </Field>
            <Field label="Baseline value" error={err("baseline_value")}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={form.baseline_value}
                  onChange={(e) => setForm({ ...form, baseline_value: e.target.value })}
                />
              )}
            </Field>
            <Field label="Target value" error={err("target_value")}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={form.target_value}
                  onChange={(e) => setForm({ ...form, target_value: e.target.value })}
                />
              )}
            </Field>
            <Field label="Timeframe (optional)" className="md:col-span-2">
              {(p) => (
                <Input
                  {...p}
                  maxLength={80}
                  value={form.timeframe}
                  onChange={(e) => setForm({ ...form, timeframe: e.target.value })}
                  placeholder="e.g. Next 4 weeks"
                />
              )}
            </Field>
            <Field
              label="Evidence you will provide"
              hint="What will prove the improvement to your manager?"
              className="md:col-span-2"
            >
              {(p) => (
                <Textarea
                  {...p}
                  maxLength={1000}
                  value={form.evidence_plan}
                  onChange={(e) => setForm({ ...form, evidence_plan: e.target.value })}
                />
              )}
            </Field>
          </div>
          <div className="mt-5 flex gap-3">
            <Button onClick={submit} loading={create.isPending}>
              Create commitment
            </Button>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <div role="group" aria-label="Filter commitments" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={
              "rounded-lg border px-3 py-1.5 text-sm font-semibold " +
              (filter === f.key
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-line bg-white text-brand-800 hover:bg-brand-50")
            }
          >
            {f.label} ({all.filter((c) => matches(c, f.key)).length})
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={all.length === 0 ? "No commitments yet" : "Nothing matches this filter"}
          action={
            all.length === 0 && !showForm ? (
              <Button onClick={() => open()}>Create your first commitment</Button>
            ) : undefined
          }
        >
          {all.length === 0
            ? "Commitments turn your assessment results into measurable actions."
            : "Try another filter."}
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {visible.map((c) => (
            <CommitmentCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}
