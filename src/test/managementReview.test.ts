import { describe, expect, it } from "vitest";
import { assertReviewTransition, canTransitionReview } from "../utils/managementReview";

describe("management review workflow", () => {
  it("allows the approved workflow", () => {
    expect(canTransitionReview("draft", "submitted")).toBe(true);
    expect(canTransitionReview("submitted", "under_review")).toBe(true);
    expect(canTransitionReview("under_review", "approved")).toBe(true);
  });

  it("allows returned reviews to be resubmitted", () => {
    expect(canTransitionReview("under_review", "returned")).toBe(true);
    expect(canTransitionReview("returned", "submitted")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(() => assertReviewTransition("approved", "draft")).toThrow();
    expect(() => assertReviewTransition("draft", "approved")).toThrow();
  });
});
