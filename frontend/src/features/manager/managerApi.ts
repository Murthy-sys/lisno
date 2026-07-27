import { apiClient } from "../../api/client";
import type {
  AuditEvent,
  DesignVersion,
  DesignerSummary,
  Evaluation,
  OrganizationManager,
  OrganizationManagerPage,
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
export const getOrganization = async () => {
  const managers = await getAllItems((offset) =>
    apiClient.get<PageData<OrganizationManagerPage>>(
      `/organization/tree?limit=${PAGE_SIZE}&offset=${offset}`
    )
  );
  return Promise.all(
    managers.map(completeManagerDesigners)
  );
};

export const getManagementProjectVersions = (projectId: string) =>
  getAllPageData((offset) =>
    apiClient.get<PageData<DesignVersion>>(
      `/projects/${encodeURIComponent(projectId)}/design-versions?limit=${PAGE_SIZE}&offset=${offset}`
    )
  );

export const getManagementProjectActivity = (projectId: string) =>
  getAllPageData((offset) =>
    apiClient.get<PageData<AuditEvent>>(
      `/projects/${encodeURIComponent(projectId)}/activity?limit=${PAGE_SIZE}&offset=${offset}`
    )
  );

async function completeManagerDesigners(
  manager: OrganizationManagerPage
): Promise<OrganizationManager> {
  const designers = [...manager.designers.items];
  let pagination = manager.designers.pagination;
  while (pagination.hasMore) {
    const page = await apiClient.get<PageData<DesignerSummary>>(
      `/organization/managers/${encodeURIComponent(manager.id)}/designers?limit=${PAGE_SIZE}&offset=${pagination.offset + pagination.limit}`
    );
    designers.push(
      ...page.items.map(({ user, ...summary }) => ({ ...user, summary }))
    );
    pagination = page.pagination;
  }
  return { ...manager, designers };
}

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
