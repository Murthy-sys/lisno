import type { JsonApiClient } from "../../core/http/apiClient";
import type { VendorPurchaseOrder } from "../procurement/purchaseOrderApi";
import type { VendorWorkPageData, VendorWorkReview, VendorWorkTask } from "./vendorWorkTypes";

export interface ReviewDecision { expectedVersion: number; idempotencyKey: string; decision: "approve" | "request_changes"; reason: string | null }
export interface VendorWorkReviewPage { items: VendorWorkReview[]; total: number; pendingTotal: number; limit: number; offset: number }
export const workImagePath = (projectId: string, assignmentId: string, imageId: string) => `/projects/${encodeURIComponent(projectId)}/vendor-work/${encodeURIComponent(assignmentId)}/images/${encodeURIComponent(imageId)}`;
export const workUploadPath = (id: string) => `/vendor/work/${encodeURIComponent(id)}/images`;
export function createVendorWorkApi(http: JsonApiClient["authenticated"]) {
  const path = (id: string) => `/vendor/work/${encodeURIComponent(id)}`;
  const reviews = (id: string) => `/clients/projects/${encodeURIComponent(id)}/vendor-work-reviews`;
  return {
    list: (offset: number, signal?: AbortSignal) => http.get<VendorWorkPageData>(`/vendor/work?limit=25&offset=${offset}`, { signal }),
    detail: (id: string, signal?: AbortSignal) => http.get<VendorWorkTask>(path(id), { signal }),
    progress: (id: string, body: { expectedVersion: number; idempotencyKey: string; progress: number; note: string }) => http.patch<VendorWorkTask>(`${path(id)}/progress`, body),
    submit: (id: string, body: { expectedVersion: number; idempotencyKey: string; note: string }) => http.post<VendorWorkReview>(`${path(id)}/submit`, body),
    order: (id: string, signal?: AbortSignal) => http.get<VendorPurchaseOrder>(`/vendor/purchase-orders/${encodeURIComponent(id)}`, { signal }),
    reviews: (id: string, offset: number, signal?: AbortSignal) => http.get<VendorWorkReviewPage>(`${reviews(id)}?limit=25&offset=${offset}`, { signal }),
    decide: (id: string, reviewId: string, body: ReviewDecision) => http.post<VendorWorkReview>(`${reviews(id)}/${encodeURIComponent(reviewId)}/decision`, body)
  };
}
