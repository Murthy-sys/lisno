import type { ClientPublishedEstimateReview, EstimateClientReviewSnapshot } from "../../api/types";
import type { QuotationDetail } from "../client/quotationApi";
import type { EstimateQueueItem } from "./estimateWorkflowApi";

/** Realistic version-3 wire metadata; synthetic proof never stands in for a backend approval test. */
export function withQuotationApproval(estimate: EstimateQueueItem, detail: QuotationDetail): EstimateQueueItem {
  if (!estimate.publishedReview) throw new Error("A submitted snapshot is required for this fixture.");
  return { ...estimate, version: detail.estimateVersion!, workflowVersion: 3,
    estimation: { workflowVersion: 3, phase: detail.phase, status: detail.status, requirementsVersion: 1,
      pricedRevision: detail.pricedRevision, editClosedAt: null, preApproval: null, finalApproval: null,
      designScopeRevision: 1, approvedDesignScopeRevision: null, pendingReviewRoundId: estimate.publishedReview.id, preparationSnapshotId: null,
      salesApproval: { actorId: "synthetic-sales", estimateVersion: detail.estimateVersion!, pricedRevision: detail.pricedRevision,
        sourceDigest: "synthetic-complete-source-proof", approvedAt: "2026-11-03T08:00:00.000Z" } },
    publishedReview: { ...estimate.publishedReview, workflowVersion: 3, phase: detail.phase, requirementsVersion: 1, estimateVersion: detail.estimateVersion! }
  };
}

type TestEstimate = {
  id: string;
  status: string;
  propertyType: string;
  lineItems: Array<Omit<EstimateClientReviewSnapshot["lineItems"][number], "amount"> & { amount?: number }>;
  subtotal: number;
  gst: number;
  total: number;
  lead: Pick<EstimateClientReviewSnapshot, "clientName" | "projectName" | "location">;
};

export function withPublishedReview<T extends TestEstimate>(estimate: T): T & { publishedReview: ClientPublishedEstimateReview } {
  return { ...estimate, publishedReview: {
    id: `round-${estimate.id}`, version: 1, estimateVersion: 3, sendGeneration: 1,
    status: estimate.status === "client_approved" ? "approved" : estimate.status === "client_changes_requested" ? "changes_requested" : "pending",
    submittedAt: "2026-09-30T08:00:00.000Z", decidedAt: null, decisionNote: null,
    canDecide: estimate.status === "sent_to_client",
    snapshot: { clientName: estimate.lead.clientName, projectName: estimate.lead.projectName, location: estimate.lead.location, propertyType: estimate.propertyType,
      lineItems: estimate.lineItems.map((item) => ({ ...item, amount: item.amount ?? Math.round(item.quantity * (item.rate ?? 0)) })), subtotal: estimate.subtotal, gst: estimate.gst, total: estimate.total }
  } };
}
