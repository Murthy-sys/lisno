import { apiClient } from "../../api/client";
import type {
  AuditEvent,
  DesignerSummary,
  Evaluation,
  OrganizationManager,
  PageData
} from "../../api/types";

const PAGE_SIZE = 100;

export const managementKeys = {
  team: ["management", "team"] as const,
  designer: (designerId: string) => ["management", "designer", designerId] as const,
  evaluations: (subjectId: string) => ["management", "evaluations", subjectId] as const,
  audit: (designerId: string) => ["management", "audit", designerId] as const,
  organization: ["management", "organization"] as const
};

export const getManagerTeam = () =>
  getAllItems((offset) =>
    apiClient.get<PageData<DesignerSummary>>(
      `/organization/team?limit=${PAGE_SIZE}&offset=${offset}`
    )
  );
export const getDesignerSummary = (id: string) => apiClient.get<DesignerSummary>(`/designers/${encodeURIComponent(id)}/summary`);
export const getEvaluations = (id: string) =>
  getAllPageData((offset) =>
    apiClient.get<PageData<Evaluation>>(
      `/evaluations/${encodeURIComponent(id)}?limit=${PAGE_SIZE}&offset=${offset}`
    )
  );
export const getDesignerAudit = (id: string) =>
  getAllPageData((offset) =>
    apiClient.get<PageData<AuditEvent>>(
      `/designers/${encodeURIComponent(id)}/audit?limit=${PAGE_SIZE}&offset=${offset}&sort=desc`
    )
  );
export const getOrganization = () =>
  getAllItems((offset) =>
    apiClient.get<PageData<OrganizationManager>>(
      `/organization/tree?limit=${PAGE_SIZE}&offset=${offset}`
    )
  );

async function getAllItems<T>(
  pageAt: (offset: number) => Promise<PageData<T>>
): Promise<T[]> {
  return (await getAllPageData(pageAt)).items;
}

async function getAllPageData<T>(
  pageAt: (offset: number) => Promise<PageData<T>>
): Promise<PageData<T>> {
  const items: T[] = [];
  let offset = 0;
  let last: PageData<T> | undefined;
  do {
    last = await pageAt(offset);
    items.push(...last.items);
    offset = last.pagination.offset + last.pagination.limit;
  } while (last.pagination.hasMore);
  return {
    items,
    pagination: {
      limit: PAGE_SIZE,
      offset: 0,
      total: last?.pagination.total ?? 0,
      hasMore: false
    }
  };
}
