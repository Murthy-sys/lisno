import type { EstimateDimensions } from "../../../../shared/estimation/estimateDimensions";
import type { KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import { apiClient } from "../../api/client";
import type { EstimateDraft, EstimateStatus } from "../leads/leadsApi";
import type { EstimateTierChoice, EstimateTierLine, EstimateTierSource, EstimateTiersDetail } from "./estimateTiersApi";

/** Additive grouping fields are optional while older servers/fixtures remain readable. */
export interface QuotationGrouping {
  mainBasketId?: string;
  mainBasketName?: string;
  subBasketId?: string | null;
  subBasketName?: string | null;
}
export interface QuotationGroup {
  mainBasketId: string;
  subBasketId: string | null;
  roomId: string | null;
  includedCount: number;
  sourceToken: string;
}
export interface QuotationBasket {
  id: string;
  name: string;
  subBaskets: Array<{ id: string; name: string }>;
}
export interface QuotationLine extends EstimateTierLine, QuotationGrouping {
  roomId: string;
  included: boolean;
  source: EstimateTierSource | null;
}
export interface QuotationSetupRoom {
  id: string;
  typeId: string | null;
  label: string;
  length: number | null;
  width: number | null;
  sqft: number;
  canRemove: boolean;
  removalBlockedReason: string | null;
}
export interface QuotationSetup {
  propertyType: string;
  bedroomCount: number | null;
  rooms: QuotationSetupRoom[];
  selectedMainBasketIds: string[];
  sourceToken: string;
  canConfigure: boolean;
}
export interface QuotationSetupBasket {
  id: string;
  name: string;
  subBaskets: Array<{ id: string; name: string; mainLineCount: number; temporaryItemCount: number }>;
  directTemporaryItemCount: number;
  canSelect: boolean;
  canRemove: boolean;
  removalBlockedReason: string | null;
}
export interface QuotationSetupCatalogue {
  projectId: string;
  estimateId: string;
  estimateVersion: number;
  setup: QuotationSetup;
  baskets: QuotationSetupBasket[];
}
export interface QuotationConfigureOperation {
  kind: "configure";
  sourceToken: string;
  propertyType: string;
  bedroomCount: number | null;
  rooms: Array<Pick<QuotationSetupRoom, "id" | "typeId" | "label" | "length" | "width">>;
  selectedMainBasketIds: string[];
}
export interface QuotationDetail extends Omit<EstimateTiersDetail, "lines"> {
  readonly projectNumber?: string | null;

  workflowVersion: 3;
  phase: "pre" | "post";
  status: EstimateStatus;
  pricedRevision: number;
  rooms: Array<{ id: string; name: string }>;
  reviewState: "draft" | "awaiting_staff_review" | "ready_for_approval" | "approved";
  lines: QuotationLine[];
  excludedLines?: QuotationLine[];
  baskets?: QuotationBasket[];
  groups?: QuotationGroup[];
  /** Absent on older servers. Never infer editable setup from the visible line list. */
  setup?: QuotationSetup;
}
export interface QuotationCandidate extends QuotationGrouping {
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
export type QuotationLineOperation = {
  kind: "add"; mainLineId: string; roomId: string; source: EstimateTierSource;
  quantity: number; modeTier: KnowledgeModeTier; dimensions?: EstimateDimensions;
  selectedInHouseComponentIds?: string[];
} | {
  kind: "update"; lineItemId: string; source: EstimateTierSource;
  quantity?: number; modeTier?: KnowledgeModeTier; dimensions?: EstimateDimensions;
  selectedInHouseComponentIds?: string[]; included?: boolean;
} | {
  kind: "exclude_group";
  mainBasketId: string;
  subBasketId: string | null;
  roomId: string | null;
  sourceToken: string;
};
export type QuotationOperation = QuotationLineOperation | QuotationConfigureOperation;
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
  setup: (projectId: string) => ["quotation", projectId, "setup"] as const,
  candidates: (projectId: string, estimateVersion: number | null) => ["quotation", projectId, "candidates", estimateVersion] as const,
  items: (projectId: string, search: string, offset: number) => ["quotation", projectId, "items", search, offset] as const,
  revision: (projectId: string) => ["quotation", projectId, "revision"] as const
};
const path = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/quotation`;
export const getQuotation = (projectId: string) => apiClient.get<QuotationDetail>(path(projectId));
export const getQuotationSetup = (projectId: string) => apiClient.get<QuotationSetupCatalogue>(`${path(projectId)}/setup`);
export const getQuotationRevision = (projectId: string) => apiClient.get<QuotationRevision>(`${path(projectId)}/revision`);
export const getQuotationCandidates = (projectId: string, search: string, offset = 0) => {
  const query = new URLSearchParams({ search, limit: "20", offset: String(offset) });
  return apiClient.get<{ items: QuotationCandidate[]; total: number; limit: number; offset: number }>(`${path(projectId)}/items?${query}`);
};
export const saveQuotation = (projectId: string, expectedVersion: number, operations: QuotationOperation[]) =>
  apiClient.patch<QuotationDetail>(path(projectId), { expectedVersion, operations });
export const unlockQuotation = (estimateId: string, input: { expectedVersion: number; reviewRoundId: string; reason: string; idempotencyKey: string }) =>
  apiClient.post<EstimateDraft>(`/estimates/${encodeURIComponent(estimateId)}/unlock`, input);
