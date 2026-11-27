import { describe, expect, it } from "vitest";
import type { HandoverCheck } from "../src/contracts/procurement-handover.js";
import { handoverAnswerIssues, handoverAnswerSchema, handoverCompletionIssues } from "../src/domain/procurement-handover.js";
const required: HandoverCheck = { id: "quality", section: "quality", label: "Fixings", instructions: null,
  itemId: "item", itemName: "Item", vendorId: "vendor", vendorName: "Vendor", orderId: "order", basketId: "basket",
  parameterId: "fixing", checklistRevisionId: "revision", required: true, allowNotApplicable: false, parameterSnapshot: null,
  evidence: { photos: true, minPhotosPerSample: 2, documents: false, video: false } };
const answer = { checkId: required.id, answer: "pass" as const, note: "Inspected on site", evidenceIds: [], sampleCount: 2 };
describe("procurement handover requirements", () => {
  it("never accepts N/A for configured mandatory checks", () => {
    expect(handoverAnswerIssues(required, { ...answer, answer: "not_applicable" }, [], false)).toHaveLength(1);
    expect(handoverCompletionIssues([required], [{ ...answer, answer: "not_applicable" }])).toHaveLength(1);
    expect(handoverAnswerIssues({ ...required, required: false, allowNotApplicable: true }, { ...answer, answer: "not_applicable" }, [], true)).toEqual([]);
    expect(handoverAnswerSchema.safeParse({ ...answer, answer: "not_applicable", note: "" }).success).toBe(false);
  });
  it("requires corrective-action ownership and enforces evidence per sample at completion", () => {
    expect(handoverAnswerSchema.safeParse({ ...answer, answer: "fail" }).success).toBe(false);
    expect(handoverAnswerIssues(required, answer, [{ kind: "image" }, { kind: "image" }], true)[0]).toContain("4 photos");
    expect(handoverAnswerIssues(required, answer, Array.from({ length: 4 }, () => ({ kind: "image" })), true)).toEqual([]);
    expect(handoverAnswerIssues(required, answer, [], false)).toEqual([]);
  });
  it("rejects missing, failed, duplicate and foreign answers", () => {
    expect(handoverCompletionIssues([required], [])).toHaveLength(1);
    expect(handoverCompletionIssues([required], [{ ...answer, answer: "fail" }])).toHaveLength(1);
    expect(handoverCompletionIssues([required], [answer, answer])).toHaveLength(1);
    expect(handoverCompletionIssues([required], [{ ...answer, checkId: "other" }])).toHaveLength(2);
  });
});
