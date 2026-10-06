import { apiClient, type PaginatedData } from "../../api/client";
import type {
  DesignPlanStatus,
  EstimateClientReviewSummary,
  EstimateClientFeedback,
  Lead,
  LeadActivity,
  LeadActivityType,
  LeadStage
} from "../../api/types";

export const leadKeys = {
  all: ["leads"] as const,
  page: (search: string, stage: LeadStage | "all") => ["leads", "page", search.trim().toLowerCase(), stage] as const,
  detail: (id: string) => ["leads", id] as const,
  estimate: (id: string) => ["leads", id, "estimate"] as const,
  activities: (id: string) => ["leads", id, "activities"] as const
};
export function getLeadPage(search = "", stage: LeadStage | "all" = "all") { const query = new URLSearchParams({ limit: "20", offset: "0" }); if (search.trim()) query.set("search", search.trim()); if (stage !== "all") query.set("stage", stage); return apiClient.get<PaginatedData<Lead>>(`/leads?${query}`); }
export const getLead = (id: string) => apiClient.get<Lead>(`/leads/${encodeURIComponent(id)}`);
export const createLead = (input: Omit<Lead, "id" | "projectId" | "ownerId" | "stage" | "latestActivityAt" | "createdAt" | "updatedAt" | "builder" | "areaSqft" | "targetHandoverAt" | "notes">) => apiClient.post<Lead>("/leads", input);
export const updateLead = (id: string, input: Partial<Lead>) => apiClient.patch<Lead>(`/leads/${encodeURIComponent(id)}`, input);
export const getLeadActivities = (id: string) => apiClient.get<PaginatedData<LeadActivity>>(`/leads/${encodeURIComponent(id)}/activities?limit=50&offset=0`);
export const addLeadActivity = (id: string, input: { type: LeadActivityType; note: string; occurredAt: string }) => apiClient.post<LeadActivity>(`/leads/${encodeURIComponent(id)}/activities`, input);
export interface LegacyEstimateLineInput {
  source?: "legacy";
  catalogueId: string;
  roomName: string;
  specification: string;
  unit: string;
  rate: number;
  quantity: number;
  included: boolean;
}

export type EstimateClassification = "standard" | "special";

export interface ConfiguredEstimateLineInput {
  source: "configuration";
  itemType?: "main_line" | "temporary";
  classification?: EstimateClassification;
  id?: string;
  catalogueId: string;
  roomId: string;
  roomName: string;
  mainBasketId: string;
  subBasketId: string | null;
  mainLineId: string;
  recommendationSourceMainLineIds?: string[];
  revisionId: string;
  itemVersion?: number;
  revisionVersion?: number;
  uomId: string;
  quantity: number;
  ratePaise: number | null;
  included: boolean;
}

export type EstimateLineInput = LegacyEstimateLineInput | ConfiguredEstimateLineInput;

export interface ConfiguredEstimateLine extends Omit<ConfiguredEstimateLineInput, "itemType"> {
  itemType?: "main_line" | "temporary";
  id: string;
  mainBasketName: string;
  subBasketName: string | null;
  mainLineName: string;
  uomName: string;
  uomCode: string;
  uomDecimalScale: number;
  sourceItemStatus?: "draft" | "active" | "inactive";
  sourceRevisionStatus?: "draft" | "active";
  sourceItemVersion?: number;
  sourceRevisionVersion?: number;
  configurationUomChanged?: boolean;
  configurationSourceUnavailable?: boolean;
  previousUomName?: string;
  unit: string;
  specification: null;
  rate: number | null;
  amount: number | null;
  amountPaise: number | null;
}

export interface LegacyEstimateLine extends LegacyEstimateLineInput {
  id?: string;
  amount?: number;
  amountPaise?: number;
}

export type EstimateLine = LegacyEstimateLine | ConfiguredEstimateLine;

export interface EstimateDraftInput {
  propertyType: string;
  rooms: Array<Record<string, unknown>>;
  scopes: string[];
  selectedMainBasketIds?: string[];
  selectedMainBasketClassifications?: Array<{ mainBasketId: string; classification: EstimateClassification }>;
  expectedVersion?: number;
  lineItems: EstimateLineInput[];
}
export type EstimateStatus = "draft" | "pending_manager_assignment" | "pending_designer_approval" | "designer_changes_requested" | "ready_for_client" | "sent_to_client" | "client_changes_requested" | "client_approved";
export interface EstimateDraft extends Omit<EstimateDraftInput, "lineItems"> {
  id: string;
  version?: number;
  lineItems: EstimateLine[];
  subtotal: number;
  gst: number;
  total: number;
  subtotalPaise?: number;
  gstPaise?: number;
  totalPaise?: number;
  status: EstimateStatus;
  approvalRequired: boolean;
  assignedDesignerId?: string | null;
  projectId?: string | null;
  clientReview?: EstimateClientReviewSummary | null;
  clientFeedback?: EstimateClientFeedback | null;
  designPlanStatus?: DesignPlanStatus | null;
  designPlanVersion?: number;
}
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
export const retryEstimateClientEmail = (
  estimateId: string,
  input: { roundId: string; version: number }
) => apiClient.post<EstimateClientReviewSummary>(
  `/estimates/${encodeURIComponent(estimateId)}/client-email/retry`,
  input
);
export const downloadEstimatePdf = (estimateId: string) =>
  apiClient.getBlob(`/estimates/${encodeURIComponent(estimateId)}/pdf`);
