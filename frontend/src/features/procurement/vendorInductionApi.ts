import { apiClient } from "../../api/client";
import type {
  VendorInductionDraftSaveInput,
  VendorInductionPublishInput,
  VendorInductionPublicInspection,
  VendorInductionPublicSubmitInput,
  VendorInductionReopenInput,
  VendorInductionRequestInput,
  VendorInductionReviewInput,
  VendorInductionStaffDetail,
  VendorInductionSubmissionReceipt
} from "../../../../shared/knowledge/vendorInduction";

const staffPath = (vendorId: string) => `/procurement/vendor-inductions/${encodeURIComponent(vendorId)}`;
const publicOptions = { cache: "no-store" as const, referrerPolicy: "no-referrer" as const };

export const vendorInductionKeys = {
  all: ["private-vendor-inductions"] as const,
  scope: (actorId: string) => ["private-vendor-inductions", import.meta.env.VITE_API_URL ?? "/api/v1", actorId] as const,
  detail: (actorId: string, vendorId: string) => [...vendorInductionKeys.scope(actorId), vendorId] as const
};

export const getVendorInduction = (vendorId: string, signal?: AbortSignal) =>
  apiClient.get<VendorInductionStaffDetail>(staffPath(vendorId), { signal, showGlobalLoader: false });
export const saveVendorInductionDraft = (vendorId: string, input: VendorInductionDraftSaveInput) =>
  apiClient.put<VendorInductionStaffDetail>(`${staffPath(vendorId)}/draft`, input);
export const publishVendorInduction = (vendorId: string, input: VendorInductionPublishInput) =>
  apiClient.post<VendorInductionStaffDetail>(`${staffPath(vendorId)}/publish`, input);
export const requestVendorInduction = (vendorId: string, input: VendorInductionRequestInput) =>
  apiClient.post<VendorInductionStaffDetail>(`${staffPath(vendorId)}/requests`, input);
export const reviewVendorInduction = (vendorId: string, input: VendorInductionReviewInput) =>
  apiClient.post<VendorInductionStaffDetail>(`${staffPath(vendorId)}/reviews`, input);
export const reopenVendorInduction = (vendorId: string, input: VendorInductionReopenInput) =>
  apiClient.post<VendorInductionStaffDetail>(`${staffPath(vendorId)}/reopen`, input);
export const inspectPublicVendorInduction = (token: string) =>
  apiClient.postPublic<VendorInductionPublicInspection>("/vendor-induction/inspect", { token }, publicOptions);
export const submitPublicVendorInduction = (input: VendorInductionPublicSubmitInput) =>
  apiClient.postPublic<VendorInductionSubmissionReceipt>("/vendor-induction/submit", input, publicOptions);
