import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ScoreValue, dimensionName } from "../components/domain";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Badge,
  PageHeader,
  SectionTitle,
  Select,
  Spinner,
  Textarea,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { nameOf, useDirectory, useIsManagement } from "../hooks/queries";
import { formatDate, orgToday } from "../lib/dates";
import { listAssessments } from "../services/assessments";
import { listTeamCommitments } from "../services/commitments";
import { createReview, listReviews } from "../services/reviews";
import { errorText } from "../services/supabase";

function NewReview() {
  const { user, membership } = useAuth();
  const qc = useQueryClient();
  const directory = useDirectory();
  const [params] = useSearchParams();
  const [subject, setSubject] = useState(params.get("subject") ?? "");
  const [assessmentId, setAssessmentId] = useState("");
  const [notes, setNotes] = useState("");
  const [barriers, setBarriers] = useState("");
  const [support, setSupport] = useState("");
  const [actions, setActions] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState("");
  const today = orgToday();

  const people = (directory.data ?? []).filter(
    (p) => p.role && p.active && p.id !== user?.id && p.id !== membership?.manager_user_id,
  );
  const assessments = useQuery({
    queryKey: ["assessments", subject],
    queryFn: () => listAssessments(subject, 30),
    enabled: Boolean(subject),
  });
  const commitments = useQuery({
    queryKey: ["team-commitments", "review", subject],
    queryFn: () => listTeamCommitments({ userId: subject, pageSize: 50 }),
    enabled: Boolean(subject),
  });
  const selected = assessments.data?.find((a) => a.id === assessmentId) ?? null;
  const discuss = useMemo(
    () =>
      (commitments.data?.rows ?? []).filter(
        (c) =>
          c.status === "blocked" ||
          c.verification_status === "pending" ||
          (c.status !== "complete" && c.due_date !== null && c.due_date < today),
      ),
    [commitments.data, today],
  );

  const save = useMutation({
    mutationFn: () =>
      createReview(
        {
          subjectUserId: subject,
          assessmentId: assessmentId || null,
          notes: notes.trim(),
          barriers: barriers.trim(),
          support: support.trim(),
          actionItems: actions
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean),
          followUpDate: followUp || null,
        },
        membership!.organization_id,
      ),
    onSuccess: () => {
      setDone(true);
      void qc.invalidateQueries({ queryKey: ["reviews"] });
    },
  });

  const submit = () => {
    if (!subject) return setProblem("Choose the person you are reviewing.");
    if (!notes.trim()) return setProblem("Record what changed since the last review.");
    if (followUp && followUp < today)
      return setProblem("The follow-up date cannot be in the past.");
    setProblem("");
    save.mutate();
  };

  const reset = () => {
    setDone(false);
    setNotes("");
    setBarriers("");
    setSupport("");
    setActions("");
    setFollowUp("");
    setAssessmentId("");
    save.reset();
  };

  if (done) {
    return (
      <Card className="space-y-3 p-6">
        <Alert tone="success">
          Review recorded for {nameOf(directory.data, subject)}. They can now see it.
        </Alert>
        <Button variant="secondary" onClick={reset}>
          Record another review
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {(problem || save.isError) && <Alert tone="error">{problem || errorText(save.error)}</Alert>}
      <Card className="grid gap-4 p-5 md:grid-cols-2">
        <Field label="Person">
          {(p) => (
            <Select
              {...p}
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setAssessmentId("");
              }}
            >
              <option value="">Select a person</option>
              {people.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name || d.email}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Assessment to review (optional)">
          {(p) => (
            <Select
              {...p}
              value={assessmentId}
              disabled={!subject}
              onChange={(e) => setAssessmentId(e.target.value)}
            >
              <option value="">None</option>
              {assessments.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.assessment_type === "baseline" ? "Baseline" : "Weekly"} ·{" "}
                  {formatDate(a.period_start)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Card>

      {selected && (
        <Card className="p-5">
          <SectionTitle>Evidence behind the scores</SectionTitle>
          <ul className="mt-3 divide-y divide-line">
            {selected.scores.map((s) => (
              <li
                key={s.dimensionId}
                className="flex items-start justify-between gap-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-ink-900">{dimensionName(s.dimensionId)}</p>
                  <p className="whitespace-pre-wrap text-ink-500">
                    {s.evidence || "No evidence provided."}
                  </p>
                </div>
                <ScoreValue score={s.score} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {discuss.length > 0 && (
        <Card className="p-5">
          <SectionTitle>To discuss</SectionTitle>
          <ul className="mt-3 space-y-1 text-sm text-ink-700">
            {discuss.map((c) => (
              <li key={c.id}>
                • {c.title} —{" "}
                {c.status === "blocked"
                  ? `blocked (${c.blocker})`
                  : c.verification_status === "pending"
                    ? "awaiting your verification"
                    : "overdue"}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="grid gap-4 p-5">
        <Field label="What changed since the last review?">
          {(p) => (
            <Textarea
              {...p}
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
        <Field label="Barriers affecting performance">
          {(p) => (
            <Textarea
              {...p}
              maxLength={4000}
              value={barriers}
              onChange={(e) => setBarriers(e.target.value)}
            />
          )}
        </Field>
        <Field label="Support or decisions required">
          {(p) => (
            <Textarea
              {...p}
              maxLength={4000}
              value={support}
              onChange={(e) => setSupport(e.target.value)}
            />
          )}
        </Field>
        <Field label="Action items" hint="One per line.">
          {(p) => (
            <Textarea
              {...p}
              maxLength={4000}
              value={actions}
              onChange={(e) => setActions(e.target.value)}
            />
          )}
        </Field>
        <Field label="Follow-up date" className="sm:w-60">
          {(p) => (
            <Input
              {...p}
              type="date"
              min={today}
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
            />
          )}
        </Field>
        <div>
          <Button loading={save.isPending} onClick={submit}>
            Record review
          </Button>
        </div>
      </Card>
    </div>
  );
}

function History() {
  const { user } = useAuth();
  const directory = useDirectory();
  const q = useQuery({ queryKey: ["reviews"], queryFn: listReviews });
  if (q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="error">{errorText(q.error)}</Alert>;
  if (q.data.length === 0) {
    return (
      <EmptyState title="No reviews yet">
        Reviews you hold, or that others record about you, appear here.
      </EmptyState>
    );
  }
  return (
    <ul className="space-y-3">
      {q.data.map((r) => (
        <li key={r.id}>
          <Card className="p-4">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-500">
              {r.status === "scheduled" && <Badge tone="brand">Scheduled</Badge>}
              {r.status === "cancelled" && <Badge tone="neutral">Cancelled</Badge>}
              <span>
                {formatDate(r.reviewed_at.slice(0, 10))} ·{" "}
                {r.subject_user_id === user?.id
                  ? "About you"
                  : `About ${nameOf(directory.data, r.subject_user_id)}`}{" "}
                · by {r.reviewer_id === user?.id ? "you" : nameOf(directory.data, r.reviewer_id)}
              </span>
            </p>
            <p className="mt-2 whitespace-pre-wrap text-ink-900">
              {r.status === "scheduled" && r.notes ? <strong>Agenda: </strong> : null}
              {r.notes.replace(/^Agenda: /, "")}
            </p>
            {r.barriers && (
              <p className="mt-2 text-sm text-ink-700">
                <strong>Barriers:</strong> {r.barriers}
              </p>
            )}
            {r.support && (
              <p className="mt-1 text-sm text-ink-700">
                <strong>Support needed:</strong> {r.support}
              </p>
            )}
            {r.action_items.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm text-ink-700">
                {r.action_items.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
            {r.follow_up_date && (
              <p className="mt-2 text-sm text-ink-500">
                Follow up by {formatDate(r.follow_up_date)}
              </p>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function Reviews() {
  useDocumentTitle("Reviews");
  const isManagement = useIsManagement();
  const [params, setParams] = useSearchParams();
  const wantsNew = params.has("subject") || params.get("tab") === "new";
  const tab = isManagement && wantsNew && params.get("tab") !== "history" ? "new" : "history";
  const setTab = (t: "new" | "history") => setParams({ tab: t }, { replace: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reviews"
        subtitle={
          isManagement
            ? "A focused check-in centred on evidence, barriers, decisions and support."
            : "Check-ins your manager has recorded about you."
        }
      />
      {isManagement && (
        <div role="tablist" aria-label="Reviews" className="flex gap-2">
          {(["history", "new"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={
                "rounded-lg border px-4 py-2 text-sm font-semibold " +
                (tab === t
                  ? "border-brand-700 bg-brand-700 text-white"
                  : "border-line bg-white text-brand-800 hover:bg-brand-50")
              }
            >
              {t === "new" ? "New review" : "History"}
            </button>
          ))}
        </div>
      )}
      {tab === "new" ? <NewReview /> : <History />}
    </div>
  );
}
