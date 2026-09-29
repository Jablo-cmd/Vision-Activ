import { CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";
import type { CommitmentRow } from "../domain";
import { formatDate, orgToday } from "../lib/dates";
import { dueState } from "../lib/metrics";
import { Badge, Card, ProgressBar } from "./ui";
import { PriorityBadge, StatusBadge, VerificationBadge, dimensionName } from "./domain";

export function DueBadge({
  c,
  today = orgToday(),
}: {
  c: Pick<CommitmentRow, "status" | "due_date">;
  today?: string;
}) {
  const state = dueState(c, today);
  if (state === "no_date") return <span className="text-xs text-ink-500">No due date</span>;
  const tone = state === "overdue" ? "bad" : state === "due_soon" ? "warn" : "neutral";
  return (
    <Badge tone={c.status === "complete" ? "neutral" : tone}>
      <CalendarClock size={12} aria-hidden="true" />
      {state === "overdue" ? "Overdue · " : ""}
      {formatDate(c.due_date)}
    </Badge>
  );
}

export function CommitmentCard({ c }: { c: CommitmentRow }) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
            {dimensionName(c.dimension_id)}
          </p>
          <h3 className="mt-0.5 text-base font-semibold text-ink-900">
            <Link to={`/commitments/${c.id}`} className="hover:underline">
              {c.title}
            </Link>
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-ink-500">{c.action}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={c.status} />
          <VerificationBadge status={c.verification_status} />
          <PriorityBadge priority={c.priority} />
        </div>
      </div>
      <div className="mt-3 grid items-center gap-3 sm:grid-cols-[1fr_auto]">
        <ProgressBar value={c.progress_percent} label={`Progress for ${c.title}`} />
        <div className="flex items-center gap-3 text-xs text-ink-500">
          <span className="tabular-nums">{Math.round(c.progress_percent)}%</span>
          <DueBadge c={c} />
        </div>
      </div>
      {c.status === "blocked" && c.blocker && (
        <p className="mt-2 text-sm text-bad-700">Blocked: {c.blocker}</p>
      )}
    </Card>
  );
}
