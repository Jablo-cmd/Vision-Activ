import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Card, Field, Input } from "../components/ui";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { errorText } from "../services/supabase";

function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-canvas p-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-brand-100/80 to-transparent"
      />
      <Card className="relative w-full max-w-md p-6 sm:p-8">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-brand-700">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-brand-600" />
          Vision Activ
        </p>
        <h1 className="mt-2 text-3xl text-ink-900">{title}</h1>
        <p className="mt-1 text-sm text-ink-500">{subtitle}</p>
        <div className="mt-6">{children}</div>
        <p className="mt-6 border-t border-line pt-4 text-center text-xs text-ink-500">
          Assess · Commit · Track · Act · Verify · Review · Improve
        </p>
      </Card>
    </div>
  );
}

export function Login() {
  useDocumentTitle("Sign in");
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
    } catch (err) {
      setError(errorText(err, "Sign-in failed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Performance workspace"
      subtitle="Assess. Commit. Track. Act. Verify. Review. Improve."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Work email">
          {(p) => (
            <Input
              {...p}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field label="Password">
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" loading={busy} className="w-full" disabled={!email || !password}>
          {busy ? "Signing in" : "Sign in"}
        </Button>
        <p className="text-center text-sm">
          <Link to="/forgot-password" className="font-semibold text-brand-700 underline">
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export function ForgotPassword() {
  useDocumentTitle("Reset password");
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We will email you a link to choose a new password."
    >
      {sent ? (
        <div className="space-y-4">
          <Alert tone="success">
            If an account exists for that address, a reset link is on its way.
          </Alert>
          <Link to="/login" className="font-semibold text-brand-700 underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Work email">
            {(p) => (
              <Input
                {...p}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" loading={busy} className="w-full" disabled={!email}>
            Send reset link
          </Button>
          <p className="text-center text-sm">
            <Link to="/login" className="font-semibold text-brand-700 underline">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}

export const MIN_PASSWORD_LENGTH = 10;

export function ResetPassword() {
  useDocumentTitle("Choose a new password");
  const { session, updatePassword, status } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (tooShort || mismatch || !password) return;
    setBusy(true);
    setError("");
    try {
      await updatePassword(password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading") {
    return (
      <AuthLayout title="Choose a new password" subtitle="Checking your reset link…">
        <p role="status" className="text-sm text-ink-500">
          Please wait…
        </p>
      </AuthLayout>
    );
  }

  if (!session) {
    return (
      <AuthLayout
        title="Link expired"
        subtitle="This password reset link is invalid or has expired."
      >
        <Link to="/forgot-password" className="font-semibold text-brand-700 underline">
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle={`Use at least ${MIN_PASSWORD_LENGTH} characters.`}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field
          label="New password"
          error={tooShort ? `Use at least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
        >
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Confirm new password"
          error={mismatch ? "The passwords do not match." : undefined}
        >
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </Field>
        <Button
          type="submit"
          loading={busy}
          className="w-full"
          disabled={!password || tooShort || mismatch}
        >
          Save password
        </Button>
      </form>
    </AuthLayout>
  );
}
