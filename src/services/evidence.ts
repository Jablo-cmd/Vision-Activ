import type { EvidenceRow } from "../domain";
import { sanitizeFileName, validateEvidenceFile } from "../lib/evidenceFiles";
import { currentUserId } from "./assessments";
import { AppError, db, unwrap } from "./supabase";

const BUCKET = "evidence";

export async function listEvidence(commitmentId: string): Promise<EvidenceRow[]> {
  const res = await db()
    .from("evidence_items")
    .select("*")
    .eq("commitment_id", commitmentId)
    .order("created_at", { ascending: false })
    .limit(100);
  return unwrap(res) as EvidenceRow[];
}

type Base = { commitmentId: string; organizationId: string; title: string };

async function insertEvidence(base: Base, fields: Record<string, unknown>): Promise<void> {
  const userId = await currentUserId();
  unwrap(
    await db()
      .from("evidence_items")
      .insert({
        organization_id: base.organizationId,
        user_id: userId,
        commitment_id: base.commitmentId,
        title: base.title,
        ...fields,
      }),
  );
}

export const addNoteEvidence = (base: Base, body: string) =>
  insertEvidence(base, { kind: "note", body });
export const addLinkEvidence = (base: Base, url: string) =>
  insertEvidence(base, { kind: "link", url });
export const addMetricEvidence = (base: Base, value: number, body: string) =>
  insertEvidence(base, { kind: "metric", metric_value: value, body });

export async function addFileEvidence(base: Base, file: File): Promise<void> {
  const problem = validateEvidenceFile(file);
  if (problem) throw new AppError(problem);
  const userId = await currentUserId();
  const path = `${userId}/${base.commitmentId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
  const up = await db()
    .storage.from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw new AppError(up.error.message);
  try {
    await insertEvidence(base, {
      kind: "file",
      storage_path: path,
      file_name: file.name.slice(0, 200),
      mime_type: file.type,
      size_bytes: file.size,
    });
  } catch (e) {
    await db().storage.from(BUCKET).remove([path]);
    throw e;
  }
}

/** Short-lived signed link; the bucket is private. */
export async function evidenceDownloadUrl(path: string): Promise<string> {
  const res = await db().storage.from(BUCKET).createSignedUrl(path, 60);
  if (res.error || !res.data) throw new AppError("The file could not be opened.");
  return res.data.signedUrl;
}

export async function reviewEvidence(
  id: string,
  status: "accepted" | "rejected",
  note: string,
): Promise<void> {
  unwrap(await db().rpc("review_evidence", { p_id: id, p_status: status, p_note: note }));
}
