import type { ProposalRequestMode, ProposalTarget } from "../vendor-basket-proposals/proposalTypes";
import { apiClient, type PaginatedData } from "../../api/client";

export type VendorBasketRequestStatus = "pending" | "fulfilled" | "rejected";

export interface VendorBasketRequest {
  readonly requestMode?: ProposalRequestMode;
  readonly target?: ProposalTarget;
  readonly targetParentName?: string | null;
  kind?: "configuration_proposal" | "name_only" | "configuration_sub_basket";
  description?: string | null;
  proposalId?: string | null;
  proposalCounts?: { subBaskets: number; mainLines: number };
  id: string;
  requesterId: string;
  vendorId: string | null;
  vendorName: string | null;
  proposedName: string;
  status: VendorBasketRequestStatus;
  version: number;
  basketId: string | null;
  subBasketId: string | null;
  mainLineId: string | null;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedById: string | null;
}

export interface OwnVendorBasketRequestFilters {
  search?: string;
  status?: VendorBasketRequestStatus | "";
  targetKind?: ProposalTarget["kind"] | "";
}

export const vendorBasketRequestKeys = {
  mine: ["vendor-basket-requests", "mine"] as const,
  mineActor: (actorId: string) => ["vendor-basket-requests", "mine", actorId] as const,
  minePage: (actorId: string, filters: OwnVendorBasketRequestFilters, limit: number, offset: number) =>
    ["vendor-basket-requests", "mine", actorId, filters, limit, offset] as const,
  review: ["vendor-basket-requests", "review"] as const,
  detail: (actorId: string, requestId: string) => ["vendor-basket-requests", "review", "detail", actorId, requestId] as const,
  reviewPage: (status: VendorBasketRequestStatus | "", limit: number, offset: number) =>
    ["vendor-basket-requests", "review", status, limit, offset] as const
};

export function createVendorBasketRequest(input: {
  vendorId?: string | null;
  vendorName: string;
  proposedName: string;
  idempotencyKey: string;
}): Promise<VendorBasketRequest> {
  return apiClient.post("/procurement/vendor-basket-requests", input);
}

export interface CreateConfigurationSubBasketRequestInput {
  basketId: string;
  name: string;
  description: string;
  idempotencyKey: string;
}

export function createConfigurationSubBasketRequest(input: CreateConfigurationSubBasketRequestInput): Promise<VendorBasketRequest> {
  return apiClient.post("/admin/ai-estimator-knowledge/sub-basket-requests", input);
}

export function listOwnVendorBasketRequests(limit = 20, offset = 0, filters: OwnVendorBasketRequestFilters = {}, signal?: AbortSignal): Promise<PaginatedData<VendorBasketRequest>> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.status) params.set("status", filters.status);
  if (filters.targetKind) params.set("targetKind", filters.targetKind);
  return apiClient.get(`/procurement/vendor-basket-requests/mine?${params.toString()}`, { signal });
}

export function listVendorBasketRequestsForReview(
  status: VendorBasketRequestStatus | "" = "pending",
  limit = 20,
  offset = 0
): Promise<PaginatedData<VendorBasketRequest>> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (status) params.set("status", status);
  return apiClient.get(`/admin/ai-estimator-knowledge/basket-requests?${params.toString()}`);
}

export interface VendorBasketRequestConfiguration {
  subBasketId?: string;
  subBasketName?: string;
  mainLineName?: string;
}

export interface DecideVendorBasketRequestInput {
  decision: "fulfill" | "reject";
  expectedVersion: number;
  reason?: string | null;
  idempotencyKey: string;
  configuration?: VendorBasketRequestConfiguration;
}

export function decideVendorBasketRequest(requestId: string, input: DecideVendorBasketRequestInput): Promise<VendorBasketRequest> {
  return apiClient.post(`/admin/ai-estimator-knowledge/basket-requests/${encodeURIComponent(requestId)}/decision`, input);
}

export function getVendorBasketRequestForReview(requestId: string, signal?: AbortSignal): Promise<VendorBasketRequest> {
  return apiClient.get(`/admin/ai-estimator-knowledge/basket-requests/${encodeURIComponent(requestId)}`, { signal });
}
