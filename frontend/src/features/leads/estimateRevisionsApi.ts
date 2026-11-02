import { apiClient } from "../../api/client";
import type { EstimateClientReviewSnapshot, EstimateClientReviewSummary } from "../../api/types";

export interface EstimateRevisionSummary {
  id: string;
  estimateId: string;
  estimateVersion: number;
  sendGeneration: number;
  phase?: "pre" | "post";
  workflowVersion?: 2 | 3;
  submittedAt: string;
  status: EstimateClientReviewSummary["status"];
  deliveryStatus: Exclude<EstimateClientReviewSummary["deliveryStatus"], "sending">;
  subtotalPaise: number;
}

export interface EstimateRevisionPage {
  items: EstimateRevisionSummary[];
  pagination: { limit: number; nextCursor: string | null };
}

export interface EstimateRevisionDetail extends EstimateRevisionSummary {
  snapshot: EstimateClientReviewSnapshot;
}

export const estimateRevisionKeys = {
  all: ["estimates", "revisions"] as const,
  estimate: (estimateId: string, actorId: string) => ["estimates", "revisions", actorId, estimateId] as const,
  list: (estimateId: string, actorId: string) => [...estimateRevisionKeys.estimate(estimateId, actorId), "list"] as const,
  detail: (estimateId: string, revisionId: string, actorId: string) => [...estimateRevisionKeys.estimate(estimateId, actorId), "detail", revisionId] as const
};

const revisionPath = (estimateId: string) => `/estimates/${encodeURIComponent(estimateId)}/revisions`;

export function getEstimateRevisions(estimateId: string, options: { cursor?: string | null; limit?: number; signal?: AbortSignal } = {}) {
  const params = new URLSearchParams();
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  const query = params.toString();
  return apiClient.get<EstimateRevisionPage>(`${revisionPath(estimateId)}${query ? `?${query}` : ""}`, { signal: options.signal, showGlobalLoader: false });
}

export const getEstimateRevision = (estimateId: string, revisionId: string, signal?: AbortSignal) =>
  apiClient.get<EstimateRevisionDetail>(`${revisionPath(estimateId)}/${encodeURIComponent(revisionId)}`, { signal, showGlobalLoader: false });

export const downloadEstimateRevisionPdf = (estimateId: string, revisionId: string, signal?: AbortSignal) =>
  apiClient.getBlob(`${revisionPath(estimateId)}/${encodeURIComponent(revisionId)}/pdf`, { signal, showGlobalLoader: false });

export const estimateRevisionLabel = (revision: Pick<EstimateRevisionSummary, "phase" | "sendGeneration">) =>
  `${revision.phase === "pre" ? "Pre-estimate" : "Estimate"} · R${revision.sendGeneration}`;
