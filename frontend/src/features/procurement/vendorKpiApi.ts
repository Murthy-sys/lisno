import { apiClient } from "../../api/client";
import type {
  VendorKpiPublicInspection,
  VendorKpiPublicSubmitInput,
  VendorKpiRequestInput,
  VendorKpiSaveInput,
  VendorKpiStaffDetail,
  VendorKpiSubmissionReceipt
} from "../../../../shared/knowledge/vendorKpi";

const staffPath = (vendorId: string) => `/procurement/vendor-kpis/${encodeURIComponent(vendorId)}`;
const publicOptions = { cache: "no-store" as const, referrerPolicy: "no-referrer" as const };

export const vendorKpiKeys = {
  all: ["private-vendor-kpis"] as const,
  scope: (actorId: string) => ["private-vendor-kpis", import.meta.env.VITE_API_URL ?? "/api/v1", actorId] as const,
  detail: (actorId: string, vendorId: string) => [...vendorKpiKeys.scope(actorId), vendorId] as const
};

export function getVendorKpi(vendorId: string, signal?: AbortSignal) {
  return apiClient.get<VendorKpiStaffDetail>(staffPath(vendorId), { signal, showGlobalLoader: false });
}

export function saveProcurementVendorKpi(vendorId: string, input: VendorKpiSaveInput) {
  return apiClient.put<VendorKpiStaffDetail>(`${staffPath(vendorId)}/procurement`, input);
}

export function requestVendorKpi(vendorId: string, input: VendorKpiRequestInput) {
  return apiClient.post<VendorKpiStaffDetail>(`${staffPath(vendorId)}/requests`, input);
}

export function inspectPublicVendorKpi(token: string) {
  return apiClient.postPublic<VendorKpiPublicInspection>("/vendor-kpi/inspect", { token }, publicOptions);
}

export function submitPublicVendorKpi(input: VendorKpiPublicSubmitInput) {
  return apiClient.postPublic<VendorKpiSubmissionReceipt>("/vendor-kpi/submit", input, publicOptions);
}
