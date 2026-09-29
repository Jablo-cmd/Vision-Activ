import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CommitmentCard } from "../components/CommitmentCard";
import { DeltaChip, dimensionName } from "../components/domain";
import { Alert, Card, EmptyState, PageHeader, SectionTitle, Spinner, Stat } from "../components/ui";
import type { CommitmentRow } from "../domain";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useMyCommitments } from "../hooks/queries";
import { orgToday } from "../lib/dates";
import { isOverdue } from "../lib/metrics";
import { commitmentOutcomes } from "../services/reports";
import { errorText } from "../services/supabase";

type Column = { key: string; title: string; hint: string; pick: (c: CommitmentRow) => boolean };

const COLUMNS: Column[] = [
  {
    key: "blocked",
    title: "Blocked",
    hint: "Needs your manager's help",
    pick: (c) => c.status === "blocked",
  },
  {
    key: "progress",
    title: "In progress",
    hint: "Being worked on",
    pick: (c) => c.status === "in_progress",
  },
  { key: "todo", title: "Not started", hint: "Planned", pick: (c) => c.status === "not_started" },
  {
    key: "pending",
    title: "Awaiting verification",
    hint: "Complete; manager to verify",
    pick: (c) => c.verification_status === "pending",
  },
  {
    key: "reopened",
    title: "Reopened",
    hint: "Manager asked for more",
    pick: (c) => c.verification_status === "rejected" && c.status !== "complete",
  },
  {
    key: "verified",
    title: "Verified",
    hint: "Done and confirmed",
    pick: (c) => c.verification_status === "verified",
  },
];

export function Track() {
  useDocumentTitle("Track & Improve");
  const commitments = useMyCommitments();
  const outcomes = useQuery({ queryKey: ["outcomes", "mine"], queryFn: commitmentOutcomes });
  const today = orgToday();

  if (commitments.isPending) return <Spinner />;
  if (commitments.isError) return <Alert tone="error">{errorText(commitments.error)}</Alert>;

  const list = commitments.data;
  const open = list.filter((c) => c.status !== "complete");
  const avg = open.length
    ? Math.round(open.reduce((n, c) => n + c.progress_percent, 0) / open.length)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Track & Improve"
        subtitle="See every commitment by where it stands, then open one to update progress, log a blocker or add evidence."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Open" value={open.length} />
        <Stat
          label="Overdue"
          value={list.filter((c) => isOverdue(c, today)).length}
          tone={list.some((c) => isOverdue(c, today)) ? "bad" : "neutral"}
        />
        <Stat label="Average progress (open)" value={`${avg}%`} />
        <Stat
          label="Verified"
          value={list.filter((c) => c.verification_status === "verified").length}
          tone="ok"
        />
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="Nothing to track yet"
          action={
            <Link className="font-semibold text-brand-700 underline" to="/commitments">
              Create a commitment
            </Link>
          }
        >
          Once you commit to an improvement it appears here.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {COLUMNS.map((col) => {
            const items = list.filter(col.pick);
            if (items.length === 0) return null;
            return (
              <section key={col.key} aria-labelledby={`col-${col.key}`}>
                <h2 id={`col-${col.key}`} className="text-base font-semibold text-ink-900">
                  {col.title}{" "}
                  <span className="font-normal text-ink-500">
                    ({items.length}) · {col.hint}
                  </span>
                </h2>
                <div className="mt-2 grid gap-3">
                  {items.map((c) => (
                    <CommitmentCard key={c.id} c={c} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Card className="p-5">
        <SectionTitle>Did it work?</SectionTitle>
        <p className="mt-1 text-sm text-ink-500">
          For completed commitments: your score in that dimension before, and in your latest weekly
          scorecard after completion.
        </p>
        {outcomes.isPending && <Spinner />}
        {outcomes.isError && <Alert tone="error">{errorText(outcomes.error)}</Alert>}
        {outcomes.data && outcomes.data.length === 0 && (
          <p className="mt-3 text-sm text-ink-500">Completed commitments will appear here.</p>
        )}
        <ul className="mt-3 space-y-2">
          {outcomes.data?.map((o) => (
            <li
              key={o.commitment_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3 text-sm"
            >
              <div>
                <Link
                  to={`/commitments/${o.commitment_id}`}
                  className="font-semibold text-ink-900 hover:underline"
                >
                  {o.title}
                </Link>
                <p className="text-ink-500">{dimensionName(o.dimension_id)}</p>
              </div>
              {o.delta === null ? (
                <span className="text-ink-500">Waiting for a later weekly scorecard</span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  {o.score_before?.toFixed(1)} → {o.score_after?.toFixed(1)}{" "}
                  <DeltaChip delta={o.delta} showLabel />
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
