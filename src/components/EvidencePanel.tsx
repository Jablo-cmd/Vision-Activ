import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Link2, NotebookText, Sigma } from "lucide-react";
import type { EvidenceKind, EvidenceRow } from "../domain";
import { formatDateTime } from "../lib/dates";
import { EVIDENCE_ACCEPT, isHttpUrl, validateEvidenceFile } from "../lib/evidenceFiles";
import {
  addFileEvidence,
  addLinkEvidence,
  addMetricEvidence,
  addNoteEvidence,
  evidenceDownloadUrl,
  listEvidence,
  reviewEvidence,
} from "../services/evidence";
import { errorText, AppError } from "../services/supabase";
import { Alert, Badge, Button, Card, Field, Input, SectionTitle, Spinner, Textarea } from "./ui";

const KIND_ICON = { note: NotebookText, link: Link2, file: FileText, metric: Sigma } as const;
const KIND_LABEL: Record<EvidenceKind, string> = {
  note: "Note",
  link: "Link",
  file: "File",
  metric: "Measurement",
};

function ReviewBadge({ status }: { status: EvidenceRow["review_status"] }) {
  if (status === "accepted") return <Badge tone="ok">Accepted</Badge>;
  if (status === "rejected") return <Badge tone="bad">Rejected</Badge>;
  return <Badge tone="warn">Awaiting review</Badge>;
}

function EvidenceItem({
  e,
  canReview,
  onChanged,
}: {
  e: EvidenceRow;
  canReview: boolean;
  onChanged: () => void;
}) {
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState("");
  const Icon = KIND_ICON[e.kind];

  const review = useMutation({
    mutationFn: (status: "accepted" | "rejected") => reviewEvidence(e.id, status, note.trim()),
    onSuccess: () => {
      setRejecting(false);
      setNote("");
      onChanged();
    },
    onError: (err) => setError(errorText(err)),
  });

  const openFile = async () => {
    setError("");
    try {
      const url = await evidenceDownloadUrl(e.storage_path!);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <li className="rounded-lg border border-line bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Icon size={18} className="mt-0.5 shrink-0 text-brand-700" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold text-ink-900">
              {e.title}{" "}
              <span className="text-xs font-normal text-ink-500">· {KIND_LABEL[e.kind]}</span>
            </p>
            {e.body && <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-700">{e.body}</p>}
            {e.kind === "metric" && (
              <p className="text-sm text-ink-700">
                Value: <strong>{e.metric_value}</strong>
              </p>
            )}
            {e.kind === "link" && e.url && isHttpUrl(e.url) && (
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 break-all text-sm font-semibold text-brand-700 underline"
              >
                {e.url} <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
            {e.kind === "file" && (
              <button
                type="button"
                onClick={() => void openFile()}
                className="text-sm font-semibold text-brand-700 underline"
              >
                {e.file_name}{" "}
                {e.size_bytes ? `(${Math.max(1, Math.round(e.size_bytes / 1024))} KB)` : ""}
              </button>
            )}
            <p className="mt-1 text-xs text-ink-500">Added {formatDateTime(e.created_at)}</p>
            {e.review_status !== "pending" && e.review_note && (
              <p className="mt-1 text-xs text-ink-700">Reviewer: {e.review_note}</p>
            )}
          </div>
        </div>
        <ReviewBadge status={e.review_status} />
      </div>
      {error && (
        <div className="mt-2">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {canReview && e.review_status === "pending" && (
        <div className="mt-3 border-t border-line pt-3">
          {rejecting ? (
            <div className="space-y-2">
              <Field label="Reason for rejecting this evidence">
                {(p) => (
                  <Textarea {...p} value={note} onChange={(ev) => setNote(ev.target.value)} />
                )}
              </Field>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  loading={review.isPending}
                  disabled={!note.trim()}
                  onClick={() => review.mutate("rejected")}
                >
                  Reject evidence
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                size="sm"
                loading={review.isPending}
                onClick={() => review.mutate("accepted")}
              >
                Accept
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>
                Reject…
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function AddEvidence({
  commitmentId,
  organizationId,
  onAdded,
}: {
  commitmentId: string;
  organizationId: string;
  onAdded: () => void;
}) {
  const [kind, setKind] = useState<EvidenceKind>("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [metric, setMetric] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const base = { commitmentId, organizationId, title: title.trim() };
      if (!base.title) throw new AppError("Give the evidence a title.");
      if (kind === "note") {
        if (!body.trim()) throw new AppError("Write the note.");
        await addNoteEvidence(base, body.trim());
      } else if (kind === "link") {
        if (!isHttpUrl(url.trim()))
          throw new AppError("Enter a full web address starting with http:// or https://.");
        await addLinkEvidence(base, url.trim());
      } else if (kind === "metric") {
        const n = Number(metric);
        if (metric.trim() === "" || !Number.isFinite(n))
          throw new AppError("Enter the measured value as a number.");
        await addMetricEvidence(base, n, body.trim());
      } else {
        if (!file) throw new AppError("Choose a file to upload.");
        await addFileEvidence(base, file);
      }
    },
    onSuccess: () => {
      setTitle("");
      setBody("");
      setUrl("");
      setMetric("");
      setFile(null);
      setError("");
      onAdded();
    },
    onError: (e) => setError(errorText(e)),
  });

  const onFile = (f: File | null) => {
    setFile(f);
    setError(f ? (validateEvidenceFile(f) ?? "") : "");
  };

  return (
    <form
      className="space-y-3 rounded-lg border border-dashed border-brand-200 bg-brand-50/50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <fieldset>
        <legend className="text-sm font-semibold text-ink-900">Add evidence</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(KIND_LABEL) as EvidenceKind[]).map((k) => (
            <label
              key={k}
              className={
                "cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-brand-500 " +
                (kind === k
                  ? "border-brand-700 bg-brand-700 text-white"
                  : "border-line bg-white text-brand-800")
              }
            >
              <input
                type="radio"
                name="evidence-kind"
                className="sr-only"
                checked={kind === k}
                onChange={() => setKind(k)}
              />
              {KIND_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Title">
        {(p) => (
          <Input {...p} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        )}
      </Field>
      {(kind === "note" || kind === "metric") && (
        <Field label={kind === "note" ? "Note" : "Context (optional)"}>
          {(p) => (
            <Textarea
              {...p}
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          )}
        </Field>
      )}
      {kind === "metric" && (
        <Field label="Measured value">
          {(p) => (
            <Input
              {...p}
              type="number"
              step="any"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            />
          )}
        </Field>
      )}
      {kind === "link" && (
        <Field label="Web address">
          {(p) => (
            <Input
              {...p}
              type="url"
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          )}
        </Field>
      )}
      {kind === "file" && (
        <Field label="File" hint="PDF, image, text, CSV, Word, Excel or PowerPoint. Maximum 10 MB.">
          {(p) => (
            <Input
              {...p}
              type="file"
              accept={EVIDENCE_ACCEPT}
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          )}
        </Field>
      )}
      <Button type="submit" loading={add.isPending}>
        Add evidence
      </Button>
    </form>
  );
}

export function EvidencePanel({
  commitmentId,
  organizationId,
  canAdd,
  canReview,
}: {
  commitmentId: string;
  organizationId: string;
  canAdd: boolean;
  canReview: boolean;
}) {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ["evidence", commitmentId],
    queryFn: () => listEvidence(commitmentId),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["evidence", commitmentId] });
    void queryClient.invalidateQueries({ queryKey: ["updates", commitmentId] });
    void queryClient.invalidateQueries({ queryKey: ["attention"] });
  };

  return (
    <Card className="space-y-4 p-5">
      <SectionTitle>Evidence</SectionTitle>
      {q.isPending && <Spinner />}
      {q.isError && <Alert tone="error">{errorText(q.error)}</Alert>}
      {q.data && q.data.length === 0 && (
        <p className="text-sm text-ink-500">No evidence has been added yet.</p>
      )}
      {q.data && q.data.length > 0 && (
        <ul className="space-y-2">
          {q.data.map((e) => (
            <EvidenceItem key={e.id} e={e} canReview={canReview} onChanged={refresh} />
          ))}
        </ul>
      )}
      {canAdd && (
        <AddEvidence
          commitmentId={commitmentId}
          organizationId={organizationId}
          onAdded={refresh}
        />
      )}
    </Card>
  );
}
