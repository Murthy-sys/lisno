import { describe, expect, it } from "vitest";

import type { AdminProjectSummary } from "../../api/types";
import {
  adminEstimateStages,
  adminProjectNextAction,
  canAssignProjectDesigner,
  isDesignerAssignmentPending,
  hasInitialEstimateApproval,
  adminProjectStatusTone,
  formatCreatedRelative,
  personInitials
} from "./adminProjectPresentation";

const base: AdminProjectSummary = {
  id: "project-1",
  name: "Asha home",
  status: "planning",
  location: "Pune",
  client: { name: "Asha Shah", email: "asha@example.com", mobile: "+91 90000 00000" },
  propertyType: "3BHK",
  budgetMin: null,
  budgetMax: null,
  estimator: null,
  lead: null,
  estimate: null,
  createdAt: "2026-08-23T10:00:00.000Z"
};

function withEstimate(
  status: string,
  designPlanStatus: NonNullable<AdminProjectSummary["estimate"]>["designPlanStatus"]
): AdminProjectSummary {
  return {
    ...base,
    status: "active",
    estimate: {
      id: "estimate-1",
      leadId: "lead-1",
      projectId: "project-1",
      resolvedProjectId: "project-1",
      projectLinkSource: "estimate",
      version: 1,
      status,
      subtotal: 100,
      gst: 18,
      total: 118,
      clientDecisionAt: null,
      clientDecisionSource: null,
      approvedBaseline: null,
      designPlanStatus
    }
  };
}

describe("adminProjectStatusTone", () => {
  it.each([
    ["planning", "neutral"],
    ["active", "success"],
    ["on_hold", "danger"],
    ["completed", "complete"]
  ] as const)("maps %s to %s", (status, tone) => {
    expect(adminProjectStatusTone({ ...base, status })).toBe(tone);
  });

  it("uses info while a client-approved estimate awaits designer assignment", () => {
    expect(adminProjectStatusTone(withEstimate("client_approved", "pending_assignment"))).toBe("info");
    expect(adminProjectStatusTone(withEstimate("client_approved", null))).toBe("info");
  });

  it("falls back to the project status once a designer is assigned or the estimate is unapproved", () => {
    expect(adminProjectStatusTone(withEstimate("client_approved", "assigned"))).toBe("success");
    expect(adminProjectStatusTone(withEstimate("draft", null))).toBe("success");
  });
});

describe("formatCreatedRelative", () => {
  const now = new Date("2026-09-23T12:00:00.000Z");

  it.each([
    ["2026-09-23T11:59:30.000Z", "Created 30 seconds ago"],
    ["2026-09-23T11:55:00.000Z", "Created 5 minutes ago"],
    ["2026-09-23T09:00:00.000Z", "Created 3 hours ago"],
    ["2026-09-22T12:00:00.000Z", "Created yesterday"],
    ["2026-09-20T12:00:00.000Z", "Created 3 days ago"],
    ["2026-07-23T12:00:00.000Z", "Created 2 months ago"],
    ["2025-09-23T12:00:00.000Z", "Created last year"],
    ["2023-09-23T12:00:00.000Z", "Created 3 years ago"]
  ])("formats %s as %s", (iso, expected) => {
    expect(formatCreatedRelative(iso, now)).toBe(expected);
  });

  it("rounds up to the next unit at a boundary instead of showing 60 seconds", () => {
    expect(formatCreatedRelative("2026-09-23T11:59:00.400Z", now)).toBe("Created 1 minute ago");
  });

  it("returns null for an unparseable timestamp", () => {
    expect(formatCreatedRelative("not a date", now)).toBeNull();
  });
});

describe("personInitials", () => {
  it("uses the first and last name initials", () => {
    expect(personInitials("Ravi Estimator")).toBe("RE");
    expect(personInitials("  divya  rao kapoor ")).toBe("DK");
    expect(personInitials("Priya")).toBe("P");
  });
});


describe("workflow-v3 initial approval and working quotation", () => {
  const approved = (quotationApprovalState: NonNullable<NonNullable<AdminProjectSummary["estimate"]>["quotationApprovalState"]> = "initial_current"): AdminProjectSummary => ({
    ...withEstimate("draft", "pending_assignment"),
    estimationWorkflowVersion: 3,
    estimate: {
      ...withEstimate("draft", "pending_assignment").estimate!,
      estimationPhase: "post",
      initialEstimateApproval: { reviewRoundId: "initial-review", estimateVersion: 1, approvedAt: "2026-11-04T09:00:00.000Z" },
      canAssignDesigner: true,
      designerAssignmentBlockedReason: null,
      quotationApprovalState,
      currentQuotationApproved: quotationApprovalState === "initial_current" || quotationApprovalState === "revision_current",
      requiresClientReapproval: ["revision_draft", "revision_pending_client", "revision_changes_requested"].includes(quotationApprovalState),
      quotationApprovalSource: quotationApprovalState === "initial_current" ? "initial_unchanged"
        : quotationApprovalState === "revision_current" ? "designer_revision" : null,
      currentQuotationApproval: quotationApprovalState === "initial_current"
        ? { kind: "initial_unchanged", reviewRoundId: "initial-review", estimateVersion: 1, approvedAt: "2026-11-04T09:00:00.000Z" }
        : quotationApprovalState === "revision_current"
          ? { kind: "designer_revision", reviewRoundId: "revision-review", estimateVersion: 2, approvedAt: "2026-11-04T10:00:00.000Z" }
          : null
    }
  });

  it.each([
    ["initial_current", "No changes; initial approval current"],
    ["revision_draft", "Client approval required"],
    ["revision_pending_client", "Awaiting Client review"],
    ["revision_changes_requested", "Changes requested"],
    ["revision_current", "Client approved"]
  ] as const)("retains initial approval separately from %s", (state, label) => {
    const project = approved(state);
    expect(adminEstimateStages(project)).toEqual([
      { label: "Initial estimate", value: "Client approved" },
      { label: "Designer quotation", value: label }
    ]);
    expect(hasInitialEstimateApproval(project)).toBe(true);
    expect(isDesignerAssignmentPending(project)).toBe(true);
    expect(canAssignProjectDesigner(project)).toBe(true);
    expect(adminProjectNextAction(project)).toBe("Assign Designer");
  });

  it("does not use a current approved label to bypass absent v3 eligibility", () => {
    const project = { ...withEstimate("client_approved", "pending_assignment"), estimationWorkflowVersion: 3 as const };
    expect(hasInitialEstimateApproval(project)).toBe(false);
    expect(canAssignProjectDesigner(project)).toBe(false);
    expect(adminEstimateStages(project)[0].value).toBe("Approval status unavailable");
  });

  it("honors server denial and describes the assigned Designer's next action", () => {
    const project = approved();
    project.estimate = { ...project.estimate!, canAssignDesigner: false, designPlanStatus: "assigned", designPlanDesigner: { id: "designer-1", name: "Designer", email: "designer@example.test" } };
    expect(canAssignProjectDesigner(project)).toBe(false);
    expect(isDesignerAssignmentPending(project)).toBe(false);
    expect(adminProjectNextAction(project)).toBe("Continue design workflow");
  });

  it("fails closed when the assigned project's current approval source is absent", () => {
    const project = approved("source_issue");
    project.estimate = { ...project.estimate!, designPlanStatus: "assigned", designPlanDesigner: { id: "designer-1", name: "Designer", email: "designer@example.test" } };
    expect(adminEstimateStages(project).at(-1)).toEqual({ label: "Designer quotation", value: "Approval status unavailable" });
    expect(adminProjectNextAction(project)).toBe("Resolve quotation approval status");
  });
});
