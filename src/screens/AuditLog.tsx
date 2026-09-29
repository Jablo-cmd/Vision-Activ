import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Spinner,
} from "../components/ui";
import type { AuditRow } from "../domain";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { nameOf, useDirectory } from "../hooks/queries";
import { formatDateTime } from "../lib/dates";
import { listAudit } from "../services/audit";
import { errorText } from "../services/supabase";

const TABLES = [
  "assessments",
  "scorecard_entries",
  "commitments",
  "commitment_updates",
  "evidence_items",
  "management_reviews",
  "organization_members",
  "weekly_cycles",
];
const SKIP = new Set(["id", "created_at", "updated_at", "organization_id", "scores", "metrics"]);

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "∅";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

function Entry({ r, actor }: { r: AuditRow; actor: string }) {
  const changes =
    r.op === "UPDATE"
      ? (r.changed_columns ?? [])
          .filter((c) => !SKIP.has(c))
          .map((c) => `${c}: ${show(r.old_row?.[c])} → ${show(r.new_row?.[c])}`)
      : [];
  const summary =
    r.op === "INSERT"
      ? String(r.new_row?.title ?? r.new_row?.kind ?? "created")
      : r.op === "DELETE"
        ? "removed"
        : null;
  return (
    <li className="rounded-lg border border-line bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={r.op === "INSERT" ? "ok" : r.op === "UPDATE" ? "brand" : "bad"}>
          {r.op.toLowerCase()}
        </Badge>
        <span className="font-semibold text-ink-900">{r.table_name.replace("_", " ")}</span>
        <span className="text-ink-500">by {actor}</span>
        <span className="ml-auto text-xs text-ink-500">{formatDateTime(r.at)}</span>
      </div>
      {summary && <p className="mt-1 text-ink-700">{summary}</p>}
      {changes.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-ink-700">
          {changes.map((c) => (
            <li key={c} className="break-words">
              {c}
            </li>
          ))}
        </ul>
      )}
      {r.op === "UPDATE" && changes.length === 0 && (
        <p className="mt-1 text-ink-500">
          Content updated ({(r.changed_columns ?? []).join(", ")}).
        </p>
      )}
    </li>
  );
}

export function AuditLog() {
  useDocumentTitle("Audit log");
  const directory = useDirectory();
  const [table, setTable] = useState("");
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["audit", table, page],
    queryFn: () => listAudit({ table: table || undefined, page }),
    placeholderData: (p) => p,
  });
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / 50));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        subtitle="An append-only record of who changed what, and when. Entries are written by the database and cannot be edited or deleted."
      />
      <Field label="Record type" className="sm:w-72">
        {(p) => (
          <Select
            {...p}
            value={table}
            onChange={(e) => {
              setTable(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Everything</option>
            {TABLES.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {q.isPending && <Spinner />}
      {q.isError && <Alert tone="error">{errorText(q.error)}</Alert>}
      {q.data && q.data.rows.length === 0 && <EmptyState title="No entries yet" />}
      {q.data && q.data.rows.length > 0 && (
        <>
          <ol className="space-y-2">
            {q.data.rows.map((r) => (
              <Entry
                key={r.id}
                r={r}
                actor={r.actor_id ? nameOf(directory.data, r.actor_id) : "system"}
              />
            ))}
          </ol>
          <nav
            aria-label="Pagination"
            className="flex items-center justify-between text-sm text-ink-700"
          >
            <span>
              {q.data.total} entries · page {page + 1} of {pages}
            </span>
            <span className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Newer
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page + 1 >= pages}
                onClick={() => setPage(page + 1)}
              >
                Older
              </Button>
            </span>
          </nav>
        </>
      )}
    </div>
  );
}
