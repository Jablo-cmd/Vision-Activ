import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import type { Membership, Role } from "../domain";
import { fetchMembership } from "../services/assessments";
import { isConfigured, supabase, AppError } from "../services/supabase";

export type AuthStatus =
  "unconfigured" | "loading" | "signed_out" | "no_access" | "error" | "ready";

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  role: Role | null;
  membership: Membership | null;
  /** True after the user followed a password-recovery link. */
  recovery: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  retryMembership: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [initialised, setInitialised] = useState(!isConfigured);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setInitialised(true);
      });
    // Only set state in this callback: awaiting other Supabase calls here can deadlock the client.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") {
        setRecovery(false);
        queryClient.clear();
      }
      setSession(next);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const userId = session?.user.id;
  const membershipQuery = useQuery({
    queryKey: ["membership", userId],
    queryFn: () => fetchMembership(userId!),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  let status: AuthStatus;
  if (!isConfigured) status = "unconfigured";
  else if (!initialised) status = "loading";
  else if (!session) status = "signed_out";
  else if (membershipQuery.isPending) status = "loading";
  else if (membershipQuery.isError) status = "error";
  else if (!membershipQuery.data) status = "no_access";
  else status = "ready";

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new AppError("The application is not configured.");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      // Do not reveal whether the account exists.
      throw new AppError(
        error.status === 400
          ? "The email or password is incorrect."
          : "Sign-in failed. Please try again.",
      );
    }
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) throw new AppError("The application is not configured.");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error && error.status !== 400)
      throw new AppError("The reset email could not be sent. Please try again.");
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) throw new AppError("The application is not configured.");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new AppError(error.message);
    setRecovery(false);
  }, []);

  const retryMembership = useCallback(() => {
    void membershipQuery.refetch();
  }, [membershipQuery]);

  const membership = membershipQuery.data ?? null;
  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      role: membership?.role ?? null,
      membership,
      recovery,
      signIn,
      signOut,
      requestPasswordReset,
      updatePassword,
      retryMembership,
    }),
    [
      status,
      session,
      membership,
      recovery,
      signIn,
      signOut,
      requestPasswordReset,
      updatePassword,
      retryMembership,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export type { Role };
