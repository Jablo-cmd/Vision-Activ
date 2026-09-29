import { type FormEvent, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Button, Card } from "../components/ui";
export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#2563EB] p-5">
      <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[#2563EB]/20 blur-3xl" />
      <div className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-[#93C5FD]/20 blur-3xl" />
      <Card className="relative w-full max-w-md border-white/60 p-8 shadow-2xl">
        <div className="mb-8">
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-[#60A5FA]">
            Vision Activ
          </div>
          <h1 className="mt-2 text-3xl font-bold text-[#2563EB]">Performance Workspace</h1>
          <p className="mt-2 text-sm text-[#64748B]">Assess. Commit. Track. Review. Improve.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="sr-only" htmlFor="login-email">
            Work email
          </label>
          <input
            id="login-email"
            autoComplete="email"
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Work email"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10"
          />
          <label className="sr-only" htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            autoComplete="current-password"
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10"
          />
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button disabled={busy} className="w-full bg-[#60A5FA] text-white hover:bg-[#3B82F6]">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
