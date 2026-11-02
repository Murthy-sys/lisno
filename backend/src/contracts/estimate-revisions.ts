import type { EstimateClientReviewSnapshot, EstimateClientReviewStatus, EstimateDeliveryStatus } from "../domain/estimate-client-review.js";

/** Safe staff metadata for an immutable client publication. */
export interface EstimateRevisionSummary {
  id: string;
  estimateId: string;
  estimateVersion: number;
  sendGeneration: number;
  phase?: "pre" | "post";
  workflowVersion?: 2 | 3;
  submittedAt: string;
  status: EstimateClientReviewStatus;
  deliveryStatus: EstimateDeliveryStatus;
  subtotalPaise: number;
}

export interface EstimateRevisionPage {
  items: EstimateRevisionSummary[];
  pagination: { limit: number; nextCursor: string | null };
}

export interface EstimateRevisionDetail extends EstimateRevisionSummary {
  snapshot: EstimateClientReviewSnapshot;
}
