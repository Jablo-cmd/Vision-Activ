import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner } from "../components/ui";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { formatDateTime } from "../lib/dates";
import { listNotifications, markAllRead, markRead } from "../services/notifications";
import { errorText } from "../services/supabase";

export function Notifications() {
  useDocumentTitle("Notifications");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => listNotifications(100),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["notifications"] });
    void qc.invalidateQueries({ queryKey: ["commitments", "mine", "notifications-preview"] });
  };
  const readOne = useMutation({ mutationFn: (id: string) => markRead([id]), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: markAllRead, onSuccess: refresh });

  if (q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="error">{errorText(q.error)}</Alert>;
  const unread = q.data.filter((n) => !n.read_at).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Reminders, blockers, verification requests and results."
        actions={
          unread > 0 ? (
            <Button
              variant="secondary"
              loading={readAll.isPending}
              onClick={() => readAll.mutate()}
            >
              Mark all as read
            </Button>
          ) : undefined
        }
      />
      {q.data.length === 0 ? (
        <EmptyState title="You are all caught up">
          Reminders and requests appear here as they happen.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {q.data.map((n) => (
            <li key={n.id}>
              <Card className={"p-4 " + (n.read_at ? "" : "border-brand-300")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={n.read_at ? "text-ink-700" : "font-semibold text-ink-900"}>
                      {n.entity_type === "commitment" && n.entity_id ? (
                        <Link
                          to={`/commitments/${n.entity_id}`}
                          onClick={() => !n.read_at && readOne.mutate(n.id)}
                          className="hover:underline"
                        >
                          {n.title}
                        </Link>
                      ) : (
                        n.title
                      )}
                    </p>
                    {n.body && <p className="mt-0.5 text-sm text-ink-500">{n.body}</p>}
                    <p className="mt-1 text-xs text-ink-500">{formatDateTime(n.created_at)}</p>
                  </div>
                  {n.read_at ? (
                    <Badge>Read</Badge>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => readOne.mutate(n.id)}>
                      Mark as read
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
