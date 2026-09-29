/** Client-side checks that mirror the private "evidence" storage bucket limits. */

export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_EVIDENCE_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
  "text/plain": "Text",
  "text/csv": "CSV",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
};

export const EVIDENCE_ACCEPT = Object.keys(ALLOWED_EVIDENCE_TYPES).join(",");

export function validateEvidenceFile(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  if (file.size <= 0) return "The file is empty.";
  if (file.size > MAX_EVIDENCE_BYTES) return "Files must be 10 MB or smaller.";
  if (!ALLOWED_EVIDENCE_TYPES[file.type]) {
    return "This file type is not allowed. Use PDF, image, text, CSV, Word, Excel or PowerPoint files.";
  }
  return null;
}

/** Keep names storage-safe and predictable. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .slice(-100);
  return cleaned.length > 0 && cleaned !== "." ? cleaned : "file";
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
