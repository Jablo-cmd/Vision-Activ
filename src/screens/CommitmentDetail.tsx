import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { DueBadge } from "../components/CommitmentCard";
import { EvidencePanel } from "../components/EvidencePanel";
import {
  PRIORITY_OPTIONS,
  PriorityBadge,
  STATUS_OPTIONS,
  ScoreValue,
  StatusBadge,
  VerificationBadge,
  dimensionName,
} from "../components/domain";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  ProgressBar,
  SectionTitle,
  Select,
  Spinner,
  Textarea,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import type { CommitmentRow, CommitmentStatus, Priority } from "../domain";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { keys, nameOf, useDirectory } from "../hooks/queries";
import { formatDate, formatDateTime, orgToday } from "../lib/dates";
import { measuredProgress } from "../lib/metrics";
import {
  addUpdate,
  getCommitment,
  listUpdates,
  updateCommitment,
  verifyCommitment,
  type CommitmentPatch,
} from "../services/commitments";
import { listEvidence } from "../services/evidence";
import { errorText } from "../services/supabase";

function useRefreshCommitment(id: string) {
  const qc = useQueryClient();
  return () => {
    for (const key of [
      ["commitment", id],
      ["updates", id],
      ["evidence", id],
      keys.myCommitments,
      ["team-commitments"],
      ["attention"],
      ["member-status"],
      ["notifications"],
    ]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  };
}

/* Owner controls ------------------------------------------------------------------------------ */

function OwnerControls({
  c,
  message,
  setMessage,
}: {
  c: CommitmentRow;
  message: string;
  setMessage: (m: string) => void;
}) {
  const refresh = useRefreshCommitment(c.id);
  const today = orgToday();
  const [status, setStatus] = useState<CommitmentStatus>(c.status);
  const [progress, setProgress] = useState(Math.round(c.progress_percent));
  const [current, setCurrent] = useState(c.current_value === null ? "" : String(c.current_value));
  const [due, setDue] = useState(c.due_date ?? "");
  const [priority, setPriority] = useState<Priority>(c.priority);
  const [blocker, setBlocker] = useState(c.blocker);

  const currentNum = current.trim() === "" ? null : Number(current);
  const derived = measuredProgress(
    c.baseline_value,
    Number.isFinite(currentNum ?? 0) ? currentNum : null,
    c.target_value,
  );
  const measurable = c.baseline_value !== null && c.target_value !== null;
  const effectiveProgress = derived ?? progress;

  const problems: string[] = [];
  if (status === "blocked" && !blocker.trim()) problems.push("Describe what is blocking you.");
  if (due && due !== c.due_date && due < today)
    problems.push("The due date cannot be in the past.");
  if (current.trim() !== "" && !Number.isFinite(Number(current)))
    problems.push("The current value must be a number.");

  const save = useMutation({
    mutationFn: () => {
      const patch: CommitmentPatch = {};
      if (status !== c.status) patch.status = status;
      if (status === "in_progress" || status === "blocked") {
        // 100% is reached by completing, which sends the commitment for verification.
        const p = Math.min(effectiveProgress, 95);
        if (p !== Math.round(c.progress_percent)) patch.progress_percent = p;
      }
      const nextCurrent = current.trim() === "" ? null : Number(current);
      if (nextCurrent !== c.current_value) patch.current_value = nextCurrent;
      if ((due || null) !== c.due_date) patch.due_date = due || null;
      if (priority !== c.priority) patch.priority = priority;
      if (blocker.trim() !== c.blocker) patch.blocker = blocker.trim();
      return Object.keys(patch).length ? updateCommitment(c.id, patch) : Promise.resolve(c);
    },
    onSuccess: () => {
      setMessage("Saved.");
      refresh();
    },
    onError: (e) => setMessage(errorText(e)),
  });

  const changeStatus = (next: CommitmentStatus) => {
    setStatus(next);
    if (next === "not_started") setProgress(0);
    if (next === "complete") setProgress(100);
    if (next === "in_progress" && progress === 0) setProgress(5);
  };

  return (
    <Card className="space-y-4 p-5">
      <SectionTitle>Update progress</SectionTitle>
      {message && <Alert tone={message === "Saved." ? "success" : "error"}>{message}</Alert>}
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Status">
          {(p) => (
            <Select
              {...p}
              value={status}
              onChange={(e) => changeStatus(e.target.value as CommitmentStatus)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Due date">
          {(p) => <Input {...p} type="date" value={due} onChange={(e) => setDue(e.target.value)} />}
        </Field>
        <Field label="Priority">
          {(p) => (
            <Select
              {...p}
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {measurable && (
        <Field
          label={`Current value${c.measure ? ` — ${c.measure}` : ""}`}
          hint={`Baseline ${c.baseline_value} → target ${c.target_value}. Progress is calculated from this value.`}
        >
          {(p) => (
            <Input
              {...p}
              type="number"
              step="any"
              inputMode="decimal"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          )}
        </Field>
      )}

      <div>
        <label
          htmlFor="progress-range"
          className="flex items-center justify-between text-sm font-semibold text-ink-900"
        >
          <span>
            Progress{" "}
            {derived !== null && (
              <span className="font-normal text-ink-500">(calculated from measured values)</span>
            )}
          </span>
          <span className="tabular-nums">{effectiveProgress}%</span>
        </label>
        <input
          id="progress-range"
          type="range"
          min={0}
          max={status === "complete" ? 100 : 95}
          step={5}
          value={effectiveProgress}
          disabled={derived !== null || status === "complete" || status === "not_started"}
          onChange={(e) => setProgress(Number(e.target.value))}
          className="mt-2 w-full accent-brand-700"
        />
      </div>

      {(status === "blocked" || c.blocker) && (
        <Field
          label="What is blocking you?"
          hint="Your manager is notified when a commitment is blocked."
          error={
            status === "blocked" && !blocker.trim()
              ? "A blocker description is required."
              : undefined
          }
        >
          {(p) => (
            <Textarea
              {...p}
              maxLength={1000}
              value={blocker}
              onChange={(e) => setBlocker(e.target.value)}
            />
          )}
        </Field>
      )}

      {derived === 100 && status !== "complete" && (
        <Alert tone="info">
          Your measured value has reached the target. Set the status to Complete to send it for
          verification.
        </Alert>
      )}
      {problems.length > 0 && <Alert tone="warning">{problems.join(" ")}</Alert>}
      <div className="flex items-center gap-3">
        <Button
          loading={save.isPending}
          disabled={problems.length > 0}
          onClick={() => save.mutate()}
        >
          Save changes
        </Button>
        {status === "complete" && c.status !== "complete" && (
          <p className="text-sm text-ink-500">
            Completing sends this to your manager for verification.
          </p>
        )}
      </div>
    </Card>
  );
}

/* Manager verification ---------------------------------------------------------------------------- */

function VerificationPanel({ c }: { c: CommitmentRow }) {
  const refresh = useRefreshCommitment(c.id);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const evidence = useQuery({
    queryKey: ["evidence", c.id],
    queryFn: () => listEvidence(c.id),
  });
  const accepted = evidence.data?.filter((e) => e.review_status === "accepted").length ?? 0;

  const decide = useMutation({
    mutationFn: (decision: "verified" | "rejected") =>
      verifyCommitment(c.id, decision, note.trim()),
    onSuccess: () => {
      setNote("");
      setError("");
      refresh();
    },
    onError: (e) => setError(errorText(e)),
  });

  if (c.status !== "complete") {
    return (
      <Card className="p-5">
        <SectionTitle>Verification</SectionTitle>
        <p className="mt-2 text-sm text-ink-500">
          Verification opens when the owner marks this commitment complete.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-5">
      <SectionTitle>Verification</SectionTitle>
      {error && <Alert tone="error">{error}</Alert>}
      {c.verification_status === "pending" && (
        <p className="text-sm text-ink-700">
          {accepted > 0
            ? `${accepted} accepted evidence item(s). You can verify this commitment.`
            : "Accept at least one piece of evidence below before verifying."}
        </p>
      )}
      <Field label="Note for the owner" hint="Required when rejecting or reopening.">
        {(p) => (
          <Textarea
            {...p}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-2">
        {c.verification_status === "pending" && (
          <Button
            loading={decide.isPending}
            disabled={accepted === 0}
            onClick={() => decide.mutate("verified")}
          >
            Verify commitment
          </Button>
        )}
        <Button
          variant="danger"
          loading={decide.isPending}
          disabled={!note.trim()}
          onClick={() => decide.mutate("rejected")}
        >
          {c.verification_status === "verified" ? "Reopen commitment" : "Reject and reopen"}
        </Button>
      </div>
    </Card>
  );
}

/* Timeline -------------------------------------------------------------------------------------------- */

const KIND_LABEL = {
  note: "Update",
  manager_note: "Manager note",
  verification: "Verification",
  evidence: "Evidence",
} as const;

function Timeline({
  c,
  canPostManagerNote,
  isOwner,
}: {
  c: CommitmentRow;
  canPostManagerNote: boolean;
  isOwner: boolean;
}) {
  const refresh = useRefreshCommitment(c.id);
  const directory = useDirectory();
  const updates = useQuery({ queryKey: ["updates", c.id], queryFn: () => listUpdates(c.id) });
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const post = useMutation({
    mutationFn: () => addUpdate(c.id, isOwner ? "note" : "manager_note", body.trim()),
    onSuccess: () => {
      setBody("");
      setError("");
      refresh();
    },
    onError: (e) => setError(errorText(e)),
  });

  return (
    <Card className="space-y-4 p-5">
      <SectionTitle>Activity</SectionTitle>
      {(isOwner || canPostManagerNote) && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) post.mutate();
          }}
        >
          {error && <Alert tone="error">{error}</Alert>}
          <Field label={isOwner ? "Post a progress update" : "Add a manager note"}>
            {(p) => (
              <Textarea
                {...p}
                maxLength={2000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" size="sm" loading={post.isPending} disabled={!body.trim()}>
            Post
          </Button>
        </form>
      )}
      {updates.isPending && <Spinner />}
      {updates.isError && <Alert tone="error">{errorText(updates.error)}</Alert>}
      {updates.data && updates.data.length === 0 && (
        <p className="text-sm text-ink-500">No activity yet.</p>
      )}
      <ol className="space-y-3">
        {updates.data?.map((u) => (
          <li key={u.id} className="rounded-lg border border-line p-3">
            <p className="text-xs text-ink-500">
              <strong className="text-ink-900">{KIND_LABEL[u.kind]}</strong> ·{" "}
              {nameOf(directory.data, u.author_id)} · {formatDateTime(u.created_at)}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{u.body}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* Page ------------------------------------------------------------------------------------------------ */

export function CommitmentDetail() {
  const { id = "" } = useParams();
  const { user, membership, role } = useAuth();
  const directory = useDirectory();
  const [flash, setFlash] = useState("");
  const q = useQuery({
    queryKey: ["commitment", id],
    queryFn: () => getCommitment(id),
    enabled: Boolean(id),
  });
  useDocumentTitle(q.data?.title ?? "Commitment");

  const c = q.data ?? null;
  const isOwner = c !== null && c.user_id === user?.id;
  const isManagement = role === "manager" || role === "ceo" || role === "admin";
  // A non-owner can only load this row if the database says they manage the owner.
  const canManage = c !== null && !isOwner && isManagement;
  const locked = c?.verification_status === "verified";
  const today = orgToday();
  const derived = useMemo(
    () => (c ? measuredProgress(c.baseline_value, c.current_value, c.target_value) : null),
    [c],
  );

  if (q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="error">{errorText(q.error)}</Alert>;
  if (!c) {
    return (
      <EmptyState
        title="Commitment not found"
        action={
          <Link className="font-semibold text-brand-700 underline" to="/commitments">
            Back to commitments
          </Link>
        }
      >
        It may have been removed, or you may not have access to it.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to={isOwner ? "/commitments" : "/team/commitments"}
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
      >
        <ArrowLeft size={16} aria-hidden="true" />{" "}
        {isOwner ? "All commitments" : "Team commitments"}
      </Link>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              {dimensionName(c.dimension_id)}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-ink-900">{c.title}</h1>
            <p className="mt-1 text-sm text-ink-500">
              Owner: {isOwner ? "You" : nameOf(directory.data, c.user_id)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={c.status} />
            <VerificationBadge status={c.verification_status} />
            <PriorityBadge priority={c.priority} />
            <DueBadge c={c} today={today} />
          </div>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-ink-700">{c.action}</p>

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-sm">
            <span className="font-semibold text-ink-900">Progress</span>
            <span className="tabular-nums text-ink-700">{Math.round(c.progress_percent)}%</span>
          </div>
          <ProgressBar value={c.progress_percent} label="Overall progress" />
        </div>

        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-ink-500">Started from</dt>
            <dd className="mt-0.5 font-medium text-ink-900">
              {c.source_score !== null ? (
                <>
                  Score <ScoreValue score={c.source_score} /> in the assessment
                </>
              ) : (
                "Not linked to an assessment"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">Measure</dt>
            <dd className="mt-0.5 font-medium text-ink-900">
              {c.baseline_value !== null && c.target_value !== null
                ? `${c.baseline_value} → ${c.current_value ?? "?"} → ${c.target_value}${c.measure ? ` (${c.measure})` : ""}${derived !== null ? ` · ${derived}% of the way` : ""}`
                : "No numeric target"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">Timeframe</dt>
            <dd className="mt-0.5 font-medium text-ink-900">{c.timeframe || "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Created</dt>
            <dd className="mt-0.5 font-medium text-ink-900">
              {formatDate(c.created_at.slice(0, 10))}
            </dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <dt className="text-ink-500">Evidence to be provided</dt>
            <dd className="mt-0.5 font-medium text-ink-900">{c.evidence_plan || "—"}</dd>
          </div>
        </dl>

        {c.status === "blocked" && c.blocker && (
          <div className="mt-4">
            <Alert tone="error">
              <strong>Blocked:</strong> {c.blocker}
            </Alert>
          </div>
        )}
        {c.verification_status === "verified" && (
          <div className="mt-4">
            <Alert tone="success">
              Verified by {nameOf(directory.data, c.verified_by)} on {formatDateTime(c.verified_at)}
              {c.verification_note ? ` — “${c.verification_note}”` : ""}. This commitment is now
              locked.
            </Alert>
          </div>
        )}
        {c.verification_status === "rejected" && (
          <div className="mt-4">
            <Alert tone="warning">
              Reopened by {nameOf(directory.data, c.verified_by)} on {formatDateTime(c.verified_at)}
              : {c.verification_note}
            </Alert>
          </div>
        )}
        {c.verification_status === "pending" && isOwner && (
          <div className="mt-4">
            <Alert tone="info">
              Waiting for your manager to review the evidence and verify this commitment.
            </Alert>
          </div>
        )}
      </Card>

      {isOwner && !locked && (
        <OwnerControls key={c.updated_at} c={c} message={flash} setMessage={setFlash} />
      )}
      {canManage && <VerificationPanel key={c.updated_at} c={c} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <EvidencePanel
          commitmentId={c.id}
          organizationId={membership!.organization_id}
          canAdd={isOwner && !locked}
          canReview={canManage}
        />
        <Timeline c={c} isOwner={isOwner} canPostManagerNote={canManage} />
      </div>
    </div>
  );
}
