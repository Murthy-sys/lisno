import { describe, expect, it } from "vitest";

import type { EstimateQueueItem } from "../estimates/estimateWorkflowApi";
import type { QuotationDetail, QuotationRevision } from "./quotationApi";
import { canReviewCurrentQuotation } from "./clientQuotationReview";

const detail = {
  projectId: "project-one",
  estimateId: "estimate-one",
  estimateVersion: 6,
  workflowVersion: 3,
  phase: "post",
  pricedRevision: 6,
  status: "sent_to_client",
  reviewState: "ready_for_approval",
  quotationApprovalState: "revision_pending_client",
  currentQuotationApproved: false,
  requiresClientReapproval: true,
  quotationApprovalSource: null,
  currentQuotationApproval: null
} as unknown as QuotationDetail;

const estimate = {
  id: "estimate-one",
  projectId: "project-one",
  version: 6,
  status: "sent_to_client",
  workflowVersion: 3,
  quotationApprovalState: "revision_pending_client",
  currentQuotationApproved: false,
  requiresClientReapproval: true,
  quotationApprovalSource: null,
  currentQuotationApproval: null,
  estimation: {
    workflowVersion: 3,
    phase: "post",
    pricedRevision: 6,
    status: "sent_to_client",
    editClosedAt: null,
    pendingReviewRoundId: "review-six",
    requirementsVersion: 1
  },
  publishedReview: {
    id: "review-six",
    version: 1,
    estimateVersion: 6,
    workflowVersion: 3,
    phase: "post",
    status: "pending",
    canDecide: true,
    requirementsVersion: 1
  },
  preApprovedReview: { reviewRoundId: "review-four", estimateVersion: 4 },
  changesFromPre: { noChanges: false }
} as unknown as EstimateQueueItem;

const revision = {
  estimateId: "estimate-one",
  estimateVersion: 6,
  phase: "post",
  pricedRevision: 6,
  status: "sent_to_client"
} as unknown as QuotationRevision;

describe("canReviewCurrentQuotation", () => {
  it("allows the exact pending material revision", () => {
    expect(canReviewCurrentQuotation(detail, estimate, revision)).toBe(true);
  });

  it("does not expose a second decision for an unchanged initial approval", () => {
    const unchanged = {
      ...estimate,
      quotationApprovalState: "initial_current" as const,
      currentQuotationApproved: true,
      requiresClientReapproval: false
    };
    expect(canReviewCurrentQuotation({
      ...detail,
      quotationApprovalState: "initial_current",
      currentQuotationApproved: true,
      requiresClientReapproval: false
    }, unchanged, revision)).toBe(false);
  });

  it("fails closed when the approval projection is missing", () => {
    const missing = { ...estimate, quotationApprovalState: undefined };
    expect(canReviewCurrentQuotation({ ...detail, quotationApprovalState: undefined }, missing, revision)).toBe(false);
  });

  it("fails closed when pending approval null markers are omitted", () => {
    const { quotationApprovalSource: _detailSource, currentQuotationApproval: _detailApproval, ...incompleteDetail } = detail;
    const { quotationApprovalSource: _estimateSource, currentQuotationApproval: _estimateApproval, ...incompleteEstimate } = estimate;
    expect(canReviewCurrentQuotation(incompleteDetail as QuotationDetail, estimate, revision)).toBe(false);
    expect(canReviewCurrentQuotation(detail, incompleteEstimate as EstimateQueueItem, revision)).toBe(false);
  });
});
