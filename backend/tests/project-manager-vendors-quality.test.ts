import { describe, expect, it } from "vitest";
import { certificationReviewerRole, certificationStatus, pmNoticeSchema } from "../src/domain/project-manager/vendors.js";
import { pmQualityAnswerSchema, qualityEvidenceIssues, qualityWeek } from "../src/domain/project-manager/quality.js";

describe("PM vendor and quality rules", () => {
  it("preserves the Site Manager compatibility slot and never derives payment", () => {
    expect(certificationReviewerRole("program_manager")).toBe("site_manager");
    expect(certificationReviewerRole("unknown")).toBeNull();
    expect(certificationStatus(["program_manager", "designer"], [{ slot: "designer", outcome: "certify" }])).toBe("partially_certified");
    expect(certificationStatus(["program_manager"], [{ slot: "program_manager", outcome: "certify" }])).toBe("certified");
    expect(certificationStatus(["program_manager"], [{ slot: "program_manager", outcome: "reject" }])).toBe("rejected");
  });
  it("requires explicit versioned work selections and a review date for Stop Work", () => {
    const input = { recordId: "notice-a", vendorId: "vendor-a", sourceToken: "source", kind: "stop_work", reason: "Unsafe installation", expectedVersion: 0, idempotencyKey: "notice-key" };
    expect(pmNoticeSchema.safeParse(input).success).toBe(false);
    expect(pmNoticeSchema.safeParse({ ...input, reviewDate: "2026-10-30", assignments: [{ assignmentId: "a", expectedVersion: 2 }] }).success).toBe(true);
    expect(pmNoticeSchema.safeParse({ ...input, reviewDate: "2026-10-30", assignments: [{ assignmentId: "a", expectedVersion: 2 }, { assignmentId: "a", expectedVersion: 2 }] }).success).toBe(false);
  });
  it("requires failure/NA reasons and photo, document and video evidence by sampled count", () => {
    expect(pmQualityAnswerSchema.safeParse({ id: "check", answer: "fail" }).success).toBe(false);
    expect(pmQualityAnswerSchema.safeParse({ id: "check", answer: "not_applicable", reason: "No work at this stage" }).success).toBe(true);
    const answer = pmQualityAnswerSchema.parse({ id: "check", answer: "pass", sampleCount: 2 });
    const required = { id: "check", label: "Fixings", evidence: { photos: true, minPhotosPerSample: 2, documents: true, video: true } };
    expect(qualityEvidenceIssues(required, answer, [{ kind: "image" }])).toHaveLength(3);
    expect(qualityEvidenceIssues(required, answer, [...Array.from({ length: 4 }, () => ({ kind: "image" })), { kind: "document" }, { kind: "video" }])).toEqual([]);
  });
  it("uses Monday at the local India week boundary", () => {
    expect(qualityWeek(new Date("2026-10-25T18:29:59Z"))).toBe("2026-10-19");
    expect(qualityWeek(new Date("2026-10-25T18:30:00Z"))).toBe("2026-10-26");
  });
});
