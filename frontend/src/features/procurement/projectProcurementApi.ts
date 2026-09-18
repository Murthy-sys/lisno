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
  list: (projectId: string, q: string, offset: number, scope?: ProjectProcurementItemScope) => ["procurement", "project-items", projectId, { q, offset, ...scope }] as const,
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

export interface ProcurementParentSource {
  estimateId: string;
  estimateVersion: number;
  sourceLineItemKey: string;
}

export interface ProcurementParentOption extends ProcurementParentSource {
  label: string;
}

export type ProjectProcurementItemScope = ProcurementParentSource | { unassigned: true };

export function sameProcurementParent(source: ProcurementParentSource | null | undefined, expected: ProcurementParentSource) {
  return Boolean(source && source.estimateId === expected.estimateId && source.estimateVersion === expected.estimateVersion && source.sourceLineItemKey === expected.sourceLineItemKey);
}

const projectItemsPath = (projectId: string) => `/procurement/projects/${encodeURIComponent(projectId)}/items`;

function requireProject(item: ProjectProcurementItem, projectId: string) {
  if (item.projectId !== projectId) throw new Error("The procurement item does not belong to this project.");
  return item;
}

export async function getProjectProcurementItems(projectId: string, q: string, offset: number, signal?: AbortSignal, scope?: ProjectProcurementItemScope) {
  const params = new URLSearchParams({ q, limit: String(PROCUREMENT_ITEMS_PAGE_SIZE), offset: String(offset) });
  if (scope) for (const [key, value] of Object.entries(scope)) params.set(key, String(value));
  const page = await apiClient.get<ProjectProcurementItemsPage>(`${projectItemsPath(projectId)}?${params}`, { signal });
  page.items.forEach((item) => {
    requireProject(item, projectId);
    if (scope && "sourceLineItemKey" in scope && !sameProcurementParent(item.estimateSource, scope)) {
      throw new Error("The procurement item does not belong to this estimate item. Refresh the project before continuing.");
    }
  });
  return page;
}

export const getProcurementUomOptions = () => apiClient.get<ProcurementUomOption[]>("/procurement/uoms");

export async function getProjectProcurementItem(projectId: string, id: string, source?: ProcurementParentSource) {
  const item = requireProject(await apiClient.get<ProjectProcurementItem>(`${projectItemsPath(projectId)}/${encodeURIComponent(id)}`), projectId);
  if (source && !sameProcurementParent(item.estimateSource, source)) throw new Error("This item is linked to a different estimate item. Refresh the project to review its current assignment.");
  return item;
}

export async function createProjectProcurementItem(projectId: string, input: ProjectProcurementItemInput & ProcurementParentSource) {
  const item = requireProject(await apiClient.post<ProjectProcurementItem>(projectItemsPath(projectId), input), projectId);
  if (!sameProcurementParent(item.estimateSource, input)) throw new Error("The saved item does not match the selected estimate item. Refresh the project to verify the saved item.");
  return item;
}

export async function updateProjectProcurementItem(projectId: string, id: string, input: ProjectProcurementItemInput & Partial<ProcurementParentSource> & { expectedVersion: number }) {
  const item = requireProject(await apiClient.patch<ProjectProcurementItem>(`${projectItemsPath(projectId)}/${encodeURIComponent(id)}`, input), projectId);
  if (input.estimateId && input.estimateVersion && input.sourceLineItemKey && !sameProcurementParent(item.estimateSource, input as ProcurementParentSource)) throw new Error("The saved assignment changed. Refresh the project to review the current item.");
  return item;
}

export function getProcurementVendors(q: string, offset: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ q, limit: "20", offset: String(offset) });
  return apiClient.get<ProcurementVendorPage>(`/procurement/vendors?${params}`, { signal, showGlobalLoader: false });
}

export const createProcurementVendor = (name: string) => apiClient.post<ProcurementVendorOption>("/procurement/vendors", { name });
