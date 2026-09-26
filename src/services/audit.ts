import { supabase } from "./supabase";

export type AuditEventInput = {
  organizationId: string;
  userId: string;
  eventType: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

export function buildAuditEvent(input: AuditEventInput) {
  return {
    organization_id: input.organizationId,
    user_id: input.userId,
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
  };
}

export async function recordAuditEvent(input: AuditEventInput) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase.from("audit_events").insert(buildAuditEvent(input));
  if (error) throw error;
}
