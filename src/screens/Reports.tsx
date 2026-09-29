import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { DeltaChip, ScoreValue } from "../components/domain";
import {
  Alert,
  Button,
  Card,
  PageHeader,
  SectionTitle,
  Spinner,
  Stat,
  TableWrap,
  Td,
  Th,
} from "../components/ui";
import { DIMENSION_WORKFLOWS } from "../framework";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useSubmissionRates, useWeeklyScores } from "../hooks/useOrgData";
import { addDays, formatDate, orgToday } from "../lib/dates";
import {
  PERIODS,
  anchorWeek,
  dimensionAverages,
  movement,
  overallScore,
  periodWindow,
  toCsv,
  type Period,
} from "../lib/metrics";
import { countCommitments } from "../services/commitments";
import { errorText } from "../services/supabase";

export function Reports() {
  useDocumentTitle("Reports");
  const [period, setPeriod] = useState<Period>("month");
  const scores = useWeeklyScores();
  const rates = useSubmissionRates();
  const today = orgToday();

  const view = useMemo(() => {
    if (!scores.data) return null;
    const anchor = anchorWeek(scores.data, today);
    const cur = periodWindow(anchor, period);
    const prev = periodWindow(anchor, period, 1);
    const now = dimensionAverages(scores.data, cur);
    const before = dimensionAverages(scores.data, prev);
    return {
      cur,
      prev,
      now,
      before,
      overall: overallScore(now),
      prevOverall: overallScore(before),
    };
  }, [scores.data, period, today]);

  const counts = useQuery({
    queryKey: ["report-counts", view?.cur.start, view?.cur.end],
    enabled: Boolean(view),
    queryFn: async () => {
      const from = view!.cur.start;
      const before = addDays(view!.cur.end, 1);
      const [created, completed, verified] = await Promise.all([
        countCommitments({ createdFrom: from, createdBefore: before }),
        countCommitments({ completedFrom: from, completedBefore: before }),
        countCommitments({ verifiedFrom: from, verifiedBefore: before }),
      ]);
      return { created, completed, verified };
    },
  });

  if (scores.isPending) return <Spinner />;
  if (scores.isError) return <Alert tone="error">{errorText(scores.error)}</Alert>;
  if (!view) return null;

  const windowRates = (rates.data ?? []).filter(
    (r) => r.week_start >= view.cur.start && r.week_start <= view.cur.end,
  );
  const submitted = windowRates.reduce((n, r) => n + r.submitted, 0);
  const expected = windowRates.reduce((n, r) => n + r.expected, 0);
  const responses = view.now.reduce((n, a) => n + a.responses, 0);
  const label = PERIODS.find((p) => p.key === period)!.label;

  const exportCsv = () => {
    const rows: (string | number | null)[][] = [
      ["Vision Activ consolidated report"],
      ["Period", label],
      ["From", view.cur.start],
      ["To", view.cur.end],
      ["Generated", today],
      [],
      ["Dimension", "Average score", "Previous period", "Change", "Responses"],
      ...DIMENSION_WORKFLOWS.map((d) => {
        const n = view.now.find((x) => x.dimensionId === d.id)!;
        const b = view.before.find((x) => x.dimensionId === d.id)!;
        return [d.name, n.avg, b.avg, movement(n.avg, b.avg), n.responses];
      }),
      [],
      [
        "Overall score",
        view.overall,
        view.prevOverall,
        movement(view.overall, view.prevOverall),
        responses,
      ],
      ["Weekly submissions", submitted],
      ["Expected submissions", expected],
      ["Commitments created", counts.data?.created ?? null],
      ["Commitments completed", counts.data?.completed ?? null],
      ["Commitments verified", counts.data?.verified ?? null],
    ];
    const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vision-activ-report-${period}-${view.cur.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle={`${label} consolidation: ${formatDate(view.cur.start)} to ${formatDate(view.cur.end)}, compared with the previous ${view.cur.weeks} week(s).`}
        actions={
          <div className="no-print flex gap-2">
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={16} aria-hidden="true" /> Print
            </Button>
            <Button onClick={exportCsv}>
              <Download size={16} aria-hidden="true" /> Export CSV
            </Button>
          </div>
        }
      />

      <div role="group" aria-label="Reporting period" className="no-print flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={period === p.key}
            onClick={() => setPeriod(p.key)}
            className={
              "rounded-lg border px-3 py-1.5 text-sm font-semibold " +
              (period === p.key
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-line bg-white text-brand-800 hover:bg-brand-50")
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Overall score"
          value={view.overall === null ? "—" : view.overall.toFixed(1)}
          tone="brand"
          hint={
            <span className="inline-flex items-center gap-1">
              vs previous <DeltaChip delta={movement(view.overall, view.prevOverall)} />
            </span>
          }
        />
        <Stat
          label="Weekly submissions"
          value={expected ? `${submitted}/${expected}` : submitted}
          hint={
            expected ? `${Math.round((submitted / expected) * 100)}% submission rate` : undefined
          }
        />
        <Stat
          label="Commitments completed"
          value={counts.data?.completed ?? "—"}
          hint={
            counts.data
              ? `${counts.data.created} created · ${counts.data.verified} verified`
              : undefined
          }
        />
        <Stat label="Scored responses" value={responses} />
      </div>

      <Card className="p-5">
        <SectionTitle>Dimension averages</SectionTitle>
        <p className="mt-1 text-sm text-ink-500">
          Weighted by number of responses. A dash means no one was scored on that dimension in the
          period.
        </p>
        <div className="mt-3">
          <TableWrap label="Dimension averages">
            <thead>
              <tr>
                <Th>Dimension</Th>
                <Th>This period</Th>
                <Th>Previous</Th>
                <Th>Change</Th>
                <Th>Responses</Th>
              </tr>
            </thead>
            <tbody>
              {DIMENSION_WORKFLOWS.map((d) => {
                const n = view.now.find((x) => x.dimensionId === d.id)!;
                const b = view.before.find((x) => x.dimensionId === d.id)!;
                return (
                  <tr key={d.id}>
                    <Td className="font-medium text-ink-900">{d.name}</Td>
                    <Td>
                      <ScoreValue score={n.avg} />
                    </Td>
                    <Td>
                      <ScoreValue score={b.avg} />
                    </Td>
                    <Td>
                      <DeltaChip delta={movement(n.avg, b.avg)} />
                    </Td>
                    <Td className="tabular-nums">{n.responses}</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </div>
      </Card>
    </div>
  );
}
