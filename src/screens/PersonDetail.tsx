import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { CommitmentCard } from "../components/CommitmentCard";
import { TrendChart } from "../components/TrendChart";
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
  TableWrap,
  Td,
  Th,
} from "../components/ui";
import { ROLE_LABEL } from "../domain";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { nameOf, useDirectory } from "../hooks/queries";
import { formatDate, formatDay } from "../lib/dates";
import { assessmentAverage, assessmentsToRows, movement, trendSeries } from "../lib/metrics";
import { listAssessments } from "../services/assessments";
import { listTeamCommitments } from "../services/commitments";
import { listReviews } from "../services/reviews";
import { errorText } from "../services/supabase";

export function PersonDetail() {
  const { userId = "" } = useParams();
  const directory = useDirectory();
  const person = directory.data?.find((p) => p.id === userId);
  useDocumentTitle(person ? person.full_name || person.email : "Person");

  const assessments = useQuery({
    queryKey: ["assessments", userId],
    queryFn: () => listAssessments(userId, 60),
    enabled: Boolean(userId),
  });
  const commitments = useQuery({
    queryKey: ["team-commitments", "person", userId],
    queryFn: () => listTeamCommitments({ userId, pageSize: 50 }),
    enabled: Boolean(userId),
  });
  const reviews = useQuery({ queryKey: ["reviews"], queryFn: listReviews });

  const weekly = useMemo(
    () => (assessments.data ?? []).filter((a) => a.assessment_type === "weekly"),
    [assessments.data],
  );
  const baseline = (assessments.data ?? []).find((a) => a.assessment_type === "baseline") ?? null;
  const points = useMemo(
    () => trendSeries(assessmentsToRows(assessments.data ?? []), "week"),
    [assessments.data],
  );

  if (directory.isPending || assessments.isPending) return <Spinner />;
  if (!person) {
    return (
      <EmptyState
        title="Person not found"
        action={
          <Link className="font-semibold text-brand-700 underline" to="/team">
            Back to team
          </Link>
        }
      >
        They may not be in your reporting line.
      </EmptyState>
    );
  }
  if (assessments.isError) return <Alert tone="error">{errorText(assessments.error)}</Alert>;

  const latest = weekly[0] ?? null;
  const previous = weekly[1] ?? null;
  const theirReviews = (reviews.data ?? []).filter((r) => r.subject_user_id === userId);

  return (
    <div className="space-y-6">
      <Link
        to="/team"
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Team
      </Link>
      <PageHeader
        title={person.full_name || person.email}
        subtitle={
          <span>
            {person.role ? ROLE_LABEL[person.role] : "No access"}
            {person.manager_user_id
              ? ` · reports to ${nameOf(directory.data, person.manager_user_id)}`
              : ""}
            {person.active ? "" : " · deactivated"}
          </span>
        }
        actions={
          <Link to={`/review?subject=${userId}`}>
            <Button>Start a review</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-ink-500">Latest weekly score</p>
          <p className="mt-1">
            <ScoreValue score={assessmentAverage(latest)} className="text-2xl" />
          </p>
          <p className="mt-1 text-xs text-ink-500">
            {latest ? `Week of ${formatDay(latest.period_start)}` : "No weekly scorecard yet"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Change vs previous week</p>
          <p className="mt-2">
            <DeltaChip
              delta={movement(assessmentAverage(latest), assessmentAverage(previous))}
              showLabel
            />
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Since baseline</p>
          <p className="mt-2">
            <DeltaChip
              delta={movement(assessmentAverage(latest), assessmentAverage(baseline))}
              showLabel
            />
          </p>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle>Score trend</SectionTitle>
        <div className="mt-3">
          {points.length === 0 ? (
            <p className="text-sm text-ink-500">No weekly scorecards yet.</p>
          ) : (
            <TrendChart points={points} grain="week" title="Overall score over time" />
          )}
        </div>
      </Card>

      {latest && (
        <Card className="p-5">
          <SectionTitle>Latest scorecard with evidence</SectionTitle>
          <p className="mt-1 text-sm text-ink-500">
            Submitted {formatDate(latest.submitted_at)} · week of {formatDay(latest.period_start)}
          </p>
          <div className="mt-3">
            <TableWrap label="Latest scorecard">
              <thead>
                <tr>
                  <Th>Dimension</Th>
                  <Th>Self-rating</Th>
                  <Th>Baseline</Th>
                  <Th>Evidence provided</Th>
                </tr>
              </thead>
              <tbody>
                {latest.scores.map((s) => (
                  <tr key={s.dimensionId}>
                    <Td className="font-medium text-ink-900">{dimensionName(s.dimensionId)}</Td>
                    <Td>
                      <ScoreValue score={s.score} />
                    </Td>
                    <Td>
                      <ScoreValue
                        score={
                          baseline?.scores.find((b) => b.dimensionId === s.dimensionId)?.score ??
                          null
                        }
                      />
                    </Td>
                    <Td className="max-w-md whitespace-pre-wrap">
                      {s.evidence || <Badge tone="warn">No evidence</Badge>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        </Card>
      )}

      <section aria-labelledby="person-commitments" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="person-commitments" className="text-lg font-semibold text-ink-900">
            Commitments
          </h2>
          <Link
            className="text-sm font-semibold text-brand-700 hover:underline"
            to={`/team/commitments?person=${userId}`}
          >
            Open in team view
          </Link>
        </div>
        {commitments.isPending && <Spinner />}
        {commitments.isError && <Alert tone="error">{errorText(commitments.error)}</Alert>}
        {commitments.data && commitments.data.rows.length === 0 && (
          <p className="text-sm text-ink-500">No commitments yet.</p>
        )}
        <div className="grid gap-3">
          {commitments.data?.rows.map((c) => (
            <CommitmentCard key={c.id} c={c} />
          ))}
        </div>
      </section>

      <Card className="p-5">
        <SectionTitle>Reviews</SectionTitle>
        {theirReviews.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">No reviews recorded.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {theirReviews.map((r) => (
              <li key={r.id} className="rounded-lg border border-line p-3 text-sm">
                <p className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                  {r.status === "scheduled" && <Badge tone="brand">Scheduled</Badge>}
                  <span>
                    {formatDate(r.reviewed_at.slice(0, 10))} · by{" "}
                    {nameOf(directory.data, r.reviewer_id)}
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-ink-700">{r.notes}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
