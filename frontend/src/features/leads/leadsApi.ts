import { apiClient, type PaginatedData } from "../../api/client";
import type { Lead, LeadActivity, LeadActivityType, LeadStage } from "../../api/types";

export const leadKeys = { all: ["leads"] as const, page: (search: string, stage: LeadStage | "all") => ["leads", "page", search.trim().toLowerCase(), stage] as const, detail: (id: string) => ["leads", id] as const, activities: (id: string) => ["leads", id, "activities"] as const };
export function getLeadPage(search = "", stage: LeadStage | "all" = "all") { const query = new URLSearchParams({ limit: "20", offset: "0" }); if (search.trim()) query.set("search", search.trim()); if (stage !== "all") query.set("stage", stage); return apiClient.get<PaginatedData<Lead>>(`/leads?${query}`); }
export const getLead = (id: string) => apiClient.get<Lead>(`/leads/${encodeURIComponent(id)}`);
export const createLead = (input: Omit<Lead, "id" | "ownerId" | "stage" | "latestActivityAt" | "createdAt" | "updatedAt" | "builder" | "areaSqft" | "targetHandoverAt" | "notes">) => apiClient.post<Lead>("/leads", input);
export const updateLead = (id: string, input: Partial<Lead>) => apiClient.patch<Lead>(`/leads/${encodeURIComponent(id)}`, input);
export const getLeadActivities = (id: string) => apiClient.get<PaginatedData<LeadActivity>>(`/leads/${encodeURIComponent(id)}/activities?limit=50&offset=0`);
export const addLeadActivity = (id: string, input: { type: LeadActivityType; note: string; occurredAt: string }) => apiClient.post<LeadActivity>(`/leads/${encodeURIComponent(id)}/activities`, input);
export interface EstimateDraftInput { propertyType: string; rooms: Array<Record<string, unknown>>; scopes: string[]; lineItems: Array<{ catalogueId: string; roomName: string; specification: string; unit: string; rate: number; quantity: number; included: boolean }>; }
export type EstimateStatus = "draft" | "pending_manager_assignment" | "pending_designer_approval" | "designer_changes_requested" | "ready_for_client" | "sent_to_client" | "client_changes_requested" | "client_approved";
export interface EstimateDraft extends EstimateDraftInput { id: string; subtotal: number; gst: number; total: number; status: EstimateStatus; approvalRequired: boolean; assignedDesignerId?: string | null; projectId?: string | null; }
export interface SavedEstimate extends EstimateDraft {
  leadId: string;
  updatedAt: string;
  lead: Pick<Lead, "id" | "clientName" | "clientEmail" | "clientMobile" | "projectName" | "propertyType" | "location"> | null;
}
export const getLeadEstimate = (id: string) => apiClient.get<EstimateDraft | null>(`/leads/${encodeURIComponent(id)}/estimate`);
export const getSavedEstimates = () => apiClient.get<SavedEstimate[]>("/estimates");
export const saveLeadEstimate = (id: string, input: EstimateDraftInput) => apiClient.put<EstimateDraft>(`/leads/${encodeURIComponent(id)}/estimate`, input);
export const submitLeadEstimate = (id: string) => apiClient.post<EstimateDraft>(`/leads/${encodeURIComponent(id)}/estimate/submit`, {});
export const sendEstimateToClient = (estimateId: string) => apiClient.post<EstimateDraft>(`/estimates/${encodeURIComponent(estimateId)}/send-client`, {});
