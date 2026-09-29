import { useQuery } from "@tanstack/react-query";
import { addDays, orgToday, weekStart } from "../lib/dates";
import {
  commitmentAttention,
  commitmentOutcomes,
  memberStatus,
  submissionRates,
  weeklyDimensionScores,
} from "../services/reports";

/** 52 weeks of per-dimension weekly averages, scoped to the caller's reporting line by the database. */
export function useWeeklyScores() {
  const to = addDays(weekStart(orgToday()), 6);
  const from = addDays(weekStart(orgToday()), -7 * 51);
  return useQuery({
    queryKey: ["weekly-scores", from],
    queryFn: () => weeklyDimensionScores(from, to),
    staleTime: 60_000,
  });
}

export function useSubmissionRates() {
  const to = addDays(weekStart(orgToday()), 6);
  const from = addDays(weekStart(orgToday()), -7 * 51);
  return useQuery({
    queryKey: ["submission-rates", from],
    queryFn: () => submissionRates(from, to),
    staleTime: 60_000,
  });
}

export const useMemberStatus = () =>
  useQuery({ queryKey: ["member-status"], queryFn: memberStatus, staleTime: 30_000 });
export const useAttention = () =>
  useQuery({ queryKey: ["attention"], queryFn: commitmentAttention, staleTime: 30_000 });
export const useOutcomes = () =>
  useQuery({ queryKey: ["outcomes", "team"], queryFn: commitmentOutcomes, staleTime: 60_000 });
