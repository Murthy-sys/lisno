import { describe, expect, it } from "vitest";
import type { ExecutionWork } from "../execution/executionApi";
import { executionFixture } from "../execution/executionTestFixtures";
import { currentVendorReport, vendorWorkflowPresentation } from "./vendorWorkflowPresentation";

function work(fields: Partial<ExecutionWork> = {}): ExecutionWork {
  return { ...structuredClone(executionFixture), ...fields };
}

function milestoneStates(value: ExecutionWork) {
  return Object.fromEntries(vendorWorkflowPresentation(value).milestones.map(item => [item.id, item.state]));
}

describe("vendor workflow presentation", () => {
  it("uses the permitted vendor action even when the handoff owner is the Client", () => {
    const result = vendorWorkflowPresentation(work({ status: "site_verified", nextOwner: "client", allowedActions: [], canSubmitToClient: true }));
    expect(result.primaryAction).toEqual({ kind: "client_submission", label: "Send to Client" });
    expect(result.guidance).toContain("Send the verified work");
    expect(result.milestones.find(item => item.id === "client")?.state).toBe("pending");
  });

  it("explains pending Client review despite a conflicting returned owner", () => {
    const result = vendorWorkflowPresentation(work({ status: "awaiting_client", nextOwner: "vendor", allowedActions: [] }));
    expect(result.stageLabel).toBe("With Client");
    expect(result.guidance).toContain("waiting for the Client's decision");
    expect(result.primaryAction).toBeNull();
    expect(result.milestones.find(item => item.id === "client")?.state).toBe("current");
  });

  it("does not infer project-level Client review from site verification", () => {
    const result = vendorWorkflowPresentation(work({ status: "site_verified", allowedActions: [], canSubmitToClient: false }));
    expect(result.guidance).toContain("Further review details are not available here");
    expect(result.guidance).not.toContain("waiting for the Client");
    expect(result.primaryAction).toBeNull();
    expect(result.milestones.find(item => item.id === "client")?.state).toBe("unavailable");
  });

  it("marks only saved milestone facts, without backfilling earlier stages from acceptance", () => {
    expect(milestoneStates(work({ status: "client_approved", acknowledgedAt: null, schedule: null, latestVendorReport: null, verification: null, allowedActions: [] }))).toEqual({
      acknowledgement: "unavailable", schedule: "unavailable", report: "unavailable", verification: "unavailable", client: "recorded"
    });
  });

  it("does not turn a reported 100% into verification or Client acceptance", () => {
    const result = vendorWorkflowPresentation(work({ progress: 100, allowedActions: ["report", "submit"] }));
    expect(result.guidance).toContain("100% is not verified completion");
    expect(result.primaryAction).toMatchObject({ kind: "execution", action: "submit" });
    expect(result.milestones.find(item => item.id === "verification")?.state).toBe("pending");
    expect(result.milestones.find(item => item.id === "client")?.state).toBe("pending");
  });

  it.each(["changes_requested", "in_progress"] as const)("requires fresh report and verification evidence in %s despite retained 100%", status => {
    const value = work({ status, executionRound: 3, progress: 100, allowedActions: ["report"], verification: { id: "verification-old", executionRound: 2, verifiedAt: "2026-11-01T08:00:00Z", verifiedById: "manager-one" } });
    const result = vendorWorkflowPresentation(value);
    expect(currentVendorReport(value)).toBeNull();
    expect(result.guidance).toContain("No vendor report is available for this round");
    expect(result.primaryAction).toMatchObject({ action: "report" });
    expect(milestoneStates(value)).toMatchObject({ report: "current", verification: "pending", client: "pending" });
  });

  it("uses the vendor report rather than a later staff activity note", () => {
    const value = work({ latestNote: "Manager moved the hold review date", latestReportAt: "2026-11-10T08:00:00Z" });
    expect(currentVendorReport(value)).toMatchObject({ note: "Frame installed", reportedAt: "2026-10-08T07:00:00Z" });
    expect(currentVendorReport(work({ latestVendorReport: null, latestNote: "Manager verified completion" }))).toBeNull();
  });

  it("does not invent modern milestones for an accepted legacy review", () => {
    const value = work({ tracking: "legacy_review", status: "client_approved", executionRound: 0, acknowledgedAt: null, schedule: null, latestVendorReport: null, allowedActions: [] });
    expect(milestoneStates(value)).toEqual({ acknowledgement: "unavailable", schedule: "unavailable", report: "unavailable", verification: "unavailable", client: "recorded" });
    expect(vendorWorkflowPresentation(value).guidance).toContain("existing review");
  });

  it("preserves superseded history without offering new work updates", () => {
    const value = work({ status: "superseded", allowedActions: [] });
    const result = vendorWorkflowPresentation(value);
    expect(result.primaryAction).toBeNull();
    expect(result.guidance).toContain("saved history remains available");
    expect(milestoneStates(value)).toMatchObject({ acknowledgement: "recorded", schedule: "recorded", report: "recorded", verification: "unavailable", client: "unavailable" });
  });

  it("explains setup without granting the vendor a staff action", () => {
    const result = vendorWorkflowPresentation(work({ tracking: "setup_required", status: "assigned", allowedActions: ["setup"] }));
    expect(result.stageLabel).toBe("Tracking setup required");
    expect(result.primaryAction).toBeNull();
    expect(result.milestones.every(item => item.state === "unavailable")).toBe(true);
  });

  it("distinguishes a schedule proposal from a confirmed commitment", () => {
    const result = vendorWorkflowPresentation(work({ status: "awaiting_schedule", schedule: null, proposedSchedule: { startDate: "2026-11-15", finishDate: "2026-11-18", reason: null }, allowedActions: ["propose_schedule"] }));
    expect(result.primaryAction).toMatchObject({ action: "propose_schedule" });
    expect(result.guidance).toContain("not yet a confirmed commitment");
    expect(result.milestones.find(item => item.id === "schedule")?.state).toBe("current");
  });

  it("explains a hold and blocker without changing backend reporting obligations", () => {
    const held = vendorWorkflowPresentation(work({ hold: { reason: "Access unavailable.", startedAt: "2026-11-14T08:00:00Z", reviewDate: "2026-11-16" }, allowedActions: [] }));
    expect(held.stageLabel).toBe("On hold");
    expect(held.guidance).toContain("Access unavailable");
    expect(held.guidance).toContain("16 Nov 2026");
    expect(held.primaryAction).toBeNull();
    const blocked = vendorWorkflowPresentation(work({ status: "blocked" }));
    expect(blocked.stageLabel).toBe("Blocked");
    expect(blocked.guidance).toContain("reporting obligation");
    expect(blocked.primaryAction).toMatchObject({ action: "report" });
  });

  it.each([
    ["assigned", ["acknowledge"], "acknowledge"],
    ["awaiting_schedule", ["propose_schedule"], "propose_schedule"],
    ["not_started", ["report", "propose_schedule"], "report"],
    ["in_progress", ["report", "propose_schedule"], "report"]
  ] as const)("shows the permitted next action for %s", (status, allowedActions, expected) => {
    expect(vendorWorkflowPresentation(work({ status, allowedActions: [...allowedActions] })).primaryAction).toMatchObject({ kind: "execution", action: expected });
  });

  it("does not offer an action based on percentage or stage when none is permitted", () => {
    const result = vendorWorkflowPresentation(work({ progress: 100, allowedActions: [] }));
    expect(result.primaryAction).toBeNull();
    expect(result.guidance).toContain("No vendor action is currently available");
  });

  it("marks Project Manager verification as current only after submission", () => {
    const result = vendorWorkflowPresentation(work({ status: "awaiting_verification", progress: 100, allowedActions: [] }));
    expect(result.primaryAction).toBeNull();
    expect(result.guidance).toContain("Project Manager must verify this round");
    expect(result.milestones.find(item => item.id === "verification")?.state).toBe("current");
    expect(result.milestones.find(item => item.id === "client")?.state).toBe("pending");
  });
});
