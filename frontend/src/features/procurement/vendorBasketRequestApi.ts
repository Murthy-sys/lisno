import { apiClient, type PaginatedData } from "../../api/client";

export type VendorBasketRequestStatus = "pending" | "fulfilled" | "rejected";

export interface VendorBasketRequest {
  id: string;
  requesterId: string;
  vendorId: string | null;
  vendorName: string;
  proposedName: string;
  status: VendorBasketRequestStatus;
  version: number;
  basketId: string | null;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedById: string | null;
}

export const vendorBasketRequestKeys = {
  mine: ["vendor-basket-requests", "mine"] as const,
  review: ["vendor-basket-requests", "review"] as const,
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

export function listOwnVendorBasketRequests(limit = 20, offset = 0): Promise<PaginatedData<VendorBasketRequest>> {
  return apiClient.get(`/procurement/vendor-basket-requests/mine?limit=${limit}&offset=${offset}`);
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

export function decideVendorBasketRequest(requestId: string, input: {
  decision: "fulfill" | "reject";
  expectedVersion: number;
  reason?: string | null;
  idempotencyKey: string;
}): Promise<VendorBasketRequest> {
  return apiClient.post(`/admin/ai-estimator-knowledge/basket-requests/${encodeURIComponent(requestId)}/decision`, input);
}
