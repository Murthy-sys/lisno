import { describe, expect, it } from "vitest";
import type { ProjectStatusSummary } from "../../api/types";
import { withPublishedReview } from "../estimates/clientEstimateReviewTestUtils";
import type { EstimateQueueItem } from "../estimates/estimateWorkflowApi";
import { resolveClientProjectPhase } from "./clientProjectPhase";

function status(projectId = "project-a"): ProjectStatusSummary {
  return { projectId, projectName: "Same home", projectStatus: "planning", serverNow: "2026-11-24T00:00:00Z", state: "active", issue: null,
    currentStage: { key: "estimate_preparation", label: "Estimate preparation" }, pendingActions: [] };
}

function estimate(phase: "Estimate" | "Post approval" | "Execution" = "Estimate", projectId = "project-a"): EstimateQueueItem {
  const row: EstimateQueueItem = withPublishedReview({ id: `estimate-${projectId}`, projectId, version: 4, workflowVersion: 3,
    status: "sent_to_client", propertyType: "Villa", rooms: [], scopes: [], lineItems: [], subtotal: 0, gst: 0, total: 0, approvalRequired: true,
    lead: { _id: `lead-${projectId}`, projectId, clientName: "Client", projectName: "Same home", location: "Test" } } satisfies EstimateQueueItem);
  row.publishedReview = { ...row.publishedReview!, workflowVersion: 3, phase: "pre", estimateVersion: 4 };
  row.estimation = { workflowVersion: 3, phase: "pre", status: "sent_to_client", requirementsVersion: 1, editClosedAt: null, preApproval: null, finalApproval: null,
    designScopeRevision: 2, approvedDesignScopeRevision: null, pendingReviewRoundId: row.publishedReview.id, preparationSnapshotId: null };
  if (phase !== "Estimate") {
    row.status = "client_approved";
    row.publishedReview.status = "approved";
    row.estimation.phase = "post";
    row.estimation.preApproval = { reviewRoundId: row.publishedReview.id, estimateVersion: 4, approvedAt: "2026-11-20T00:00:00Z" };
    row.preApprovedReview = { reviewRoundId: row.publishedReview.id, estimateVersion: 4, snapshot: row.publishedReview.snapshot };
    row.currentQuotationApproved = true; row.requiresClientReapproval = false;
    row.quotationApprovalState = "initial_current"; row.quotationApprovalSource = "initial_unchanged";
    row.currentQuotationApproval = { ...row.estimation.preApproval, kind: "initial_unchanged" };
    row.designPlanStatus = "in_progress"; row.designPlanVersion = 2;
  }
  if (phase === "Execution") {
    row.designPlanStatus = "approved";
    row.estimation.approvedDesignScopeRevision = 2;
    row.estimation.designApproval = { reviewRoundId: "design-round", designPlanVersion: 2, designScopeRevision: 2,
      estimateReviewRoundId: row.publishedReview.id, approvedAt: "2026-11-22T00:00:00Z" };
  }
  return row;
}

describe("Client project phase lineage", () => {
  it.each(["Estimate", "Post approval", "Execution"] as const)("resolves %s from approval evidence even with the same detailed stage", phase => {
    expect(resolveClientProjectPhase("project-a", status(), [estimate(phase)])).toEqual({ kind: "resolved", phase, state: null });
  });
  it("keeps same-named projects independent and completion secondary", () => {
    const rows = [estimate("Post approval"), estimate("Execution", "project-b")];
    expect(resolveClientProjectPhase("project-a", status(), rows)).toMatchObject({ phase: "Post approval" });
    expect(resolveClientProjectPhase("project-b", { ...status("project-b"), state: "completed", projectStatus: "completed" }, rows)).toEqual({ kind: "resolved", phase: "Execution", state: "Completed" });
  });
  it("recognizes only explicit backend pre-estimate evidence when the authorized list is empty", () => {
    const source = status();
    expect(resolveClientProjectPhase("project-a", source, [])).toEqual({ kind: "unavailable" });
    source.pendingActions = [{ id: "project-a:estimate:new:prepare", stageKey: "estimate_preparation", stageLabel: "Estimate preparation", action: "Prepare estimate", responsibleRole: "estimator_sales", people: [], state: "unassigned", scheduledAt: null, deadlineAt: null, blocker: "Assignment needed." }];
    expect(resolveClientProjectPhase("project-a", source, [])).toMatchObject({ phase: "Estimate" });
    source.pendingActions[0]!.id = "project-a:estimate:old:revise-quotation";
    expect(resolveClientProjectPhase("project-a", source, [])).toEqual({ kind: "unavailable" });
  });
  it.each(["prepare-quotation", "prepare"])("recognizes an unpublished initial draft from the backend %s action", action => {
    const source = status();
    source.pendingActions = [{ id: `project-a:estimate:existing-draft:${action}`, stageKey: "estimate_preparation", stageLabel: "Estimate preparation", action: "Prepare estimate", responsibleRole: "estimator_sales", people: [], state: "pending", scheduledAt: null, deadlineAt: null, blocker: null }];
    expect(resolveClientProjectPhase("project-a", source, [])).toMatchObject({ phase: "Estimate" });
    source.pendingActions[0]!.responsibleRole = "designer";
    expect(resolveClientProjectPhase("project-a", source, []).kind).toBe("unavailable");
    source.pendingActions[0]!.responsibleRole = "estimator_sales";
    source.pendingActions[0]!.id = `project-b:estimate:existing-draft:${action}`;
    expect(resolveClientProjectPhase("project-a", source, []).kind).toBe("unavailable");
  });
  it("recognizes initial submission while leaving ambiguous internal review sources unavailable", () => {
    const source = status();
    source.currentStage = { key: "estimate_submission", label: "Estimate submission" };
    source.pendingActions = [{ id: "project-a:estimate:existing-draft:submit", stageKey: "estimate_submission", stageLabel: "Estimate submission", action: "Submit estimate", responsibleRole: "estimator_sales", people: [], state: "pending", scheduledAt: null, deadlineAt: null, blocker: null }];
    expect(resolveClientProjectPhase("project-a", source, [])).toMatchObject({ phase: "Estimate" });
    source.currentStage.key = "estimate_preparation";
    expect(resolveClientProjectPhase("project-a", source, []).kind).toBe("unavailable");
    source.currentStage.key = "estimate_internal_review";
    source.pendingActions[0]!.stageKey = "estimate_internal_review";
    for (const action of ["assign-review", "designer-review"]) {
      source.pendingActions[0]!.id = `project-a:estimate:existing-draft:${action}`;
      expect(resolveClientProjectPhase("project-a", source, []).kind).toBe("unavailable");
    }
  });
  it.each(["draft", "sent_to_client", "client_changes_requested"] as const)("retains Post approval during a %s revised quotation", next => {
    const row = estimate("Post approval"); row.status = next; row.estimation!.status = next;
    row.version = 5; row.publishedReview!.status = next === "draft" ? "superseded" : next === "sent_to_client" ? "pending" : "changes_requested";
    row.publishedReview!.estimateVersion = next === "sent_to_client" ? 5 : 4;
    row.currentQuotationApproved = false; row.currentQuotationApproval = null;
    expect(resolveClientProjectPhase("project-a", status(), [row])).toMatchObject({ phase: "Post approval" });
  });
  it.each([
    ["missing initial proof", (row: EstimateQueueItem) => { row.preApprovedReview = null; }],
    ["different initial round", (row: EstimateQueueItem) => { row.preApprovedReview!.reviewRoundId = "foreign"; }],
    ["different initial version", (row: EstimateQueueItem) => { row.preApprovedReview!.estimateVersion = 1; }],
    ["stale design version", (row: EstimateQueueItem) => { row.designPlanVersion = 3; }],
    ["stale scope", (row: EstimateQueueItem) => { row.estimation!.designScopeRevision = 3; }],
    ["unapproved scope", (row: EstimateQueueItem) => { row.estimation!.approvedDesignScopeRevision = null; }],
    ["different design quotation", (row: EstimateQueueItem) => { row.estimation!.designApproval!.estimateReviewRoundId = "foreign"; }],
    ["foreign lead", (row: EstimateQueueItem) => { row.lead.projectId = "project-b"; }],
    ["workflow version conflict", (row: EstimateQueueItem) => { row.workflowVersion = 2; }],
    ["backend source issue", (row: EstimateQueueItem) => { row.reviewSourceIssue = "source_conflict"; }],
    ["stale published version", (row: EstimateQueueItem) => { row.publishedReview!.estimateVersion = 9; }]
  ] as const)("fails closed for %s", (_label, mutate) => {
    const row = estimate("Execution"); mutate(row);
    expect(resolveClientProjectPhase("project-a", status(), [row]).kind).toBe("conflict");
  });
  it("rejects duplicate project and estimate IDs, foreign status, and unavailable status", () => {
    const row = estimate();
    expect(resolveClientProjectPhase("project-a", status(), [row, { ...row, id: "another" }]).kind).toBe("conflict");
    expect(resolveClientProjectPhase("project-a", status(), [row, { ...estimate("Execution", "project-b"), id: row.id }]).kind).toBe("conflict");
    expect(resolveClientProjectPhase("project-a", status("project-b"), [row]).kind).toBe("conflict");
    expect(resolveClientProjectPhase("project-a", { ...status(), state: "unavailable" }, [row]).kind).toBe("unavailable");
  });
  it("supports workflow 2 design approval before final quotation approval", () => {
    const row = estimate("Execution"); row.workflowVersion = 2; row.estimation!.workflowVersion = 2; row.publishedReview!.workflowVersion = 2; delete row.estimation!.designApproval;
    expect(resolveClientProjectPhase("project-a", status(), [row])).toMatchObject({ phase: "Execution" });
    row.estimation!.approvedDesignScopeRevision = 1;
    expect(resolveClientProjectPhase("project-a", status(), [row]).kind).toBe("conflict");
  });
  it("supports explicit legacy approval while rejecting internal approval and stale published lineage", () => {
    const row = estimate("Execution"); delete row.estimation; delete row.workflowVersion; delete row.publishedReview!.workflowVersion; delete row.preApprovedReview;
    row.version = 5;
    expect(resolveClientProjectPhase("project-a", status(), [row])).toMatchObject({ phase: "Execution" });
    row.designPlanStatus = "ready_for_client";
    expect(resolveClientProjectPhase("project-a", status(), [row])).toMatchObject({ phase: "Post approval" });
    row.version = 7;
    expect(resolveClientProjectPhase("project-a", status(), [row]).kind).toBe("unavailable");
    row.status = "pending_designer_approval";
    expect(resolveClientProjectPhase("project-a", status(), [row]).kind).toBe("conflict");
  });
});
