import type { ClientPublishedEstimateReview, EstimateClientReviewSnapshot } from "../../api/types";

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
      lineItems: estimate.lineItems.map((item) => ({ ...item, amount: item.amount ?? Math.round(item.quantity * item.rate) })), subtotal: estimate.subtotal, gst: estimate.gst, total: estimate.total }
  } };
}
