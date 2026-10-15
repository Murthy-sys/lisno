import type { JsonApiClient } from "../../core/http/apiClient";
import { createIdempotencyKey } from "../finance/money";
import type { ProcurementVendorReference } from "./procurementTypes";

export interface VendorSuggestionProject {
  projectId: string;
  projectName: string;
  estimateId: string;
  estimateVersion: number;
  designPlanVersion: number;
}

export interface VendorSuggestion {
  id: string;
  projectId: string;
  estimateId: string;
  estimateVersion: number;
  estimateReviewRoundId: string | null;
  designPlanVersion: number;
  vendor: ProcurementVendorReference;
  note: string;
  status: "suggested" | "withdrawn";
  version: number;
  suggestedBy: { id: string; name: string };
  updatedBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  kpi: { status: "not_available" | "not_rated" | "rated"; score: number | null };
}

export interface VendorSuggestionPage {
  project: VendorSuggestionProject;
  items: VendorSuggestion[];
  total: number;
  limit: number;
  offset: number;
  performance: { status: "not_available"; recommendations: [] };
}

export interface SuggestionProjectsPage { items: VendorSuggestionProject[]; total: number; limit: number; offset: number }

export interface CreateVendorSuggestionInput {
  estimateId: string;
  estimateVersion: number;
  designPlanVersion: number;
  vendorId: string;
  note: string;
  idempotencyKey: string;
}

/** Native transport adapter; endpoint and version contracts match the web workflow. */
export function createVendorSuggestionsApi(apiClient: JsonApiClient["authenticated"]) {
const VENDOR_SUGGESTION_PAGE_SIZE = 20;

const path = (projectId: string) => `/procurement/projects/${encodeURIComponent(projectId)}/vendor-suggestions`;

function sameSuggestionSource(left: Pick<VendorSuggestionProject, "estimateId" | "estimateVersion" | "designPlanVersion">, right: Pick<VendorSuggestionProject, "estimateId" | "estimateVersion" | "designPlanVersion">) {
  return left.estimateId === right.estimateId && left.estimateVersion === right.estimateVersion && left.designPlanVersion === right.designPlanVersion;
}

function getSuggestionProjects(q: string, offset: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ q, offset: String(offset), limit: String(VENDOR_SUGGESTION_PAGE_SIZE) });
  return apiClient.get<SuggestionProjectsPage>(`/procurement/suggestion-projects?${params}`, { signal });
}

async function getVendorSuggestions(projectId: string, offset = 0, signal?: AbortSignal) {
  const params = new URLSearchParams({ offset: String(offset), limit: String(VENDOR_SUGGESTION_PAGE_SIZE) });
  const page = await apiClient.get<VendorSuggestionPage>(`${path(projectId)}?${params}`, { signal });
  if (page.project.projectId !== projectId || page.items.some((item) => item.projectId !== projectId || !sameSuggestionSource(item, page.project))) {
    throw new Error("Vendor suggestions do not match this project and approved design. Refresh before continuing.");
  }
  return page;
}

async function createVendorSuggestion(projectId: string, input: CreateVendorSuggestionInput) {
  const saved = await apiClient.post<VendorSuggestion>(path(projectId), input);
  if (saved.projectId !== projectId || saved.vendor.id !== input.vendorId || !sameSuggestionSource(saved, input)) throw new Error("The saved suggestion does not match the selected project and vendor. Refresh to review it.");
  return saved;
}

async function updateVendorSuggestion(projectId: string, current: VendorSuggestion, input: { expectedVersion: number; note: string; status: VendorSuggestion["status"] }) {
  const saved = await apiClient.patch<VendorSuggestion>(`${path(projectId)}/${encodeURIComponent(current.id)}`, input);
  if (saved.id !== current.id || saved.projectId !== projectId || saved.vendor.id !== current.vendor.id || !sameSuggestionSource(saved, current)) throw new Error("The saved suggestion identity changed. Refresh to review it.");
  return saved;
}
return {VENDOR_SUGGESTION_PAGE_SIZE, sameSuggestionSource, getSuggestionProjects, getVendorSuggestions, createVendorSuggestion, updateVendorSuggestion};
}
