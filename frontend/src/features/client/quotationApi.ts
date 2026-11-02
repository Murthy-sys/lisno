import type { EstimateDimensions } from "../../../../shared/estimation/estimateDimensions";
import type { KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import { apiClient } from "../../api/client";
import type { EstimateDraft, EstimateStatus } from "../leads/leadsApi";
import type { EstimateTierChoice, EstimateTierLine, EstimateTierSource, EstimateTiersDetail } from "./estimateTiersApi";

export interface QuotationLine extends EstimateTierLine {
  roomId: string;
  included: boolean;
  source: EstimateTierSource | null;
}
export interface QuotationDetail extends Omit<EstimateTiersDetail, "lines"> {
  workflowVersion: 3;
  phase: "pre" | "post";
  status: EstimateStatus;
  pricedRevision: number;
  rooms: Array<{ id: string; name: string }>;
  reviewState: "draft" | "awaiting_staff_review" | "ready_for_approval" | "approved";
  lines: QuotationLine[];
}
export interface QuotationCandidate {
  mainLineId: string;
  name: string;
  source: EstimateTierSource;
  pricingMode: EstimateTierLine["pricingMode"];
  modeTier: KnowledgeModeTier;
  dimensionsMandatory: boolean;
  dimensionRule: EstimateTierLine["dimensionRule"];
  uomName: string;
  choices: EstimateTierChoice[];
}
export type QuotationOperation = {
  kind: "add"; mainLineId: string; roomId: string; source: EstimateTierSource;
  quantity: number; modeTier: KnowledgeModeTier; dimensions?: EstimateDimensions;
  selectedInHouseComponentIds?: string[];
} | {
  kind: "update"; lineItemId: string; source: EstimateTierSource;
  quantity?: number; modeTier?: KnowledgeModeTier; dimensions?: EstimateDimensions;
  selectedInHouseComponentIds?: string[]; included?: boolean;
};
export interface QuotationRevision {
  estimateId: string;
  estimateVersion: number;
  pricedRevision: number;
  status: EstimateStatus;
  phase: "pre" | "post";
}
export const quotationKeys = {
  all: ["quotation"] as const,
  detail: (projectId: string) => ["quotation", projectId, "detail"] as const,
  items: (projectId: string, search: string, offset: number) => ["quotation", projectId, "items", search, offset] as const,
  revision: (projectId: string) => ["quotation", projectId, "revision"] as const
};
const path = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/quotation`;
export const getQuotation = (projectId: string) => apiClient.get<QuotationDetail>(path(projectId));
export const getQuotationRevision = (projectId: string) => apiClient.get<QuotationRevision>(`${path(projectId)}/revision`);
export const getQuotationCandidates = (projectId: string, search: string, offset = 0) => {
  const query = new URLSearchParams({ search, limit: "20", offset: String(offset) });
  return apiClient.get<{ items: QuotationCandidate[]; total: number; limit: number; offset: number }>(`${path(projectId)}/items?${query}`);
};
export const saveQuotation = (projectId: string, expectedVersion: number, operations: QuotationOperation[]) =>
  apiClient.patch<QuotationDetail>(path(projectId), { expectedVersion, operations });
export const unlockQuotation = (estimateId: string, input: { expectedVersion: number; reviewRoundId: string; reason: string; idempotencyKey: string }) =>
  apiClient.post<EstimateDraft>(`/estimates/${encodeURIComponent(estimateId)}/unlock`, input);
