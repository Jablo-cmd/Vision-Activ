import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DeltaChip, ScoreValue } from "../components/domain";
import {
  Alert,
  Badge,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Spinner,
  TableWrap,
  Td,
  Th,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABEL } from "../domain";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useMemberStatus } from "../hooks/useOrgData";
import { attentionReasons, movement } from "../lib/metrics";
import { errorText } from "../services/supabase";

export function Team() {
  useDocumentTitle("Team");
  const { user } = useAuth();
  const q = useMemberStatus();
  const [search, setSearch] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (q.data ?? [])
      .filter((m) => m.user_id !== user?.id)
      .map((m) => ({ m, reasons: attentionReasons(m) }))
      .filter(
        ({ m, reasons }) =>
          (!onlyFlagged || reasons.length > 0) &&
          (!term || `${m.full_name} ${m.email}`.toLowerCase().includes(term)),
      )
      .sort(
        (a, b) =>
          b.reasons.length - a.reasons.length ||
          (a.m.full_name || a.m.email).localeCompare(b.m.full_name || b.m.email),
      );
  }, [q.data, user?.id, search, onlyFlagged]);

  if (q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="error">{errorText(q.error)}</Alert>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        subtitle="Everyone in your reporting line, ordered by who most needs your attention."
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Find a person" className="sm:w-72">
          {(p) => (
            <Input
              {...p}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm font-medium text-ink-900">
          <input
            type="checkbox"
            className="size-4 accent-brand-700"
            checked={onlyFlagged}
            onChange={(e) => setOnlyFlagged(e.target.checked)}
          />
          Needs attention only
        </label>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No people to show">
          {q.data.length <= 1 ? "No one reports to you yet." : "No one matches these filters."}
        </EmptyState>
      ) : (
        <TableWrap label="Team members">
          <thead>
            <tr>
              <Th>Person</Th>
              <Th>Score</Th>
              <Th>Change</Th>
              <Th>This week</Th>
              <Th>Missed (4 wks)</Th>
              <Th>Open</Th>
              <Th>Overdue</Th>
              <Th>Blocked</Th>
              <Th>To verify</Th>
              <Th>Attention</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, reasons }) => (
              <tr key={m.user_id} className={m.active ? "" : "opacity-60"}>
                <Td>
                  <Link
                    to={`/team/${m.user_id}`}
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    {m.full_name || m.email}
                  </Link>
                  <p className="text-xs text-ink-500">
                    {ROLE_LABEL[m.role]}
                    {m.active ? "" : " · deactivated"}
                  </p>
                </Td>
                <Td>
                  <ScoreValue score={m.latest_score} />
                </Td>
                <Td>
                  <DeltaChip delta={movement(m.latest_score, m.previous_score)} />
                </Td>
                <Td>
                  {!m.tracked ? (
                    <Badge>Not tracked</Badge>
                  ) : m.submitted_current ? (
                    <Badge tone="ok">Submitted</Badge>
                  ) : (
                    <Badge tone="warn">Not yet</Badge>
                  )}
                </Td>
                <Td className="tabular-nums">{m.missed_last_4}</Td>
                <Td className="tabular-nums">{m.open_commitments}</Td>
                <Td
                  className={
                    "tabular-nums " + (m.overdue_commitments ? "font-semibold text-bad-700" : "")
                  }
                >
                  {m.overdue_commitments}
                </Td>
                <Td
                  className={
                    "tabular-nums " + (m.blocked_commitments ? "font-semibold text-bad-700" : "")
                  }
                >
                  {m.blocked_commitments}
                </Td>
                <Td className="tabular-nums">{m.pending_verification}</Td>
                <Td>
                  {reasons.length ? (
                    <span className="text-sm text-warn-700">{reasons.join(" · ")}</span>
                  ) : (
                    <span className="text-ink-500">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
