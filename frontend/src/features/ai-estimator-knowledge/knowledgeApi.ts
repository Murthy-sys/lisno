import { apiClient } from "../../api/client";
import type {
  KnowledgeBasket,
  KnowledgeBasketListResponse,
  KnowledgeContext,
  KnowledgeHistoryResponse,
  KnowledgeItemDetail,
  KnowledgeItemListResponse,
  KnowledgeItemStatus,
  KnowledgeJsonObject,
  KnowledgeMainLine,
  KnowledgeMainLineListResponse,
  KnowledgeMaster,
  KnowledgeMasterListResponse,
  KnowledgeMasterStatus,
  KnowledgeMasterType,
  KnowledgePreview,
  KnowledgeSectionEnvelope,
  KnowledgeSectionKey
} from "./knowledgeTypes";

const ADMIN_PREFIX = "/admin/ai-estimator-knowledge";
const CONTEXT_PATH = "/ai-estimator-knowledge/context";

function segment(value: string): string {
  return encodeURIComponent(value);
}

type QueryParamValue =
  | string
  | number
  | boolean
  | readonly string[]
  | null
  | undefined;

function withQuery<TParams extends { [K in keyof TParams]: QueryParamValue }>(
  path: string,
  params: TParams
): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
      continue;
    }
    query.set(key, String(value));
  }

  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export interface KnowledgeListParams {
  readonly search?: string;
  readonly basketId?: string;
  readonly status?: KnowledgeItemStatus;
  readonly priorityId?: string;
  readonly modeId?: string;
  readonly surfaceId?: string;
  readonly uomId?: string;
  readonly vendorId?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface KnowledgePageParams {
  readonly search?: string;
  readonly status?: KnowledgeMasterStatus | KnowledgeItemStatus;
  readonly limit?: number;
  readonly offset?: number;
}

export interface KnowledgeReferenceListParams {
  readonly search?: string;
  readonly status?: KnowledgeMasterStatus;
  readonly limit?: number;
  readonly offset?: number;
  readonly includeArchived?: boolean;
}

export interface KnowledgeMainLineListParams {
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly includeArchived?: boolean;
}

export interface KnowledgeSectionUpdate<TPayload extends KnowledgeJsonObject> {
  readonly expectedVersion: number;
  readonly expectedAggregateVersion?: number;
  readonly applicability?: "configured" | "not_configured" | "not_applicable";
  readonly payload: TPayload;
}

export interface KnowledgeExpectedVersionCommand {
  readonly expectedVersion: number;
  readonly reason?: string;
}

export interface KnowledgeContextRequest {
  readonly mainBasketId: string;
  readonly mainLineId: string;
  readonly specificationId?: string;
  readonly quantity?: string;
  readonly uomId?: string;
  readonly surfaceId?: string;
  readonly modeId?: string;
}

export interface KnowledgePreviewRequest {
  readonly priceVersionId?: string | null;
  readonly taxVersionId?: string | null;
  readonly unitRatePaise?: number | null;
  readonly quantityAdjustmentBps?: number | null;
  readonly quantity?: string | null;
  readonly quantityScale: number;
  readonly wastageBps?: number | null;
  readonly taxRateBps?: number | null;
  readonly taxTreatment?: "exclusive" | "inclusive" | null;
  readonly startMarginBps?: number | null;
  readonly bottomMarginBps?: number | null;
  readonly pmcMarkupBps?: number | null;
  readonly duration?: {
    readonly productivity: string;
    readonly productivityScale: number;
    readonly unit: "minutes" | "hours" | "days" | "weeks";
    readonly minimum?: string | null;
    readonly maximum?: string | null;
  } | null;
}

export interface KnowledgeCreateBasketInput {
  readonly name: string;
  readonly description?: string | null;
  readonly displayOrder?: number;
}

export interface KnowledgeUpdateBasketInput {
  readonly expectedVersion: number;
  readonly name?: string;
  readonly description?: string | null;
  readonly displayOrder?: number;
  readonly status?: "active" | "inactive";
}

export interface KnowledgeCreateMainLineInput {
  readonly name: string;
  readonly description?: string | null;
  readonly displayOrder?: number;
}

export interface KnowledgeUpdateMainLineInput {
  readonly expectedVersion: number;
  readonly name?: string;
  readonly description?: string | null;
  readonly displayOrder?: number;
}

export interface KnowledgeTaxVersionInput {
  readonly rateBps: number;
  readonly treatment: "exclusive" | "inclusive";
  readonly applicability: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string | null;
  readonly status?: "draft" | "active" | "inactive";
}

export interface KnowledgeCreateMasterInput {
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly displayOrder?: number;
  readonly decimalScale?: number;
  readonly taxVersion?: KnowledgeTaxVersionInput;
}

export interface KnowledgeUpdateMasterInput extends Partial<KnowledgeCreateMasterInput> {
  readonly expectedVersion: number;
  readonly status?: "active" | "inactive";
}

export interface KnowledgeCreateRevisionInput {
  readonly expectedVersion: number;
  readonly reason?: string;
}

export interface KnowledgeActivationInput {
  readonly expectedVersion: number;
  readonly reason?: string;
}

export interface KnowledgeDuplicateInput {
  readonly expectedVersion: number;
  readonly reason?: string;
  readonly name?: string;
}

export function listKnowledgeItems(
  params: KnowledgeListParams = {}
): Promise<KnowledgeItemListResponse> {
  return apiClient.get<KnowledgeItemListResponse>(
    withQuery(`${ADMIN_PREFIX}/items`, params)
  );
}

export function getKnowledgeItem(mainLineId: string): Promise<KnowledgeItemDetail> {
  return apiClient.get<KnowledgeItemDetail>(
    `${ADMIN_PREFIX}/main-lines/${segment(mainLineId)}`
  );
}

export function getKnowledgeHistory(
  mainLineId: string,
  params: Pick<KnowledgePageParams, "limit" | "offset"> = {}
): Promise<KnowledgeHistoryResponse> {
  return apiClient.get<KnowledgeHistoryResponse>(
    withQuery(`${ADMIN_PREFIX}/main-lines/${segment(mainLineId)}/history`, params)
  );
}

export function getKnowledgeSection<TPayload extends KnowledgeJsonObject>(
  mainLineId: string,
  revisionId: string,
  sectionKey: KnowledgeSectionKey
): Promise<KnowledgeSectionEnvelope<TPayload>> {
  return apiClient.get<KnowledgeSectionEnvelope<TPayload>>(
    `${ADMIN_PREFIX}/main-lines/${segment(mainLineId)}/revisions/${segment(revisionId)}/sections/${segment(sectionKey)}`
  );
}

export function updateKnowledgeSection<TPayload extends KnowledgeJsonObject>(
  mainLineId: string,
  revisionId: string,
  sectionKey: KnowledgeSectionKey,
  input: KnowledgeSectionUpdate<TPayload>
): Promise<KnowledgeSectionEnvelope<TPayload>> {
  return apiClient.put<KnowledgeSectionEnvelope<TPayload>>(
    `${ADMIN_PREFIX}/main-lines/${segment(mainLineId)}/revisions/${segment(revisionId)}/sections/${segment(sectionKey)}`,
    input
  );
}

export function createKnowledgeRevision(
  mainLineId: string,
  input: KnowledgeCreateRevisionInput
): Promise<KnowledgeItemDetail> {
  return apiClient.post<KnowledgeItemDetail>(
    `${ADMIN_PREFIX}/main-lines/${segment(mainLineId)}/revisions`,
    input
  );
}

export function activateKnowledgeRevision(
  mainLineId: string,
  revisionId: string,
  input: KnowledgeActivationInput
): Promise<KnowledgeItemDetail> {
  return apiClient.post<KnowledgeItemDetail>(
    `${ADMIN_PREFIX}/main-lines/${segment(mainLineId)}/revisions/${segment(revisionId)}/activate`,
    input
  );
}

export function deactivateKnowledgeItem(
  mainLineId: string,
  input: KnowledgeExpectedVersionCommand
): Promise<KnowledgeItemDetail> {
  return apiClient.post<KnowledgeItemDetail>(
    `${ADMIN_PREFIX}/main-lines/${segment(mainLineId)}/deactivate`,
    input
  );
}

export function duplicateKnowledgeItem(
  mainLineId: string,
  input: KnowledgeDuplicateInput
): Promise<KnowledgeItemDetail> {
  return apiClient.post<KnowledgeItemDetail>(
    `${ADMIN_PREFIX}/main-lines/${segment(mainLineId)}/duplicate`,
    input
  );
}

export function listKnowledgeBaskets(
  params: KnowledgeReferenceListParams = {}
): Promise<KnowledgeBasketListResponse> {
  return apiClient.get<KnowledgeBasketListResponse>(
    withQuery(`${ADMIN_PREFIX}/baskets`, params)
  );
}

export function createKnowledgeBasket(
  input: KnowledgeCreateBasketInput
): Promise<KnowledgeBasket> {
  return apiClient.post<KnowledgeBasket>(`${ADMIN_PREFIX}/baskets`, input);
}

export function updateKnowledgeBasket(
  basketId: string,
  input: KnowledgeUpdateBasketInput
): Promise<KnowledgeBasket> {
  return apiClient.patch<KnowledgeBasket>(
    `${ADMIN_PREFIX}/baskets/${segment(basketId)}`,
    input
  );
}

export function archiveKnowledgeBasket(
  basketId: string,
  input: KnowledgeExpectedVersionCommand
): Promise<KnowledgeBasket> {
  return apiClient.delete<KnowledgeBasket>(
    `${ADMIN_PREFIX}/baskets/${segment(basketId)}`,
    input
  );
}

export function listKnowledgeMainLines(
  basketId: string,
  params: KnowledgeMainLineListParams = {}
): Promise<KnowledgeMainLineListResponse> {
  return apiClient.get<KnowledgeMainLineListResponse>(
    withQuery(`${ADMIN_PREFIX}/baskets/${segment(basketId)}/main-lines`, params)
  );
}

export function createKnowledgeMainLine(
  basketId: string,
  input: KnowledgeCreateMainLineInput
): Promise<KnowledgeItemDetail> {
  return apiClient.post<KnowledgeItemDetail>(
    `${ADMIN_PREFIX}/baskets/${segment(basketId)}/main-lines`,
    input
  );
}

export function updateKnowledgeMainLine(
  mainLineId: string,
  input: KnowledgeUpdateMainLineInput
): Promise<KnowledgeItemDetail> {
  return apiClient.patch<KnowledgeItemDetail>(
    `${ADMIN_PREFIX}/main-lines/${segment(mainLineId)}`,
    input
  );
}

export function archiveKnowledgeMainLine(
  mainLineId: string,
  input: KnowledgeExpectedVersionCommand
): Promise<KnowledgeItemDetail> {
  return apiClient.delete<KnowledgeItemDetail>(
    `${ADMIN_PREFIX}/main-lines/${segment(mainLineId)}`,
    input
  );
}

export function listKnowledgeMasters(
  type: KnowledgeMasterType,
  params: KnowledgeReferenceListParams = {}
): Promise<KnowledgeMasterListResponse> {
  return apiClient.get<KnowledgeMasterListResponse>(
    withQuery(`${ADMIN_PREFIX}/${type}`, params)
  );
}

export function createKnowledgeMaster(
  type: KnowledgeMasterType,
  input: KnowledgeCreateMasterInput
): Promise<KnowledgeMaster> {
  return apiClient.post<KnowledgeMaster>(`${ADMIN_PREFIX}/${type}`, input);
}

export function updateKnowledgeMaster(
  type: KnowledgeMasterType,
  id: string,
  input: KnowledgeUpdateMasterInput
): Promise<KnowledgeMaster> {
  return apiClient.patch<KnowledgeMaster>(
    `${ADMIN_PREFIX}/${type}/${segment(id)}`,
    input
  );
}

export function archiveKnowledgeMaster(
  type: KnowledgeMasterType,
  id: string,
  input: KnowledgeExpectedVersionCommand
): Promise<KnowledgeMaster> {
  return apiClient.delete<KnowledgeMaster>(
    `${ADMIN_PREFIX}/${type}/${segment(id)}`,
    input
  );
}

export function previewKnowledge(
  input: KnowledgePreviewRequest
): Promise<KnowledgePreview> {
  return apiClient.post<KnowledgePreview>(`${ADMIN_PREFIX}/preview`, input);
}

export function resolveKnowledgeContext(
  input: KnowledgeContextRequest
): Promise<KnowledgeContext> {
  return apiClient.post<KnowledgeContext>(CONTEXT_PATH, input);
}
