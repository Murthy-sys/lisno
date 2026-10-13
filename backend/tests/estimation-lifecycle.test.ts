import { describe, expect, it } from "vitest";
import { currentEstimationApproval, effectiveCommercialStatus, estimateCommercialStatusFields, estimateWorkingCopyEditable, newEstimationLifecycle } from "../src/domain/estimation-lifecycle.js";

describe("commercial estimation lifecycle", () => {
  it("keeps post-estimate drafts editable without withdrawing the project design handoff", () => {
    const estimation = newEstimationLifecycle();
    estimation.phase = "post";
    estimation.preApproval = { reviewRoundId: "pre-round", estimateVersion: 4, approvedAt: "2026-10-13T00:00:00.000Z" };
    const estimate = { status: "client_approved", estimation };
    expect(effectiveCommercialStatus(estimate)).toBe("draft");
    expect(estimateWorkingCopyEditable(estimate)).toBe(true);
    expect(estimateCommercialStatusFields(estimate, "sent_to_client")).toEqual({ status: "client_approved", "estimation.status": "sent_to_client" });
    expect(currentEstimationApproval(estimate)?.estimateVersion).toBe(4);
  });
  it("closes editing on final approval even if a stale commercial status says draft", () => {
    const estimation = newEstimationLifecycle();
    estimation.editClosedAt = "2026-10-13T00:00:00.000Z";
    expect(estimateWorkingCopyEditable({ status: "client_approved", estimation })).toBe(false);
  });
  it("preserves the existing legacy edit rules and never invents an approval", () => {
    expect(estimateWorkingCopyEditable({ status: "draft" })).toBe(true);
    expect(estimateWorkingCopyEditable({ status: "client_approved" })).toBe(false);
    expect(estimateCommercialStatusFields({ status: "draft" }, "sent_to_client")).toEqual({ status: "sent_to_client" });
    expect(currentEstimationApproval({ status: "client_approved" })).toBeNull();
  });
});
