import { apiClient } from "../../api/client";
import type {
  CreateFloorInput,
  CreateStageInput,
  CreateTaskInput,
  DesignStage,
  DesignExtraction,
  DesignSection,
  CropRect,
  DesignVersion,
  ExtractionStatus,
  Floor,
  KpiRead,
  KpiTaskRead,
  PageData,
  Project,
  TaskRecord,
  TaskEvent
} from "../../api/types";

const PROJECT_PAGE_SIZE = 100;
const KPI_PAGE_SIZE = 20;
export interface ReportingPeriod {
  from: string;
  to: string;
}

export function reviewPeriod(monthOffset = 0, now = new Date()): ReportingPeriod {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset + 1, 1) - 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

export const designerKeys = {
  all: ["designer"] as const,
  projects: () => [...designerKeys.all, "projects"] as const,
  project: (projectId: string) =>
    [...designerKeys.projects(), projectId] as const,
  kpi: (userId: string) => [...designerKeys.all, "kpi", userId] as const,
  kpiTasks: (userId: string) =>
    [...designerKeys.all, "kpi-tasks", userId] as const,
  taskEvents: (taskId: string) =>
    [...designerKeys.all, "tasks", taskId, "events", { sort: "desc", limit: 1 }] as const,
  designVersions: (projectId: string) =>
    [...designerKeys.project(projectId), "design-versions"] as const,
  designExtraction: (versionId: string) =>
    [...designerKeys.all, "design-versions", versionId, "extraction"] as const,
  designSections: (versionId: string) =>
    [...designerKeys.all, "design-versions", versionId, "sections"] as const
};

export function getDesignVersions(projectId: string): Promise<DesignVersion[]> {
  return getAllPages<DesignVersion>((offset) =>
    apiClient.get<PageData<DesignVersion>>(
      `/projects/${encodeURIComponent(projectId)}/design-versions?limit=${PROJECT_PAGE_SIZE}&offset=${offset}`
    )
  );
}

export const getDesignSections = (versionId: string) =>
  apiClient.get<DesignExtraction>(
    `/design-versions/${encodeURIComponent(versionId)}/sections`
  );

export const addDesignSection = (
  versionId: string,
  input: { sourcePageId: string; label: string; crop: CropRect }
) => apiClient.post<DesignSection>(
  `/design-versions/${encodeURIComponent(versionId)}/sections`,
  input
);

export const editDesignSection = (
  sectionId: string,
  input: { version: number; label?: string; crop?: CropRect }
) => apiClient.patch<DesignSection>(
  `/design-sections/${encodeURIComponent(sectionId)}`,
  input
);

export const removeDesignSection = (sectionId: string, version: number) =>
  apiClient.delete<{ id: string; active: false }>(
    `/design-sections/${encodeURIComponent(sectionId)}`,
    { version }
  );

export const retryDesignExtraction = (versionId: string) =>
  apiClient.post<{ extractionStatus: ExtractionStatus }>(
    `/design-versions/${encodeURIComponent(versionId)}/retry-extraction`
  );

export const submitDesignSections = (versionId: string) =>
  apiClient.post<{ extractionStatus: ExtractionStatus; submittedCount: number }>(
    `/design-versions/${encodeURIComponent(versionId)}/submit-sections`
  );

export async function getAllProjects(): Promise<Project[]> {
  return getAllPages<Project>((offset) =>
    apiClient.get<PageData<Project>>(
      `/projects?limit=${PROJECT_PAGE_SIZE}&offset=${offset}`
    )
  );
}

function kpiQuery(period: ReportingPeriod): string {
  const query = new URLSearchParams({
    from: period.from,
    to: period.to,
    limit: String(KPI_PAGE_SIZE),
    offset: "0"
  });
  return query.toString();
}

export function getKpi(userId: string, period = reviewPeriod()): Promise<KpiRead> {
  return apiClient.get<KpiRead>(
    `/kpis/users/${encodeURIComponent(userId)}?${kpiQuery(period)}`
  );
}

export function getKpiTaskPage(
  userId: string,
  offset = 0,
  period = reviewPeriod()
): Promise<PageData<KpiTaskRead>> {
  const query = new URLSearchParams({
    from: period.from,
    to: period.to,
    limit: String(KPI_PAGE_SIZE),
    offset: String(offset)
  });
  return apiClient.get(
    `/kpis/users/${encodeURIComponent(userId)}/tasks?${query.toString()}`
  );
}

export function getLatestTaskEvent(taskId: string): Promise<PageData<TaskEvent>> {
  return apiClient.get<PageData<TaskEvent>>(
    `/tasks/${encodeURIComponent(taskId)}/events?sort=desc&limit=1&offset=0`
  );
}

export function createFloor(
  projectId: string,
  input: CreateFloorInput
): Promise<Floor> {
  return apiClient.post(
    `/projects/${encodeURIComponent(projectId)}/floors`,
    input
  );
}

export function createStage(
  floorId: string,
  input: CreateStageInput
): Promise<DesignStage> {
  return apiClient.post(
    `/floors/${encodeURIComponent(floorId)}/stages`,
    input
  );
}

export function createTask(
  stageId: string,
  input: CreateTaskInput
): Promise<TaskRecord> {
  return apiClient.post(
    `/stages/${encodeURIComponent(stageId)}/tasks`,
    input
  );
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
