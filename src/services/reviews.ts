import type { ReviewRow } from "../domain";
import { currentUserId } from "./assessments";
import { db, unwrap } from "./supabase";

export async function listReviews(): Promise<ReviewRow[]> {
  const res = await db()
    .from("management_reviews")
    .select(
      "id, reviewer_id, subject_user_id, assessment_id, notes, barriers, support, action_items, follow_up_date, duration_minutes, status, reviewed_at",
    )
    .order("reviewed_at", { ascending: false })
    .limit(200);
  return unwrap(res) as ReviewRow[];
}

export type NewReview = {
  subjectUserId: string;
  assessmentId: string | null;
  notes: string;
  barriers: string;
  support: string;
  actionItems: string[];
  followUpDate: string | null;
};

export async function createReview(input: NewReview, organizationId: string): Promise<void> {
  const reviewerId = await currentUserId();
  unwrap(
    await db().from("management_reviews").insert({
      reviewer_id: reviewerId,
      subject_user_id: input.subjectUserId,
      organization_id: organizationId,
      assessment_id: input.assessmentId,
      notes: input.notes,
      barriers: input.barriers,
      support: input.support,
      action_items: input.actionItems,
      follow_up_date: input.followUpDate,
      status: "completed",
    }),
  );
}
