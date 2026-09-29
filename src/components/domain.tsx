import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import type { CommitmentStatus, Priority, VerificationStatus } from "../domain";
import { DIMENSION_WORKFLOWS } from "../framework";
import { direction, type Direction } from "../lib/metrics";
import { Badge, cx } from "./ui";

export function dimensionName(id: string): string {
  return DIMENSION_WORKFLOWS.find((d) => d.id === id)?.name ?? id;
}

const STATUS: Record<
  CommitmentStatus,
  { label: string; tone: "neutral" | "brand" | "ok" | "warn" | "bad" }
> = {
  not_started: { label: "Not started", tone: "neutral" },
  in_progress: { label: "In progress", tone: "brand" },
  blocked: { label: "Blocked", tone: "bad" },
  complete: { label: "Complete", tone: "ok" },
};

export const STATUS_OPTIONS = Object.entries(STATUS).map(([value, v]) => ({
  value: value as CommitmentStatus,
  label: v.label,
}));

export function StatusBadge({ status }: { status: CommitmentStatus }) {
  const s = STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const VERIFICATION: Record<
  VerificationStatus,
  { label: string; tone: "neutral" | "brand" | "ok" | "warn" | "bad" } | null
> = {
  unverified: null,
  pending: { label: "Awaiting verification", tone: "warn" },
  verified: { label: "Verified", tone: "ok" },
  rejected: { label: "Reopened by manager", tone: "bad" },
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const v = VERIFICATION[status];
  return v ? <Badge tone={v.tone}>{v.label}</Badge> : null;
}

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "normal") return null;
  return (
    <Badge tone={priority === "critical" ? "bad" : priority === "high" ? "warn" : "neutral"}>
      {priority} priority
    </Badge>
  );
}

/** Heat-map / score tone with text always present (colour is never the only signal). */
export function scoreClasses(score: number | null): string {
  if (score === null) return "bg-slate-100 text-ink-500";
  if (score < 2.5) return "bg-bad-50 text-bad-700";
  if (score < 3.5) return "bg-warn-50 text-warn-700";
  return "bg-ok-50 text-ok-700";
}

export function ScoreValue({ score, className }: { score: number | null; className?: string }) {
  return (
    <span
      className={cx(
        "inline-block min-w-12 rounded-md px-2 py-0.5 text-center text-sm font-semibold tabular-nums",
        scoreClasses(score),
        className,
      )}
    >
      {score === null ? "—" : score.toFixed(1)}
    </span>
  );
}

const DIRECTION_VIEW: Record<
  Direction,
  { label: string; icon: typeof ArrowUpRight; className: string }
> = {
  improving: { label: "Improving", icon: ArrowUpRight, className: "text-ok-700" },
  declining: { label: "Declining", icon: ArrowDownRight, className: "text-bad-700" },
  stable: { label: "Stable", icon: ArrowRight, className: "text-ink-500" },
  none: { label: "No comparison", icon: Minus, className: "text-ink-500" },
};

export function DeltaChip({
  delta,
  showLabel = false,
}: {
  delta: number | null;
  showLabel?: boolean;
}) {
  const dir = direction(delta);
  const v = DIRECTION_VIEW[dir];
  const Icon = v.icon;
  const text = delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
  return (
    <span
      className={cx("inline-flex items-center gap-1 text-sm font-medium", v.className)}
      title={v.label}
    >
      <Icon size={16} aria-hidden="true" />
      <span className="tabular-nums">{text}</span>
      {showLabel ? <span>{v.label}</span> : <span className="sr-only">{v.label}</span>}
    </span>
  );
}

/** Accessible 1–5 rating input (native radio group). */
export function ScoreSelector({
  name,
  legend,
  value,
  onChange,
  error,
}: {
  name: string;
  legend: string;
  value: number;
  onChange: (n: number) => void;
  error?: boolean;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className={cx(
              "cursor-pointer rounded-lg border py-2.5 text-center text-sm font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-500",
              value === n
                ? "border-brand-700 bg-brand-700 text-white"
                : error
                  ? "border-bad-700 bg-white text-ink-900"
                  : "border-slate-300 bg-white text-ink-900 hover:border-brand-600",
            )}
          >
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="sr-only"
            />
            <span aria-hidden="true">{n}</span>
            <span className="sr-only">{`${n} out of 5`}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
