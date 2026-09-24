import { FormEvent, useState } from "react";
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

  return <div className="flex min-h-screen items-center justify-center bg-[#071a35] p-5">
    <Card className="w-full max-w-md p-8">
      <div className="mb-8">
        <div className="text-xs font-bold uppercase tracking-[0.25em] text-orange-500">Vision Activ</div>
        <h1 className="mt-2 text-3xl font-bold text-[#071a35]">Performance Workspace</h1>
        <p className="mt-2 text-sm text-slate-500">Assess. Commit. Track. Review. Improve.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Work email" className="w-full rounded-xl border border-slate-200 px-4 py-3" />
        <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full rounded-xl border border-slate-200 px-4 py-3" />
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <Button disabled={busy} className="w-full bg-orange-500 text-white">{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
    </Card>
  </div>;
}
