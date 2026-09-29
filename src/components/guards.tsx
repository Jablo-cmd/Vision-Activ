import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { Role } from "../domain";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { Shell } from "./Shell";
import { Button, Card, Spinner } from "./ui";
import { Link } from "react-router-dom";

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-canvas p-6">{children}</div>;
}

export function ConfigError() {
  useDocumentTitle("Configuration required");
  return (
    <FullScreen>
      <Card className="max-w-md p-8 text-center">
        <h1 className="text-xl font-bold text-ink-900">Configuration required</h1>
        <p className="mt-2 text-sm text-ink-500">
          This deployment is missing its Supabase configuration. An administrator needs to set
          <code className="mx-1 rounded bg-brand-50 px-1">VITE_SUPABASE_URL</code> and
          <code className="mx-1 rounded bg-brand-50 px-1">VITE_SUPABASE_PUBLISHABLE_KEY</code>.
        </p>
      </Card>
    </FullScreen>
  );
}

export function AwaitingAccess() {
  const { signOut, user } = useAuth();
  useDocumentTitle("Awaiting access");
  return (
    <FullScreen>
      <Card className="max-w-md p-8 text-center">
        <h1 className="text-xl font-bold text-ink-900">Your account is not active yet</h1>
        <p className="mt-2 text-sm text-ink-500">
          You are signed in as <strong>{user?.email}</strong>, but you have not been added to the
          Vision Activ workspace. Ask your administrator or CEO to grant you access, then sign in
          again.
        </p>
        <Button className="mt-6" variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </Card>
    </FullScreen>
  );
}

function LoadFailed() {
  const { retryMembership, signOut } = useAuth();
  return (
    <FullScreen>
      <Card className="max-w-md p-8 text-center">
        <h1 className="text-xl font-bold text-ink-900">We could not load your workspace</h1>
        <p className="mt-2 text-sm text-ink-500">
          Check your connection and try again. Your data has not been changed.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={retryMembership}>Try again</Button>
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </Card>
    </FullScreen>
  );
}

/** Everything behind sign-in. Handles every auth state explicitly so nothing renders half-loaded. */
export function RequireAuth() {
  const { status, recovery } = useAuth();
  const location = useLocation();
  if (status === "unconfigured") return <ConfigError />;
  if (status === "loading") {
    return (
      <FullScreen>
        <Spinner label="Loading your workspace" />
      </FullScreen>
    );
  }
  if (status === "signed_out")
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (recovery) return <Navigate to="/reset-password" replace />;
  if (status === "error") return <LoadFailed />;
  if (status === "no_access") return <AwaitingAccess />;
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}

export function Forbidden() {
  useDocumentTitle("Not permitted");
  return (
    <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
      <h1 className="text-xl font-bold text-ink-900">You do not have access to this page</h1>
      <p className="mt-2 text-sm text-ink-500">
        Your role does not include this area. Access is also enforced by the database.
      </p>
      <Link className="mt-5 inline-block font-semibold text-brand-700 underline" to="/">
        Back to your dashboard
      </Link>
    </Card>
  );
}

/** Role gate. The database enforces the same rules; this only avoids showing screens that would be empty. */
export function RequireRole({ roles }: { roles: readonly Role[] }) {
  const { role } = useAuth();
  if (!role || !roles.includes(role)) return <Forbidden />;
  return <Outlet />;
}

export function PublicOnly({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  if (status === "ready" || status === "no_access" || status === "error")
    return <Navigate to={from && from.startsWith("/") ? from : "/"} replace />;
  return <>{children}</>;
}

export function NotFound() {
  useDocumentTitle("Page not found");
  return (
    <FullScreen>
      <Card className="max-w-md p-8 text-center">
        <h1 className="text-xl font-bold text-ink-900">Page not found</h1>
        <p className="mt-2 text-sm text-ink-500">The page you are looking for does not exist.</p>
        <Link className="mt-5 inline-block font-semibold text-brand-700 underline" to="/">
          Go to the dashboard
        </Link>
      </Card>
    </FullScreen>
  );
}
