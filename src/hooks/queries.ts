import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { ensureCurrentCycle, listAssessments, listScorecardEntries } from "../services/assessments";
import { listMyCommitments } from "../services/commitments";
import { listDirectory, type Person } from "../services/people";
import { MANAGEMENT_ROLES } from "../domain";

export const keys = {
  assessments: (userId: string) => ["assessments", userId] as const,
  cycle: ["cycle"] as const,
  scorecard: (cycleId: string) => ["scorecard", cycleId] as const,
  myCommitments: ["commitments", "mine"] as const,
  directory: ["directory"] as const,
};

export function useUserId(): string {
  const { user } = useAuth();
  if (!user) throw new Error("useUserId requires a signed-in user");
  return user.id;
}

export function useIsManagement(): boolean {
  const { role } = useAuth();
  return role !== null && MANAGEMENT_ROLES.includes(role);
}

export function useAssessments(userId: string) {
  return useQuery({ queryKey: keys.assessments(userId), queryFn: () => listAssessments(userId) });
}

export function useCycle() {
  return useQuery({ queryKey: keys.cycle, queryFn: ensureCurrentCycle, staleTime: 60_000 });
}

export function useScorecardEntries(cycleId: string | undefined, userId: string) {
  return useQuery({
    queryKey: keys.scorecard(cycleId ?? ""),
    enabled: Boolean(cycleId),
    queryFn: () => listScorecardEntries(cycleId!, userId),
  });
}

export function useMyCommitments() {
  return useQuery({ queryKey: keys.myCommitments, queryFn: listMyCommitments });
}

export function useDirectory() {
  return useQuery({ queryKey: keys.directory, queryFn: listDirectory, staleTime: 5 * 60_000 });
}

export function nameOf(directory: Person[] | undefined, id: string | null | undefined): string {
  if (!id) return "Unknown";
  const p = directory?.find((x) => x.id === id);
  return p ? p.full_name.trim() || p.email : "Unknown person";
}
