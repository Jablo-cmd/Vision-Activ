export type ReviewStatus = "draft" | "submitted" | "under_review" | "returned" | "approved";

const transitions: Record<ReviewStatus, ReviewStatus[]> = {
  draft: ["submitted"],
  submitted: ["under_review"],
  under_review: ["approved", "returned"],
  returned: ["submitted"],
  approved: [],
};

export function canTransitionReview(from: ReviewStatus, to: ReviewStatus) {
  return transitions[from].includes(to);
}

export function assertReviewTransition(from: ReviewStatus, to: ReviewStatus) {
  if (!canTransitionReview(from, to)) {
    throw new Error(`Invalid management review transition: ${from} -> ${to}`);
  }
}
