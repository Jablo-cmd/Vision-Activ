import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { DueBadge } from "../components/CommitmentCard";
import { StatusBadge, VerificationBadge, dimensionName } from "../components/domain";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  PageHeader,
  ProgressBar,
  Select,
  Spinner,
  TableWrap,
  Td,
  Th,
} from "../components/ui";
import type { CommitmentStatus, VerificationStatus } from "../domain";
import { DIMENSION_WORKFLOWS } from "../framework";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { nameOf, useDirectory } from "../hooks/queries";
import { orgToday } from "../lib/dates";
import { listTeamCommitments } from "../services/commitments";
import { errorText } from "../services/supabase";

const STATUSES: CommitmentStatus[] = ["not_started", "in_progress", "blocked", "complete"];
const VERIFICATIONS: VerificationStatus[] = ["pending", "verified", "rejected", "unverified"];
const PAGE_SIZE = 25;

export function TeamCommitments() {
  useDocumentTitle("Team commitments");
  const [params, setParams] = useSearchParams();
  const directory = useDirectory();
  const today = orgToday();

  const status = (STATUSES as string[]).includes(params.get("status") ?? "")
    ? (params.get("status") as CommitmentStatus)
    : undefined;
  const verification = (VERIFICATIONS as string[]).includes(params.get("verification") ?? "")
    ? (params.get("verification") as VerificationStatus)
    : undefined;
  const person = params.get("person") ?? undefined;
  const dimension = params.get("dimension") ?? undefined;
  const overdue = params.get("overdue") === "1";
  const page = Math.max(0, Number(params.get("page") ?? 0) || 0);

  const q = useQuery({
    queryKey: ["team-commitments", { status, verification, person, dimension, overdue, page }],
    queryFn: () =>
      listTeamCommitments({
        status,
        verification,
        userId: person,
        dimensionId: dimension,
        dueBefore: overdue ? today : undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: (prev) => prev,
  });

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next, { replace: true });
  };
  const goPage = (n: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(n));
    setParams(next, { replace: true });
  };

  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team commitments"
        subtitle="Every commitment in your reporting line. Filters are kept in the address so you can share a view."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Person">
          {(p) => (
            <Select
              {...p}
              value={person ?? ""}
              onChange={(e) => set("person", e.target.value || null)}
            >
              <option value="">Everyone</option>
              {(directory.data ?? [])
                .filter((d) => d.role)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name || d.email}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Status">
          {(p) => (
            <Select
              {...p}
              value={status ?? ""}
              onChange={(e) => set("status", e.target.value || null)}
            >
              <option value="">Any status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Verification">
          {(p) => (
            <Select
              {...p}
              value={verification ?? ""}
              onChange={(e) => set("verification", e.target.value || null)}
            >
              <option value="">Any</option>
              <option value="pending">Awaiting verification</option>
              <option value="verified">Verified</option>
              <option value="rejected">Reopened</option>
              <option value="unverified">Not submitted</option>
            </Select>
          )}
        </Field>
        <Field label="Dimension">
          {(p) => (
            <Select
              {...p}
              value={dimension ?? ""}
              onChange={(e) => set("dimension", e.target.value || null)}
            >
              <option value="">All dimensions</option>
              {DIMENSION_WORKFLOWS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-ink-900">
          <input
            type="checkbox"
            className="size-4 accent-brand-700"
            checked={overdue}
            onChange={(e) => set("overdue", e.target.checked ? "1" : null)}
          />
          Overdue only
        </label>
      </div>

      {q.isPending && <Spinner />}
      {q.isError && <Alert tone="error">{errorText(q.error)}</Alert>}
      {q.data && q.data.rows.length === 0 && (
        <EmptyState title="No commitments match these filters" />
      )}
      {q.data && q.data.rows.length > 0 && (
        <>
          <TableWrap label="Team commitments">
            <thead>
              <tr>
                <Th>Commitment</Th>
                <Th>Person</Th>
                <Th>Dimension</Th>
                <Th>Status</Th>
                <Th>Progress</Th>
                <Th>Due</Th>
              </tr>
            </thead>
            <tbody>
              {q.data.rows.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <Link
                      to={`/commitments/${c.id}`}
                      className="font-semibold text-brand-700 hover:underline"
                    >
                      {c.title}
                    </Link>
                  </Td>
                  <Td>{nameOf(directory.data, c.user_id)}</Td>
                  <Td>{dimensionName(c.dimension_id)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={c.status} />
                      <VerificationBadge status={c.verification_status} />
                    </div>
                  </Td>
                  <Td className="min-w-32">
                    <ProgressBar value={c.progress_percent} label={`Progress for ${c.title}`} />
                    <span className="text-xs tabular-nums">{Math.round(c.progress_percent)}%</span>
                  </Td>
                  <Td>
                    <DueBadge c={c} today={today} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <nav
            aria-label="Pagination"
            className="flex items-center justify-between text-sm text-ink-700"
          >
            <span>
              {total} commitment(s) · page {page + 1} of {pages}
            </span>
            <span className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 0}
                onClick={() => goPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page + 1 >= pages}
                onClick={() => goPage(page + 1)}
              >
                Next
              </Button>
            </span>
          </nav>
        </>
      )}
    </div>
  );
}
