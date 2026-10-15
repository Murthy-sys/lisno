import { apiClient } from "../../api/client";
import type { ClientPublishedEstimateReview, EstimateClientReviewSnapshot } from "../../api/types";
import type { EstimateDraft } from "../leads/leadsApi";

export interface EstimateQueueItem extends EstimateDraft {
  version?: number;
  publishedReview?: ClientPublishedEstimateReview | null;
  preApprovedReview?: {
    reviewRoundId: string;
    estimateVersion: number;
    snapshot: EstimateClientReviewSnapshot;
  } | null;
  changesFromPre?: {
    addedLineIds: string[];
    removedLineIds: string[];
    changedLineIds: string[];
    scopeChanged: boolean;
    noChanges: boolean;
    beforeTotal: number;
    afterTotal: number;
  } | null;
  reviewSourceIssue?: "missing_snapshot" | "source_conflict" | null;
  lead: {
    _id: string;
    id?: string;
    projectId?: string | null;
    clientName: string;
    projectName: string;
    location: string;
    clientEmail?: string;
  };
}

export interface EstimateDesigner {
  id: string;
  name: string;
  email: string;
  title: string | null;
}

export const estimateWorkflowKeys = {
  reviewQueue: ["estimates", "review-queue"] as const,
  designers: ["estimates", "designers"] as const,
  client: ["client", "estimates"] as const
};

export const getEstimateReviewQueue = () =>
  apiClient.get<EstimateQueueItem[]>("/estimates/review-queue");
export const getEstimateDesigners = () =>
  apiClient.get<EstimateDesigner[]>("/estimates/designers");
export const assignEstimateDesigner = (estimateId: string, designerId: string) =>
  apiClient.post<EstimateDraft>(`/estimates/${encodeURIComponent(estimateId)}/assign`, { designerId });
export const decideEstimateAsDesigner = (
  estimateId: string,
  decision: "approve" | "request_changes",
  note: string
) => apiClient.post<EstimateDraft>(
  `/estimates/${encodeURIComponent(estimateId)}/designer-decision`,
  { decision, note }
);
export const getClientEstimates = () =>
  apiClient.get<EstimateQueueItem[]>("/client/estimates");
export const decideEstimateAsClient = (
  estimateId: string,
  decision: "approve" | "request_changes",
  note: string,
  review: Pick<ClientPublishedEstimateReview, "id" | "version">
) => apiClient.post<EstimateQueueItem>(
  `/client/estimates/${encodeURIComponent(estimateId)}/decision`,
  { decision, note, reviewRoundId: review.id, reviewRoundVersion: review.version }
);
export const downloadClientEstimatePdf = (estimateId: string, roundId: string) =>
  apiClient.getBlob(`/client/estimates/${encodeURIComponent(estimateId)}/pdf?roundId=${encodeURIComponent(roundId)}`);

export const enableEstimateCollaboration = (estimateId: string, expectedVersion: number) =>
  apiClient.post<EstimateDraft>(`/estimates/${encodeURIComponent(estimateId)}/enable-collaboration`, { expectedVersion });
export const withdrawEstimateReview = (estimateId: string, input: {
  expectedVersion: number; reviewRoundId: string; reviewRoundVersion: number; reason: string;
}) => apiClient.post<EstimateDraft>(`/estimates/${encodeURIComponent(estimateId)}/withdraw-review`, input);
export interface EstimatePreparationSource {
  estimateId: string; estimateVersion: number; estimateReviewRoundId: string | null;
  workflowVersion: 2; phase: "pre" | "post"; kind: "approved_pre" | "released_post" | "approved_final";
  sourceSnapshotId: string; sourceDigest: string;
}
export const releaseEstimatePreparation = (estimateId: string, expectedVersion: number) =>
  apiClient.post<EstimatePreparationSource>(`/estimates/${encodeURIComponent(estimateId)}/preparation-snapshots`, { expectedVersion });
