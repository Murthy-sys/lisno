import { apiClient } from "../../api/client";
import type { EstimateDraft } from "../leads/leadsApi";

export interface EstimateQueueItem extends EstimateDraft {
  lead: {
    _id: string;
    clientName: string;
    projectName: string;
    location: string;
    clientEmail: string;
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
  note: string
) => apiClient.post<EstimateDraft>(
  `/client/estimates/${encodeURIComponent(estimateId)}/decision`,
  { decision, note }
);
