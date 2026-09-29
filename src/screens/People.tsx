import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  SectionTitle,
  Select,
  Spinner,
  TableWrap,
  Td,
  Th,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABEL, type Role } from "../domain";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { keys, useDirectory } from "../hooks/queries";
import {
  adminAddMember,
  adminUpdateMember,
  displayName,
  inviteUser,
  type Person,
} from "../services/people";
import { errorText } from "../services/supabase";

const ROLES: Role[] = ["employee", "manager", "ceo", "admin"];

function InviteForm({ assignable }: { assignable: Role[] }) {
  const qc = useQueryClient();
  const directory = useDirectory();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [manager, setManager] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const invite = useMutation({
    mutationFn: () =>
      inviteUser({ email: email.trim(), fullName: name.trim(), role, managerId: manager || null }),
    onSuccess: () => {
      setMessage({
        tone: "success",
        text: `Invitation sent to ${email.trim()}. They choose a password from the email link.`,
      });
      setEmail("");
      setName("");
      void qc.invalidateQueries({ queryKey: keys.directory });
    },
    onError: (e) => setMessage({ tone: "error", text: errorText(e) }),
  });

  return (
    <Card className="p-5">
      <SectionTitle>Invite someone</SectionTitle>
      <form
        className="mt-3 grid gap-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          invite.mutate();
        }}
      >
        {message && (
          <div className="md:col-span-2">
            <Alert tone={message.tone}>{message.text}</Alert>
          </div>
        )}
        <Field label="Full name">
          {(p) => (
            <Input
              {...p}
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Work email">
          {(p) => (
            <Input
              {...p}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field label="Role">
          {(p) => (
            <Select {...p} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {assignable.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Reports to">
          {(p) => (
            <Select {...p} value={manager} onChange={(e) => setManager(e.target.value)}>
              <option value="">No manager</option>
              {(directory.data ?? [])
                .filter((d) => d.role && d.active)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {displayName(d)}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <div className="md:col-span-2">
          <Button type="submit" loading={invite.isPending} disabled={!email || !name}>
            Send invitation
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Row({
  p,
  all,
  assignable,
  isSelf,
}: {
  p: Person;
  all: Person[];
  assignable: Role[];
  isSelf: boolean;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const refresh = () => void qc.invalidateQueries({ queryKey: keys.directory });
  const change = useMutation({
    mutationFn: (args: Parameters<typeof adminUpdateMember>[0]) => adminUpdateMember(args),
    onSuccess: () => {
      setError("");
      refresh();
    },
    onError: (e) => setError(errorText(e)),
  });
  const grant = useMutation({
    mutationFn: () => adminAddMember({ userId: p.id, role: "employee", managerId: null }),
    onSuccess: () => {
      setError("");
      refresh();
    },
    onError: (e) => setError(errorText(e)),
  });
  const locked = isSelf || (p.role !== null && !assignable.includes(p.role));

  return (
    <tr className={p.active || !p.role ? "" : "opacity-70"}>
      <Td>
        <p className="font-semibold text-ink-900">{displayName(p)}</p>
        <p className="text-xs text-ink-500">{p.email}</p>
        {error && (
          <p role="alert" className="mt-1 text-xs font-medium text-bad-700">
            {error}
          </p>
        )}
      </Td>
      {p.role ? (
        <>
          <Td>
            <Select
              aria-label={`Role for ${displayName(p)}`}
              value={p.role}
              disabled={locked || change.isPending}
              onChange={(e) => change.mutate({ userId: p.id, role: e.target.value as Role })}
            >
              {ROLES.filter((r) => assignable.includes(r) || r === p.role).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Td>
          <Td>
            <Select
              aria-label={`Manager for ${displayName(p)}`}
              value={p.manager_user_id ?? ""}
              disabled={change.isPending}
              onChange={(e) =>
                change.mutate(
                  e.target.value
                    ? { userId: p.id, managerId: e.target.value }
                    : { userId: p.id, clearManager: true },
                )
              }
            >
              <option value="">No manager</option>
              {all
                .filter((o) => o.role && o.active && o.id !== p.id)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {displayName(o)}
                  </option>
                ))}
            </Select>
          </Td>
          <Td>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-brand-700"
                aria-label={`Track performance for ${displayName(p)}`}
                checked={p.tracked}
                disabled={change.isPending}
                onChange={(e) => change.mutate({ userId: p.id, tracked: e.target.checked })}
              />
              {p.tracked ? "Tracked" : "Not tracked"}
            </label>
          </Td>
          <Td>
            <Button
              size="sm"
              variant={p.active ? "secondary" : "primary"}
              disabled={locked}
              loading={change.isPending}
              onClick={() => change.mutate({ userId: p.id, active: !p.active })}
            >
              {p.active ? "Deactivate" : "Reactivate"}
            </Button>
          </Td>
        </>
      ) : (
        <>
          <Td colSpan={3}>
            <Badge tone="warn">Has an account but no access</Badge>
          </Td>
          <Td>
            <Button size="sm" loading={grant.isPending} onClick={() => grant.mutate()}>
              Grant employee access
            </Button>
          </Td>
        </>
      )}
    </tr>
  );
}

export function People() {
  useDocumentTitle("People");
  const { role, user } = useAuth();
  const directory = useDirectory();
  const assignable: Role[] = role === "admin" ? ROLES : ["employee", "manager"];

  return (
    <div className="space-y-6">
      <PageHeader
        title="People"
        subtitle="Who can use Vision Activ, what they can do, and who they report to. Every change is recorded in the audit log."
      />
      {role === "ceo" && (
        <Alert tone="info">
          As CEO you can add employees and managers. Only an administrator can grant or change CEO
          and administrator access.
        </Alert>
      )}
      <InviteForm assignable={assignable} />
      {directory.isPending && <Spinner />}
      {directory.isError && <Alert tone="error">{errorText(directory.error)}</Alert>}
      {directory.data && (
        <TableWrap label="People">
          <thead>
            <tr>
              <Th>Person</Th>
              <Th>Role</Th>
              <Th>Reports to</Th>
              <Th>Performance</Th>
              <Th>Access</Th>
            </tr>
          </thead>
          <tbody>
            {directory.data.map((p) => (
              <Row
                key={p.id}
                p={p}
                all={directory.data}
                assignable={assignable}
                isSelf={p.id === user?.id}
              />
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
