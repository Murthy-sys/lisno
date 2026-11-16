import { describe, expect, it } from "vitest";
import type { ExecutionWork } from "../execution/executionApi";
import { executionFixture } from "../execution/executionTestFixtures";
import { currentVendorReport, vendorWorkflowPresentation } from "./vendorWorkflowPresentation";

function work(fields: Partial<ExecutionWork> = {}): ExecutionWork {
  return { ...structuredClone(executionFixture), ...fields };
}

describe("vendor workflow presentation", () => {
  it.each([
    ["not_started", 0, "Not started"],
    ["in_progress", 0, "Started working"],
    ["in_progress", 40, "In progress"],
    ["blocked", 40, "On hold"],
    ["awaiting_verification", 100, "Completed by vendor"]
  ] as const)("presents %s at %i percent as %s", (status, progress, label) => {
    expect(vendorWorkflowPresentation(work({ status, progress })).stageLabel).toBe(label);
  });

  it.each(["started", "progress"] as const)("uses the current-round %s update at zero progress", updateType => {
    const result = vendorWorkflowPresentation(work({ progress: 0, latestVendorReport: { ...executionFixture.latestVendorReport!, updateType, progress: 0 } }));
    expect(result.stageLabel).toBe(updateType === "started" ? "Started working" : "In progress");
    expect(result.guidance).not.toMatch(/\d+%/);
  });

  it("does not use a previous-round update type for the current status", () => {
    const result = vendorWorkflowPresentation(work({ executionRound: 2, progress: 0, latestVendorReport: { ...executionFixture.latestVendorReport!, updateType: "progress", progress: 0 } }));
    expect(result.stageLabel).toBe("Started working");
  });

  it.each([
    ["assigned", 0, ["acknowledge"], "acknowledge", "Acknowledge work"],
    ["awaiting_schedule", 0, ["propose_schedule"], "propose_schedule", "Propose schedule"],
    ["not_started", 0, ["report", "propose_schedule"], "report", "Started working"],
    ["in_progress", 40, ["report", "propose_schedule"], "report", "Update progress"],
    ["in_progress", 100, ["report", "submit"], "submit", "Completed"]
  ] as const)("keeps backend actions authoritative for %s at %i percent", (status, progress, allowedActions, action, label) => {
    expect(vendorWorkflowPresentation(work({ status, progress, allowedActions: [...allowedActions] })).primaryAction)
      .toEqual({ kind: "execution", action, label });
  });

  it("separates vendor completion from Project Manager verification and Client acceptance", () => {
    const result = vendorWorkflowPresentation(work({ status: "awaiting_verification", progress: 100, allowedActions: [] }));
    expect(result.stageLabel).toBe("Completed by vendor");
    expect(result.reviewLabel).toBe("Awaiting Project Manager verification");
    expect(result.guidance).toContain("must verify this round before Client review");
    expect(result.primaryAction).toBeNull();
  });

  it("uses the permitted Client submission action despite the handoff owner", () => {
    const result = vendorWorkflowPresentation(work({ status: "site_verified", nextOwner: "client", allowedActions: [], canSubmitToClient: true }));
    expect(result.primaryAction).toEqual({ kind: "client_submission", label: "Send to Client" });
    expect(result.reviewLabel).toBe("Ready to send to Client");
  });

  it("explains pending Client review despite a conflicting returned owner", () => {
    const result = vendorWorkflowPresentation(work({ status: "awaiting_client", nextOwner: "vendor", allowedActions: [] }));
    expect(result.stageLabel).toBe("With Client");
    expect(result.reviewLabel).toBe("Awaiting Client acceptance");
    expect(result.primaryAction).toBeNull();
  });

  it("does not infer a Client review from Project Manager verification", () => {
    const result = vendorWorkflowPresentation(work({ status: "site_verified", allowedActions: [], canSubmitToClient: false }));
    expect(result.guidance).toContain("Further review details are not available here");
    expect(result.reviewLabel).not.toBe("Awaiting Client acceptance");
    expect(result.primaryAction).toBeNull();
  });

  it("keeps legacy full progress distinct from explicitly completed or verified work", () => {
    const result = vendorWorkflowPresentation(work({ progress: 100, allowedActions: ["report", "submit"] }));
    expect(result.stageLabel).toBe("In progress");
    expect(result.reviewLabel).toBeNull();
    expect(result.guidance).toContain("Project Manager verification");
    expect(result.guidance).not.toMatch(/\d+%/);
  });

  it.each(["changes_requested", "in_progress"] as const)("ignores prior-round reporting evidence during %s", status => {
    const value = work({ status, executionRound: 3, progress: 100, allowedActions: ["report"],
      verification: { id: "old-verification", executionRound: 2, verifiedAt: "2026-11-01T08:00:00Z", verifiedById: "manager-one" } });
    expect(currentVendorReport(value)).toBeNull();
    if (status === "changes_requested") expect(vendorWorkflowPresentation(value).guidance).toContain("No vendor report is available for this round");
    expect(vendorWorkflowPresentation(value).primaryAction).toMatchObject({ action: "report" });
  });

  it("uses the vendor report rather than a later staff activity note", () => {
    expect(currentVendorReport(work({ latestNote: "Manager changed the review date", latestReportAt: "2026-11-10T08:00:00Z" })))
      .toMatchObject({ note: "Frame installed", reportedAt: "2026-10-08T07:00:00Z" });
    expect(currentVendorReport(work({ latestVendorReport: null, latestNote: "Manager verified completion" }))).toBeNull();
  });

  it.each([
    { tracking: "legacy_review", status: "client_approved", allowedActions: [] },
    { tracking: "setup_required", status: "assigned", allowedActions: ["setup"] },
    { status: "superseded", allowedActions: [] },
    { progress: 100, allowedActions: [] },
    { sourceAvailable: false, allowedActions: ["report", "submit"], canSubmitToClient: true }
  ] satisfies Partial<ExecutionWork>[])("offers no update outside the permitted current source: %j", fields => {
    expect(vendorWorkflowPresentation(work(fields)).primaryAction).toBeNull();
  });

  it("distinguishes proposed dates from a confirmed commitment", () => {
    const result = vendorWorkflowPresentation(work({ status: "awaiting_schedule", schedule: null,
      proposedSchedule: { startDate: "2026-11-15", finishDate: "2026-11-18", reason: null }, allowedActions: ["propose_schedule"] }));
    expect(result.guidance).toContain("not yet a confirmed commitment");
    expect(result.primaryAction).toMatchObject({ action: "propose_schedule" });
  });

  it("keeps a staff hold distinct from a vendor-reported hold", () => {
    const held = vendorWorkflowPresentation(work({ hold: { reason: "Access unavailable.", startedAt: "2026-11-14T08:00:00Z", reviewDate: "2026-11-16" }, allowedActions: ["report"] }));
    expect(held.stageLabel).toBe("On hold");
    expect(held.guidance).toContain("16 Nov 2026");
    expect(held.primaryAction).toBeNull();
    const reported = vendorWorkflowPresentation(work({ status: "blocked", allowedActions: ["report"] }));
    expect(reported.stageLabel).toBe("On hold");
    expect(reported.guidance).toContain("reporting deadline still applies");
    expect(reported.primaryAction).toMatchObject({ action: "report" });
  });
});
