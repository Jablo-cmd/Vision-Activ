import { describe, expect, it } from "vitest";
import {
  isHttpUrl,
  MAX_EVIDENCE_BYTES,
  sanitizeFileName,
  validateEvidenceFile,
} from "./evidenceFiles";

describe("evidence file rules", () => {
  it("accepts allowed types within the size limit", () => {
    expect(validateEvidenceFile({ name: "r.pdf", size: 1000, type: "application/pdf" })).toBeNull();
  });
  it("rejects oversize, empty and disallowed files", () => {
    expect(
      validateEvidenceFile({
        name: "r.pdf",
        size: MAX_EVIDENCE_BYTES + 1,
        type: "application/pdf",
      }),
    ).toMatch(/10 MB/);
    expect(validateEvidenceFile({ name: "r.pdf", size: 0, type: "application/pdf" })).toMatch(
      /empty/,
    );
    expect(
      validateEvidenceFile({ name: "x.exe", size: 10, type: "application/x-msdownload" }),
    ).toMatch(/not allowed/);
    expect(validateEvidenceFile({ name: "x.svg", size: 10, type: "image/svg+xml" })).toMatch(
      /not allowed/,
    );
  });
  it("sanitises file names for storage paths", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("etcpasswd");
    expect(sanitizeFileName("Q3 report (final).pdf")).toBe("Q3-report-final.pdf");
    expect(sanitizeFileName("///")).toBe("file");
  });
  it("only http(s) links are valid evidence links", () => {
    expect(isHttpUrl("https://example.com/x")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("not a url")).toBe(false);
  });
});
