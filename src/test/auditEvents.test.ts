import { describe, expect, it } from "vitest";
import { buildAuditEvent } from "../services/audit";

describe("audit event payloads", () => {
  it("creates an auditable event with actor, entity and metadata", () => {
    expect(buildAuditEvent({
      organizationId: "org-1",
      userId: "user-1",
      eventType: "review_submitted",
      entityType: "management_review",
      entityId: "review-1",
      metadata: { status: "submitted" },
    })).toEqual({
      organization_id: "org-1",
      user_id: "user-1",
      event_type: "review_submitted",
      entity_type: "management_review",
      entity_id: "review-1",
      metadata: { status: "submitted" },
    });
  });

  it("defaults metadata and entity id safely", () => {
    expect(buildAuditEvent({
      organizationId: "org-1",
      userId: "user-1",
      eventType: "assessment_created",
      entityType: "assessment",
    })).toMatchObject({
      entity_id: null,
      metadata: {},
    });
  });
});
