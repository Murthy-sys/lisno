import { apiClient } from "../../api/client";
import type {
  KpiRead,
  KpiTaskRead,
  PageData,
  Project
} from "../../api/types";

const PAGE_SIZE = 100;
const KPI_FROM = "2000-01-01T00:00:00.000Z";
const KPI_TO = "2100-01-01T00:00:00.000Z";

export const designerKeys = {
  all: ["designer"] as const,
  projects: () => [...designerKeys.all, "projects"] as const,
  project: (projectId: string) =>
    [...designerKeys.projects(), projectId] as const,
  kpi: (userId: string) => [...designerKeys.all, "kpi", userId] as const,
  designVersions: (projectId: string) =>
    [...designerKeys.project(projectId), "design-versions"] as const
};

export async function getAllProjects(): Promise<Project[]> {
  return getAllPages<Project>((offset) =>
    apiClient.get<PageData<Project>>(
      `/projects?limit=${PAGE_SIZE}&offset=${offset}`
    )
  );
}

function kpiPath(userId: string, offset: number): string {
  const query = new URLSearchParams({
    from: KPI_FROM,
    to: KPI_TO,
    limit: String(PAGE_SIZE),
    offset: String(offset)
  });
  return `/kpis/users/${encodeURIComponent(userId)}?${query.toString()}`;
}

export async function getCompleteKpi(userId: string): Promise<KpiRead> {
  const first = await apiClient.get<KpiRead>(kpiPath(userId, 0));
  if (!first.tasks.pagination.hasMore) return first;

  const remaining = await getRemainingPages<KpiTaskRead>(
    first.tasks.pagination.offset + first.tasks.pagination.limit,
    (offset) =>
      apiClient
        .get<KpiRead>(kpiPath(userId, offset))
        .then((response) => response.tasks)
  );
  return {
    ...first,
    tasks: {
      items: [...first.tasks.items, ...remaining],
      pagination: {
        ...first.tasks.pagination,
        total: first.tasks.pagination.total,
        hasMore: false
      }
    }
  };
}

async function getAllPages<T>(
  pageAt: (offset: number) => Promise<PageData<T>>
): Promise<T[]> {
  const first = await pageAt(0);
  if (!first.pagination.hasMore) return first.items;
  return [
    ...first.items,
    ...(await getRemainingPages(
      first.pagination.offset + first.pagination.limit,
      pageAt
    ))
  ];
}

async function getRemainingPages<T>(
  startingOffset: number,
  pageAt: (offset: number) => Promise<PageData<T>>
): Promise<T[]> {
  const items: T[] = [];
  let offset = startingOffset;
  let hasMore = true;
  while (hasMore) {
    const page = await pageAt(offset);
    items.push(...page.items);
    hasMore = page.pagination.hasMore;
    offset = page.pagination.offset + page.pagination.limit;
  }
  return items;
}
