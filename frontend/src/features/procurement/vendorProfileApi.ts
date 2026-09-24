import { apiClient } from "../../api/client";
import type { KnowledgeMaster, ProcurementVendorProfile, ProcurementVendorDetail, ProcurementVendorPhotoMutationResult, ProcurementVendorBaselineInput, ProcurementVendorBaselinePage, ProcurementVendorBaselineResult } from "../ai-estimator-knowledge/knowledgeTypes";

const path = (id: string) => `/admin/ai-estimator-knowledge/vendors/${encodeURIComponent(id)}`;
export interface VendorProfileInput {
  name: string;
  description?: string | null;
  procurementProfile: ProcurementVendorProfile;
  confirmPhysicalAddressVerification?: boolean;
  status?: "active" | "inactive";
}
export async function getVendorDetail(id: string, signal?: AbortSignal) {
  const detail = await apiClient.get<ProcurementVendorDetail>(path(id), { signal });
  if (detail.id !== id || detail.masterType !== "vendors") throw new Error("The vendor identity changed. Refresh the directory.");
  return detail;
}
export const createVendorProfile = (input: VendorProfileInput) => apiClient.post<KnowledgeMaster>("/admin/ai-estimator-knowledge/vendors", input);
export const updateVendorProfile = (id: string, input: VendorProfileInput & { expectedVersion: number }) => apiClient.patch<KnowledgeMaster>(path(id), input);
export function uploadVendorPhoto(id: string, photo: File, expectedVersion: number, idempotencyKey: string) {
  const body = new FormData();
  body.append("photo", photo);
  body.append("expectedVersion", String(expectedVersion));
  body.append("idempotencyKey", idempotencyKey);
  return apiClient.putMultipart<ProcurementVendorPhotoMutationResult>(`${path(id)}/photo`, body);
}
export const removeVendorPhoto = (id: string, expectedVersion: number) => apiClient.delete<ProcurementVendorPhotoMutationResult>(`${path(id)}/photo`, { expectedVersion });
export const getVendorBaseline = (id: string, offset: number) => apiClient.get<ProcurementVendorBaselinePage>(`${path(id)}/allocation-baseline?limit=20&offset=${offset}`);
export const completeVendorBaseline = (id: string, itemId: string, input: ProcurementVendorBaselineInput) => apiClient.post<ProcurementVendorBaselineResult>(`${path(id)}/allocation-baseline/${encodeURIComponent(itemId)}`, input);
