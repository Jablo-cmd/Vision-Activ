import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { NotFound, PublicOnly, RequireAuth, RequireRole } from "./components/guards";
import { Spinner } from "./components/ui";
import { AuthProvider } from "./context/AuthContext";
import { EXECUTIVE_ROLES, MANAGEMENT_ROLES } from "./domain";
import { Baseline } from "./screens/Baseline";
import { CommitmentDetail } from "./screens/CommitmentDetail";
import { Commitments } from "./screens/Commitments";
import { Home } from "./screens/Dashboard";
import { Notifications } from "./screens/Notifications";
import { Reviews } from "./screens/Review";
import { Track } from "./screens/Track";
import { Weekly } from "./screens/Weekly";
import { ForgotPassword, Login, ResetPassword } from "./screens/AuthScreens";
import { AppError } from "./services/supabase";

// Chart- and report-heavy screens load on demand.
const Trends = lazy(() => import("./screens/Trends").then((m) => ({ default: m.Trends })));
const Cockpit = lazy(() => import("./screens/Cockpit").then((m) => ({ default: m.Cockpit })));
const Reports = lazy(() => import("./screens/Reports").then((m) => ({ default: m.Reports })));
const Team = lazy(() => import("./screens/Team").then((m) => ({ default: m.Team })));
const PersonDetail = lazy(() =>
  import("./screens/PersonDetail").then((m) => ({ default: m.PersonDetail })),
);
const TeamCommitments = lazy(() =>
  import("./screens/TeamCommitments").then((m) => ({ default: m.TeamCommitments })),
);
const People = lazy(() => import("./screens/People").then((m) => ({ default: m.People })));
const AuditLog = lazy(() => import("./screens/AuditLog").then((m) => ({ default: m.AuditLog })));

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // A permission error will not fix itself on retry.
        retry: (count, error) =>
          count < 1 && !(error instanceof AppError && error.code === "42501"),
      },
    },
  });
}

const queryClient = createQueryClient();

export function AppRoutes() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnly>
              <Login />
            </PublicOnly>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicOnly>
              <ForgotPassword />
            </PublicOnly>
          }
        />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<RequireAuth />}>
          <Route index element={<Home />} />
          <Route path="baseline" element={<Baseline />} />
          <Route path="weekly" element={<Weekly />} />
          <Route path="commitments" element={<Commitments />} />
          <Route path="commitments/:id" element={<CommitmentDetail />} />
          <Route path="track" element={<Track />} />
          <Route path="trends" element={<Trends />} />
          <Route path="review" element={<Reviews />} />
          <Route path="notifications" element={<Notifications />} />

          <Route element={<RequireRole roles={MANAGEMENT_ROLES} />}>
            <Route path="cockpit" element={<Cockpit />} />
            <Route path="team" element={<Team />} />
            <Route path="team/commitments" element={<TeamCommitments />} />
            <Route path="team/:userId" element={<PersonDetail />} />
            <Route path="reports" element={<Reports />} />
          </Route>

          <Route element={<RequireRole roles={EXECUTIVE_ROLES} />}>
            <Route path="people" element={<People />} />
            <Route path="audit" element={<AuditLog />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
