import { apiClient } from "../../api/client";
import type {
  ProjectProcurementItem,
  ProjectProcurementItemsPage,
  ProcurementUomOption,
  ProcurementVendorOption,
  ProcurementVendorPage
} from "../../api/types";

export const projectProcurementKeys = {
  lists: (projectId: string) => ["procurement", "project-items", projectId] as const,
  list: (projectId: string, q: string, offset: number) => ["procurement", "project-items", projectId, { q, offset }] as const,
  uoms: ["procurement", "uoms"] as const,
  vendors: ["procurement", "vendors"] as const,
  vendorSearch: (q: string) => ["procurement", "vendors", q] as const
};

export const PROCUREMENT_ITEMS_PAGE_SIZE = 20;
export const MAX_PROCUREMENT_ITEM_PRICE_PAISE = 9_000_000_000_000;

export interface ProjectProcurementItemInput {
  itemName: string;
  brand: string;
  uomId: string;
  vendorId: string | null;
  pricePaise: number;
}

const projectItemsPath = (projectId: string) => `/procurement/projects/${encodeURIComponent(projectId)}/items`;

function requireProject(item: ProjectProcurementItem, projectId: string) {
  if (item.projectId !== projectId) throw new Error("The procurement item does not belong to this project.");
  return item;
}

export async function getProjectProcurementItems(projectId: string, q: string, offset: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ q, limit: String(PROCUREMENT_ITEMS_PAGE_SIZE), offset: String(offset) });
  const page = await apiClient.get<ProjectProcurementItemsPage>(`${projectItemsPath(projectId)}?${params}`, { signal });
  page.items.forEach((item) => requireProject(item, projectId));
  return page;
}

export const getProcurementUomOptions = () => apiClient.get<ProcurementUomOption[]>("/procurement/uoms");

export async function getProjectProcurementItem(projectId: string, id: string) {
  return requireProject(await apiClient.get<ProjectProcurementItem>(`${projectItemsPath(projectId)}/${encodeURIComponent(id)}`), projectId);
}

export async function createProjectProcurementItem(projectId: string, input: ProjectProcurementItemInput) {
  return requireProject(await apiClient.post<ProjectProcurementItem>(projectItemsPath(projectId), input), projectId);
}

export async function updateProjectProcurementItem(projectId: string, id: string, input: ProjectProcurementItemInput & { expectedVersion: number }) {
  return requireProject(await apiClient.patch<ProjectProcurementItem>(`${projectItemsPath(projectId)}/${encodeURIComponent(id)}`, input), projectId);
}

export function getProcurementVendors(q: string, offset: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ q, limit: "20", offset: String(offset) });
  return apiClient.get<ProcurementVendorPage>(`/procurement/vendors?${params}`, { signal, showGlobalLoader: false });
}

export const createProcurementVendor = (name: string) => apiClient.post<ProcurementVendorOption>("/procurement/vendors", { name });
