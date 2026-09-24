import type { Assessment, Commitment, Review, ScorecardEntry } from "../types";
import { supabase } from "./supabase";

async function currentUser() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Please sign in before using the workspace.");
  return data.user;
}

async function requireOrganization() {
  const org = await getMyOrganization();
  if (!org?.organization_id) throw new Error("Your account is not assigned to an active organisation.");
  return org;
}

export async function saveAssessment(a: Assessment, organizationId: string) {
  const u = await currentUser();
  const { error } = await supabase!.from("assessments").upsert({
    id: a.id,
    user_id: u.id,
    organization_id: organizationId,
    assessment_type: a.type,
    period_start: a.periodStart,
    period_end: a.periodEnd,
    scores: a.scores,
    submitted_at: a.submittedAt ?? new Date().toISOString(),
  });
  if (error) throw error;
}

export async function saveCommitment(c: Commitment, organizationId: string) {
  const u = await currentUser();
  const { error } = await supabase!.from("commitments").upsert({
    id: c.id,
    user_id: u.id,
    organization_id: organizationId,
    dimension_id: c.dimensionId,
    title: c.title,
    action: c.action,
    timeframe: c.timeframe,
    evidence: c.evidence,
    status: c.status,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function saveReview(r: Review, organizationId: string, subjectUserId: string) {
  const u = await currentUser();
  const { error } = await supabase!.from("management_reviews").upsert({
    id: r.id,
    reviewer_id: u.id,
    subject_user_id: subjectUserId,
    organization_id: organizationId,
    assessment_id: r.assessmentId || null,
    notes: r.notes,
    barriers: r.barriers,
    support: r.support,
    reviewed_at: r.reviewedAt,
  });
  if (error) throw error;
}

export async function saveScorecard(e: ScorecardEntry, organizationId: string, cycleId: string) {
  const u = await currentUser();
  const { error } = await supabase!.from("scorecard_entries").upsert({
    id: e.id ?? crypto.randomUUID(),
    organization_id: organizationId,
    cycle_id: cycleId,
    user_id: u.id,
    dimension_id: e.dimensionId,
    metrics: e.metrics,
    evidence: e.evidence,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function getMyOrganization() {
  const u = await currentUser();
  const { data, error } = await supabase!
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", u.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as { organization_id: string; role: "employee" | "manager" | "ceo" | "admin" } | null;
}

export async function ensureCurrentCycle(organizationId: string) {
  const today = new Date();
  const day = today.getDay();
  const diff = (day + 6) % 7;
  const start = new Date(today);
  start.setHours(12, 0, 0, 0);
  start.setDate(today.getDate() - diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const weekStart = start.toISOString().slice(0, 10);
  const weekEnd = end.toISOString().slice(0, 10);

  const { data, error } = await supabase!
    .from("weekly_cycles")
    .upsert(
      { organization_id: organizationId, week_start: weekStart, week_end: weekEnd, status: "open" },
      { onConflict: "organization_id,week_start" },
    )
    .select("id,week_start,week_end,status")
    .single();

  if (error) throw error;
  return data;
}

export async function getCurrentUserDashboard() {
  const org = await requireOrganization();
  const [assessments, commitments, cycle] = await Promise.all([
    supabase!.from("assessments").select("id,assessment_type,period_start,period_end,scores,submitted_at").eq("organization_id", org.organization_id).eq("user_id", (await currentUser()).id).order("period_start", { ascending: false }).limit(12),
    supabase!.from("commitments").select("id,dimension_id,title,action,timeframe,evidence,status,created_at,updated_at").eq("organization_id", org.organization_id).eq("user_id", (await currentUser()).id).order("updated_at", { ascending: false }).limit(50),
    ensureCurrentCycle(org.organization_id),
  ]);
  if (assessments.error) throw assessments.error;
  if (commitments.error) throw commitments.error;
  const latest = assessments.data?.[0];
  const scores = Array.isArray(latest?.scores) ? latest.scores : [];
  const rated = scores.filter((s: { score?: number }) => typeof s.score === "number" && s.score > 0);
  const average = rated.length ? rated.reduce((sum: number, s: { score: number }) => sum + s.score, 0) / rated.length : null;
  return { organization: org, cycle, assessments: assessments.data ?? [], commitments: commitments.data ?? [], average };
}
