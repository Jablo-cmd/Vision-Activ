import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { CommitmentCard } from "../components/CommitmentCard";
import { DeltaChip, ScoreValue, dimensionName } from "../components/domain";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SectionTitle,
  Spinner,
  Stat,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  keys,
  useAssessments,
  useCycle,
  useIsManagement,
  useMyCommitments,
  useUserId,
} from "../hooks/queries";
import { formatDate, orgToday } from "../lib/dates";
import {
  assessmentAverage,
  attentionReasons,
  isOverdue,
  movement,
  weakestDimensions,
} from "../lib/metrics";
import { memberStatus } from "../services/reports";
import { listNotifications } from "../services/notifications";
import { errorText } from "../services/supabase";

/** Executives land on the cockpit; everyone else on their own dashboard. */
export function Home() {
  const { role } = useAuth();
  if (role === "ceo" || role === "admin") return <Navigate to="/cockpit" replace />;
  return <Dashboard />;
}

function TeamGlance() {
  const q = useQuery({ queryKey: ["member-status"], queryFn: memberStatus });
  const { user } = useAuth();
  if (q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="error">{errorText(q.error)}</Alert>;
  const team = q.data.filter((m) => m.user_id !== user?.id && m.active);
  const flagged = team.filter((m) => attentionReasons(m).length > 0);
  const pending = team.reduce((n, m) => n + m.pending_verification, 0);
  return (
    <Card className="p-5">
      <SectionTitle
        aside={
          <Link to="/team" className="text-sm font-semibold text-brand-700 hover:underline">
            Open team view
          </Link>
        }
      >
        Your team
      </SectionTitle>
      {team.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500">
          No one reports to you yet. An administrator can assign your team.
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          <li className="rounded-lg bg-brand-50 p-3">
            <p className="text-2xl font-bold text-brand-800">{team.length}</p>
            <p className="text-sm text-ink-700">people</p>
          </li>
          <li className="rounded-lg bg-warn-50 p-3">
            <p className="text-2xl font-bold text-warn-700">{flagged.length}</p>
            <p className="text-sm text-ink-700">need attention</p>
          </li>
          <li className="rounded-lg bg-brand-50 p-3">
            <p className="text-2xl font-bold text-brand-800">{pending}</p>
            <p className="text-sm text-ink-700">awaiting your verification</p>
          </li>
        </ul>
      )}
    </Card>
  );
}

export function Dashboard() {
  useDocumentTitle("Dashboard");
  const userId = useUserId();
  const isManagement = useIsManagement();
  const cycle = useCycle();
  const assessments = useAssessments(userId);
  const commitments = useMyCommitments();
  const notifications = useQuery({
    queryKey: [...keys.myCommitments, "notifications-preview"],
    queryFn: () => listNotifications(5),
  });
  const today = orgToday();

  if (assessments.isPending || commitments.isPending || cycle.isPending) return <Spinner />;
  if (assessments.isError || commitments.isError)
    return <Alert tone="error">{errorText(assessments.error ?? commitments.error)}</Alert>;

  const all = assessments.data;
  const baseline = all.find((a) => a.assessment_type === "baseline") ?? null;
  const weekly = all.filter((a) => a.assessment_type === "weekly");
  const latest = weekly[0] ?? baseline;
  const latestScore = assessmentAverage(latest);
  const delta =
    weekly.length >= 2
      ? movement(assessmentAverage(weekly[0]), assessmentAverage(weekly[1]))
      : null;
  const submittedThisWeek = weekly.some((a) => a.period_start === cycle.data?.week_start);

  const list = commitments.data;
  const open = list.filter((c) => c.status !== "complete");
  const overdue = list.filter((c) => isOverdue(c, today));
  const blocked = list.filter((c) => c.status === "blocked");
  const awaiting = list.filter((c) => c.verification_status === "pending");
  const upcoming = [...open]
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
    .slice(0, 4);
  const withOpen = new Set(open.map((c) => c.dimension_id));
  const focus = weakestDimensions(latest, 3);
  const unread = notifications.data?.filter((n) => !n.read_at) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My dashboard"
        subtitle={
          cycle.data
            ? `Week of ${formatDate(cycle.data.week_start)} · today is ${formatDate(today)}`
            : undefined
        }
      />

      {!baseline && (
        <Alert tone="info">
          You have not completed your baseline assessment.{" "}
          <Link className="font-semibold underline" to="/baseline">
            Complete it now
          </Link>{" "}
          so your progress has a starting point.
        </Alert>
      )}

      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {submittedThisWeek ? (
            <CheckCircle2 className="mt-0.5 text-ok-700" aria-hidden="true" />
          ) : (
            <ClipboardCheck className="mt-0.5 text-warn-700" aria-hidden="true" />
          )}
          <div>
            <h2 className="font-semibold text-ink-900">
              {submittedThisWeek ? "Weekly scorecard submitted" : "Your weekly scorecard is due"}
            </h2>
            <p className="text-sm text-ink-500">
              {submittedThisWeek
                ? "You can still amend it until the cycle closes."
                : "Rate the 12 dimensions, record the measures and add evidence."}
            </p>
          </div>
        </div>
        <Link to="/weekly">
          <Button variant={submittedThisWeek ? "secondary" : "primary"}>
            {submittedThisWeek ? "Review submission" : "Complete weekly scorecard"}{" "}
            <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </Link>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Current score"
          value={latestScore === null ? "—" : latestScore.toFixed(1)}
          hint={
            <span className="inline-flex items-center gap-1">
              out of 5 · <DeltaChip delta={delta} />
            </span>
          }
          tone="brand"
        />
        <Stat label="Open commitments" value={open.length} />
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? "bad" : "neutral"} />
        <Stat label="Blocked" value={blocked.length} tone={blocked.length ? "bad" : "neutral"} />
        <Stat
          label="Awaiting verification"
          value={awaiting.length}
          tone={awaiting.length ? "warn" : "neutral"}
        />
      </div>

      {isManagement && <TeamGlance />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>Focus areas</SectionTitle>
          <p className="mt-1 text-sm text-ink-500">
            Your lowest-scoring dimensions in your latest assessment.
          </p>
          {focus.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">
              Complete an assessment to see where to focus.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {focus.map((f) => (
                <li
                  key={f.dimensionId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">{dimensionName(f.dimensionId)}</p>
                    {withOpen.has(f.dimensionId) ? (
                      <Badge tone="brand">Commitment in progress</Badge>
                    ) : (
                      <Link
                        className="text-sm font-semibold text-brand-700 underline"
                        to={`/commitments?dimension=${f.dimensionId}`}
                      >
                        Create a commitment
                      </Link>
                    )}
                  </div>
                  <ScoreValue score={f.score} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle
            aside={
              unread.length > 0 ? <Badge tone="brand">{unread.length} unread</Badge> : undefined
            }
          >
            Notifications
          </SectionTitle>
          {notifications.data && notifications.data.length === 0 && (
            <p className="mt-3 text-sm text-ink-500">You are all caught up.</p>
          )}
          <ul className="mt-3 space-y-2">
            {notifications.data?.slice(0, 4).map((n) => (
              <li key={n.id} className="rounded-lg border border-line p-3 text-sm">
                <p className={n.read_at ? "text-ink-700" : "font-semibold text-ink-900"}>
                  {n.title}
                </p>
                {n.body && <p className="text-ink-500">{n.body}</p>}
              </li>
            ))}
          </ul>
          <Link
            className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline"
            to="/notifications"
          >
            All notifications
          </Link>
        </Card>
      </div>

      <section aria-labelledby="next-actions" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="next-actions" className="text-lg font-semibold text-ink-900">
            Next actions
          </h2>
          <Link className="text-sm font-semibold text-brand-700 hover:underline" to="/track">
            Track & Improve
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <EmptyState
            title="No open commitments"
            action={
              <Link to="/commitments">
                <Button variant="secondary">
                  <AlertTriangle size={16} aria-hidden="true" /> Plan an improvement
                </Button>
              </Link>
            }
          >
            Commitments turn your weakest scores into measurable actions.
          </EmptyState>
        ) : (
          <div className="grid gap-3">
            {upcoming.map((c) => (
              <CommitmentCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
