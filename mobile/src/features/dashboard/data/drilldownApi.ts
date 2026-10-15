import { z } from "zod";
import { WORKER_ROLES } from "../../../contracts/authorization";
import type { JsonApiClient } from "../../../core/http/apiClient";
import { dashboardOverviewSchema, type DashboardPeriod } from "./contract";

export const REPORT_MODULES = ["projects", "estimation", "design", "procurement", "finance", "execution", "workforce", "risk"] as const;
export type ReportModule = (typeof REPORT_MODULES)[number];
export const PROJECT_STATES = ["planning", "active", "on_hold", "completed"] as const;
export const MODULE_STATES = ["planning", "active", "on_hold", "completed", "no_estimate", "draft_internal", "ready_for_client", "sent_to_client", "client_changes_requested", "client_approved", "pending_assignment", "assigned", "in_progress", "changes_requested", "approved", "not_started", "open", "over_budget", "within_budget", "unassigned", "overdue", "on_track", "gray", "green", "yellow", "red"] as const;
export const PROJECT_SORTS = ["risk_desc", "deadline_asc", "created_desc", "name_asc"] as const;
export const WORKFORCE_SORTS = ["workload_desc", "kpi_desc", "name_asc"] as const;
export const CAPACITY_STATES = ["within_capacity", "over_capacity", "unavailable"] as const;
const id = z.string().min(1); const count = z.number().int().nonnegative().safe(); const amount = z.number().int().safe(); const finite = z.number().finite(); const percent = finite.min(0).max(100);
const pagination = z.object({ limit: count.positive().max(50), offset: count, total: count, hasMore: z.boolean() });
const risk = dashboardOverviewSchema.shape.risk.shape.topProjects.element.shape.risk;
const project = z.object({
  projectId: id, projectName: z.string(), projectStatus: z.enum(PROJECT_STATES), location: z.string(), plannedStartAt: z.string(), plannedEndAt: z.string(), actualEndAt: z.string().nullable(),
  manager: z.object({ id, name: z.string() }).nullable(),
  estimate: z.object({ id, projectId: id.nullable(), resolvedProjectId: id, projectLinkSource: z.enum(["estimate", "lead", "estimate_and_lead"]), version: count, reviewRoundId: id.nullable(), status: z.string() }).nullable(),
  designPlan: z.object({ estimateId: id, version: count, status: z.string(), reviewRoundId: id.nullable() }).nullable(),
  procurement: z.object({ taskId: id, estimateId: id, designPlanVersion: count, status: z.enum(["open", "in_progress", "completed"]), progress: percent, approvedAmountPaise: amount.nullable(), postedSpendPaise: amount, variancePaise: amount.nullable(), sourceSectionIds: z.array(id), sourceLineItemKeys: z.array(id) }).nullable(),
  execution: z.object({ taskIds: z.array(id), assigneeWorkerIds: z.array(id), sourceSectionIds: z.array(id), sourceLineItemKeys: z.array(id), taskCount: count, overdueTaskCount: count, unassignedTaskCount: count, progress: dashboardOverviewSchema.shape.execution.shape.weightedProgress }),
  finance: z.object({ bucketId: id, version: count, estimateId: id, estimateVersion: count, estimateReviewRoundId: id.nullable(), designPlanVersion: count, approvedSubtotalPaise: amount, recordedCostPaise: amount, currentProfitPaise: amount, currentMarginBps: amount.nullable() }).nullable(), risk
});
const workforce = z.object({ workerId: id, workerName: z.string(), role: z.enum(WORKER_ROLES), assignmentState: z.enum(["assigned", "unassigned"]), activeTaskCount: count, completedInPeriod: count, plannedEffort: finite.nonnegative(), completedEffort: finite.nonnegative(), remainingEffort: finite.nonnegative(), remainingWorkloadPercentage: finite.nonnegative(), capacityEffort: finite.nonnegative().nullable(), capacityAvailable: z.boolean(), capacityState: z.enum(CAPACITY_STATES), kpi: z.object({ availability: z.enum(["available", "unavailable"]), scoreBps: amount.min(0).max(10000).nullable(), eligibleComponentCount: count }) });
const pageBase = { observedAt: z.string(), period: dashboardOverviewSchema.shape.period, pagination, dataQuality: dashboardOverviewSchema.shape.dataQuality };
export const projectsPageSchema = z.object({ ...pageBase, items: z.array(project) });
export const workforcePageSchema = z.object({ ...pageBase, items: z.array(workforce) });
export type DashboardProjectRow = z.infer<typeof project>;
export type DashboardWorkforceRow = z.infer<typeof workforce>;
export type ProjectsPage = z.infer<typeof projectsPageSchema>;
export type WorkforcePage = z.infer<typeof workforcePageSchema>;
export interface ProjectFilters { search: string; projectStatus: string; moduleStatus: string; riskLevel: string; riskFactor: string; sort: string; offset: number }
export interface WorkforceFilters { search: string; role: string; assignmentState: string; capacityState: string; kpiAvailability: string; sort: string; offset: number }
export const projectFilters = (): ProjectFilters => ({ search: "", projectStatus: "", moduleStatus: "", riskLevel: "", riskFactor: "", sort: "risk_desc", offset: 0 });
export const workforceFilters = (): WorkforceFilters => ({ search: "", role: "", assignmentState: "", capacityState: "", kpiAvailability: "", sort: "workload_desc", offset: 0 });
function query(period: DashboardPeriod, filters: ProjectFilters | WorkforceFilters) {
  const params = new URLSearchParams({ periodDays: String(period), limit: "20" });
  for (const [key, value] of Object.entries(filters)) if (value !== "") params.set(key, String(value));
  return params;
}
function checkPage<T extends { period: { days: number }; pagination: { offset: number; limit: number }; items: unknown[] }>(page: T, period: DashboardPeriod, offset: number) {
  if (page.period.days !== period || page.pagination.offset !== offset || page.pagination.limit !== 20 || page.items.length > 20) throw new Error("The dashboard reporting window or page changed."); return page;
}
export function createDrilldownApi(http: Pick<JsonApiClient["authenticated"], "get">) {
  return {
    async projects(period: DashboardPeriod, module: Exclude<ReportModule, "workforce">, filters: ProjectFilters, signal?: AbortSignal) {
      const params = query(period, filters); params.set("module", module);
      const page = checkPage(projectsPageSchema.parse(await http.get<unknown>(`/admin/dashboard/projects?${params}`, { signal })), period, filters.offset);
      if (new Set(page.items.map(row => row.projectId)).size !== page.items.length || page.items.some(row => row.estimate && row.estimate.resolvedProjectId !== row.projectId || row.finance && row.finance.currentProfitPaise !== row.finance.approvedSubtotalPaise - row.finance.recordedCostPaise)) throw new Error("Project source or financial reconciliation could not be verified.");
      return page;
    },
    async workforce(period: DashboardPeriod, filters: WorkforceFilters, signal?: AbortSignal) {
      const page = checkPage(workforcePageSchema.parse(await http.get<unknown>(`/admin/dashboard/workforce?${query(period, filters)}`, { signal })), period, filters.offset);
      if (new Set(page.items.map(row => row.workerId)).size !== page.items.length) throw new Error("Worker identities could not be verified."); return page;
    }
  };
}
