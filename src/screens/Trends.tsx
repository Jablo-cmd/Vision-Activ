import { useMemo, useState } from "react";
import { TrendChart } from "../components/TrendChart";
import { DeltaChip, ScoreValue, dimensionName } from "../components/domain";
import {
  Alert,
  Card,
  EmptyState,
  PageHeader,
  SectionTitle,
  Select,
  Spinner,
  Field,
  TableWrap,
  Td,
  Th,
} from "../components/ui";
import { DIMENSION_WORKFLOWS } from "../framework";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useAssessments, useUserId } from "../hooks/queries";
import { addDays, formatDay, orgToday, weekStart } from "../lib/dates";
import { GRAINS, assessmentsToRows, movement, trendSeries, type Grain } from "../lib/metrics";
import { errorText } from "../services/supabase";

const LOOKBACK = [
  { weeks: 13, label: "Last 3 months" },
  { weeks: 26, label: "Last 6 months" },
  { weeks: 52, label: "Last 12 months" },
];

export function Trends() {
  useDocumentTitle("Trends");
  const userId = useUserId();
  const assessments = useAssessments(userId);
  const [grain, setGrain] = useState<Grain>("week");
  const [weeks, setWeeks] = useState(26);

  const data = assessments.data;
  const rows = useMemo(() => assessmentsToRows(data ?? []), [data]);
  const cutoff = addDays(weekStart(orgToday()), -7 * (weeks - 1));
  const inRange = rows.filter((r) => r.week_start >= cutoff);
  const points = useMemo(() => trendSeries(inRange, grain), [inRange, grain]);

  if (assessments.isPending) return <Spinner />;
  if (assessments.isError) return <Alert tone="error">{errorText(assessments.error)}</Alert>;

  const weekly = data!.filter((a) => a.assessment_type === "weekly");
  const baseline = data!.find((a) => a.assessment_type === "baseline") ?? null;
  const latest = weekly[0] ?? null;
  const previous = weekly[1] ?? null;

  const heatWeeks = weekly.slice(0, 8).reverse();

  return (
    <div className="space-y-6">
      <PageHeader
        title="My trends"
        subtitle="How your self-assessed performance has moved over time, and where it is moving fastest."
      />

      {weekly.length === 0 ? (
        <EmptyState title="No weekly scorecards yet">
          Submit your first weekly scorecard to start your trend line.
        </EmptyState>
      ) : (
        <>
          <Card className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <SectionTitle>Overall score</SectionTitle>
              <div className="flex gap-3">
                <Field label="Show">
                  {(p) => (
                    <Select {...p} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
                      {LOOKBACK.map((l) => (
                        <option key={l.weeks} value={l.weeks}>
                          {l.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Group by">
                  {(p) => (
                    <Select
                      {...p}
                      value={grain}
                      onChange={(e) => setGrain(e.target.value as Grain)}
                    >
                      {GRAINS.map((g) => (
                        <option key={g.key} value={g.key}>
                          {g.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            </div>
            <div className="mt-4">
              {points.length < 2 ? (
                <p className="text-sm text-ink-500">
                  A trend needs at least two periods with data. Keep submitting weekly — you have{" "}
                  {points.length} so far in this view.
                </p>
              ) : null}
              {points.length > 0 && (
                <TrendChart points={points} grain={grain} title="My overall score over time" />
              )}
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle>Dimension movement</SectionTitle>
            <p className="mt-1 text-sm text-ink-500">
              Latest week{latest ? ` (${formatDay(latest.period_start)})` : ""} compared with the
              previous submitted week and with your baseline.
              {!previous && " Movement appears after your second weekly scorecard."}
            </p>
            <div className="mt-3">
              <TableWrap label="Dimension movement">
                <thead>
                  <tr>
                    <Th>Dimension</Th>
                    <Th>Baseline</Th>
                    <Th>Previous</Th>
                    <Th>Latest</Th>
                    <Th>Change</Th>
                    <Th>Since baseline</Th>
                  </tr>
                </thead>
                <tbody>
                  {DIMENSION_WORKFLOWS.map((d) => {
                    const b = baseline?.scores.find((s) => s.dimensionId === d.id)?.score ?? null;
                    const p = previous?.scores.find((s) => s.dimensionId === d.id)?.score ?? null;
                    const l = latest?.scores.find((s) => s.dimensionId === d.id)?.score ?? null;
                    return (
                      <tr key={d.id}>
                        <Td className="font-medium text-ink-900">{d.name}</Td>
                        <Td>
                          <ScoreValue score={b} />
                        </Td>
                        <Td>
                          <ScoreValue score={p} />
                        </Td>
                        <Td>
                          <ScoreValue score={l} />
                        </Td>
                        <Td>
                          <DeltaChip delta={movement(l, p)} />
                        </Td>
                        <Td>
                          <DeltaChip delta={movement(l, b)} />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle>Last {heatWeeks.length} weeks by dimension</SectionTitle>
            <div className="mt-3">
              <TableWrap label="Weekly scores by dimension">
                <thead>
                  <tr>
                    <Th>Dimension</Th>
                    {heatWeeks.map((w) => (
                      <Th key={w.id}>{formatDay(w.period_start)}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DIMENSION_WORKFLOWS.map((d) => (
                    <tr key={d.id}>
                      <Td className="font-medium text-ink-900">{dimensionName(d.id)}</Td>
                      {heatWeeks.map((w) => (
                        <Td key={w.id}>
                          <ScoreValue
                            score={w.scores.find((s) => s.dimensionId === d.id)?.score ?? null}
                          />
                        </Td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
