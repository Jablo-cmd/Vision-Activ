import { useMemo } from "react";
import { Link } from "react-router-dom";
import { DeltaChip, ScoreValue, dimensionName, scoreClasses } from "../components/domain";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  PageHeader,
  SectionTitle,
  Spinner,
  Stat,
  TableWrap,
  Td,
  Th,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import type { CommitmentOutcome, MemberStatus } from "../domain";
import { DIMENSION_WORKFLOWS } from "../framework";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { nameOf, useDirectory } from "../hooks/queries";
import {
  useAttention,
  useMemberStatus,
  useOutcomes,
  useSubmissionRates,
  useWeeklyScores,
} from "../hooks/useOrgData";
import { addDays, formatDay, orgToday, weekStart } from "../lib/dates";
import {
  anchorWeek,
  attentionReasons,
  dimensionAverages,
  movement,
  overallScore,
  periodWindow,
} from "../lib/metrics";
import type { AttentionItem } from "../services/reports";
import { errorText } from "../services/supabase";

function summariseOutcomes(outcomes: CommitmentOutcome[]) {
  const measured = outcomes.filter((o) => o.delta !== null);
  const improved = measured.filter((o) => (o.delta as number) > 0);
  const avg = measured.length
    ? measured.reduce((n, o) => n + (o.delta as number), 0) / measured.length
    : null;
  return { completed: outcomes.length, measured: measured.length, improved: improved.length, avg };
}

function QueueList({
  title,
  items,
  empty,
  hint,
}: {
  title: string;
  items: AttentionItem[];
  empty: string;
  hint: (i: AttentionItem) => string;
}) {
  const directory = useDirectory();
  return (
    <Card className="p-5">
      <SectionTitle aside={<Badge tone={items.length ? "warn" : "ok"}>{items.length}</Badge>}>
        {title}
      </SectionTitle>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.slice(0, 6).map((i) => (
            <li key={i.commitment_id} className="rounded-lg border border-line p-3 text-sm">
              <Link
                to={`/commitments/${i.commitment_id}`}
                className="font-semibold text-ink-900 hover:underline"
              >
                {i.title}
              </Link>
              <p className="text-ink-500">
                {nameOf(directory.data, i.user_id)} · {dimensionName(i.dimension_id)}
              </p>
              <p className="text-ink-700">{hint(i)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Cockpit() {
  const { role, user } = useAuth();
  const executive = role === "ceo" || role === "admin";
  useDocumentTitle(executive ? "Executive cockpit" : "Team cockpit");
  const scores = useWeeklyScores();
  const rates = useSubmissionRates();
  const members = useMemberStatus();
  const attention = useAttention();
  const outcomes = useOutcomes();
  const directory = useDirectory();
  const today = orgToday();

  const view = useMemo(() => {
    if (!scores.data) return null;
    const anchor = anchorWeek(scores.data, today);
    const wk = periodWindow(anchor, "week");
    const prevWk = periodWindow(anchor, "week", 1);
    const month = periodWindow(anchor, "month");
    const prevMonth = periodWindow(anchor, "month", 1);
    const current = dimensionAverages(scores.data, wk);
    const previous = dimensionAverages(scores.data, prevWk);
    const monthNow = dimensionAverages(scores.data, month);
    const monthPrev = dimensionAverages(scores.data, prevMonth);
    const rows = DIMENSION_WORKFLOWS.map((d) => {
      const now = monthNow.find((x) => x.dimensionId === d.id)!.avg;
      const before = monthPrev.find((x) => x.dimensionId === d.id)!.avg;
      return { id: d.id, name: d.name, now, before, delta: movement(now, before) };
    });
    const scored = rows.filter((r) => r.now !== null) as ((typeof rows)[number] & {
      now: number;
    })[];
    const weakest = [...scored].sort((a, b) => a.now - b.now).slice(0, 3);
    const improving = rows
      .filter((r) => r.delta !== null && r.delta >= 0.15)
      .sort((a, b) => (b.delta as number) - (a.delta as number))
      .slice(0, 3);
    const declining = rows
      .filter((r) => r.delta !== null && r.delta <= -0.15)
      .sort((a, b) => (a.delta as number) - (b.delta as number))
      .slice(0, 3);
    const weeks = Array.from({ length: 8 }, (_, i) => addDays(anchor, -7 * (7 - i)));
    return {
      anchor,
      score: overallScore(current),
      prevScore: overallScore(previous),
      weakest,
      improving,
      declining,
      weeks,
    };
  }, [scores.data, today]);

  const loading = scores.isPending || members.isPending || attention.isPending;
  const failure = scores.error ?? members.error ?? attention.error ?? rates.error;
  if (loading) return <Spinner label="Loading the cockpit" />;
  if (failure) return <Alert tone="error">{errorText(failure)}</Alert>;
  if (!view || !scores.data || !members.data || !attention.data) return null;

  const team = members.data.filter((m) => m.active && m.user_id !== user?.id);
  const items = attention.data;
  const blocked = items.filter((i) => i.status === "blocked");
  const overdue = items.filter((i) => i.is_overdue);
  const pending = items.filter((i) => i.verification_status === "pending");
  const evidenceGaps = pending.filter((i) => i.accepted_evidence === 0);
  const currentWeek = weekStart(today);
  const rateRow = rates.data?.find((r) => r.week_start === currentWeek);
  const flagged = team
    .map((m) => ({ m, reasons: attentionReasons(m) }))
    .filter((x) => x.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length)
    .slice(0, 8);
  const outcome = summariseOutcomes(outcomes.data ?? []);
  const noData = scores.data.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={executive ? "Executive cockpit" : "Team cockpit"}
        subtitle={`${executive ? "Organisation" : "Your team"} performance for the week of ${formatDay(view.anchor)}${view.anchor !== currentWeek ? " (latest week with data)" : ""}, and what needs management action.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Stat
          label="Performance score"
          value={view.score === null ? "—" : view.score.toFixed(1)}
          tone="brand"
          hint={
            <span className="inline-flex items-center gap-1">
              vs last week <DeltaChip delta={movement(view.score, view.prevScore)} />
            </span>
          }
        />
        <Stat
          label="Submitted this week"
          value={rateRow ? `${rateRow.submitted}/${rateRow.expected}` : "—"}
          hint={
            rateRow && rateRow.expected
              ? `${Math.round((rateRow.submitted / rateRow.expected) * 100)}% of people`
              : undefined
          }
        />
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? "bad" : "ok"} />
        <Stat label="Blocked" value={blocked.length} tone={blocked.length ? "bad" : "ok"} />
        <Stat
          label="Awaiting verification"
          value={pending.length}
          tone={pending.length ? "warn" : "ok"}
        />
        <Stat
          label="Evidence missing"
          value={evidenceGaps.length}
          tone={evidenceGaps.length ? "warn" : "ok"}
          hint="completed, none accepted"
        />
      </div>

      {noData ? (
        <EmptyState title="No weekly scorecards have been submitted yet">
          Scores, trends and rankings appear once people submit their first weekly scorecard.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="p-5">
              <SectionTitle>Weakest dimensions</SectionTitle>
              <p className="mt-1 text-xs text-ink-500">Last 4 weeks</p>
              <ol className="mt-3 space-y-2">
                {view.weakest.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink-900">{w.name}</span>
                    <ScoreValue score={w.now} />
                  </li>
                ))}
              </ol>
            </Card>
            <Card className="p-5">
              <SectionTitle>Improving</SectionTitle>
              <p className="mt-1 text-xs text-ink-500">Last 4 weeks vs the 4 before</p>
              {view.improving.length === 0 ? (
                <p className="mt-3 text-sm text-ink-500">No dimension has improved materially.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {view.improving.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-ink-900">{r.name}</span>
                      <DeltaChip delta={r.delta} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-5">
              <SectionTitle>Deteriorating</SectionTitle>
              <p className="mt-1 text-xs text-ink-500">Last 4 weeks vs the 4 before</p>
              {view.declining.length === 0 ? (
                <p className="mt-3 text-sm text-ink-500">No dimension has declined materially.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {view.declining.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-ink-900">{r.name}</span>
                      <DeltaChip delta={r.delta} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <SectionTitle>Performance by dimension, last 8 weeks</SectionTitle>
            <div className="mt-3">
              <TableWrap label="Dimension scores by week">
                <thead>
                  <tr>
                    <Th>Dimension</Th>
                    {view.weeks.map((w) => (
                      <Th key={w}>{formatDay(w)}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DIMENSION_WORKFLOWS.map((d) => (
                    <tr key={d.id}>
                      <Td className="font-medium text-ink-900">{d.name}</Td>
                      {view.weeks.map((w) => {
                        const cell = dimensionAverages(scores.data, {
                          start: w,
                          end: addDays(w, 6),
                        }).find((x) => x.dimensionId === d.id)!;
                        return (
                          <Td key={w}>
                            <span
                              className={
                                "inline-block min-w-12 rounded-md px-2 py-0.5 text-center font-semibold tabular-nums " +
                                scoreClasses(cell.avg)
                              }
                              title={`${cell.responses} response(s)`}
                            >
                              {cell.avg === null ? "—" : cell.avg.toFixed(1)}
                            </span>
                          </Td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          </Card>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle
            aside={
              <Link to="/team" className="text-sm font-semibold text-brand-700 hover:underline">
                All people
              </Link>
            }
          >
            People who need attention
          </SectionTitle>
          {flagged.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">No one is currently flagged.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {flagged.map(({ m, reasons }: { m: MemberStatus; reasons: string[] }) => (
                <li key={m.user_id} className="rounded-lg border border-line p-3 text-sm">
                  <Link
                    to={`/team/${m.user_id}`}
                    className="font-semibold text-ink-900 hover:underline"
                  >
                    {m.full_name || m.email}
                  </Link>
                  <p className="text-ink-700">{reasons.join(" · ")}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle>Did completed actions improve performance?</SectionTitle>
          {outcomes.isPending ? (
            <Spinner />
          ) : outcome.completed === 0 ? (
            <p className="mt-3 text-sm text-ink-500">No commitments have been completed yet.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-ink-700">
                {outcome.measured === 0
                  ? `${outcome.completed} completed commitment(s) are waiting for a later weekly scorecard before their effect can be measured.`
                  : `${outcome.improved} of ${outcome.measured} measured commitments were followed by a higher score in their dimension (average change ${outcome.avg! > 0 ? "+" : ""}${outcome.avg!.toFixed(2)}).`}
              </p>
              <ul className="mt-3 space-y-2">
                {(outcomes.data ?? [])
                  .filter((o) => o.delta !== null)
                  .slice(0, 4)
                  .map((o) => (
                    <li
                      key={o.commitment_id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-line p-2 text-sm"
                    >
                      <span>
                        <Link
                          to={`/commitments/${o.commitment_id}`}
                          className="font-medium text-ink-900 hover:underline"
                        >
                          {o.title}
                        </Link>
                        <br />
                        <span className="text-ink-500">{nameOf(directory.data, o.user_id)}</span>
                      </span>
                      <DeltaChip delta={o.delta} />
                    </li>
                  ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <QueueList
          title="Blocked — needs your help"
          items={blocked}
          empty="Nothing is blocked."
          hint={(i) => `Blocked: ${i.blocker}`}
        />
        <QueueList
          title="Overdue"
          items={overdue}
          empty="Nothing is overdue."
          hint={(i) =>
            `${i.days_overdue} day(s) overdue · ${Math.round(i.progress_percent)}% complete`
          }
        />
        <QueueList
          title="Awaiting verification"
          items={pending}
          empty="Nothing is waiting."
          hint={(i) =>
            i.accepted_evidence === 0
              ? i.unreviewed_evidence
                ? `${i.unreviewed_evidence} evidence item(s) to review`
                : "No evidence provided yet"
              : `${i.accepted_evidence} accepted evidence item(s) — ready to verify`
          }
        />
      </div>
      <p className="text-sm text-ink-500">
        See the full lists in{" "}
        <Link
          className="font-semibold text-brand-700 underline"
          to="/team/commitments?status=blocked"
        >
          blocked
        </Link>
        ,{" "}
        <Link className="font-semibold text-brand-700 underline" to="/team/commitments?overdue=1">
          overdue
        </Link>{" "}
        and{" "}
        <Link
          className="font-semibold text-brand-700 underline"
          to="/team/commitments?verification=pending"
        >
          awaiting verification
        </Link>
        .
      </p>
    </div>
  );
}
