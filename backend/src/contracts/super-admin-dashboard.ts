import type { ProjectStatus } from "../repositories/types.js";
import type { WorkerRole } from "../domain/roles.js";

export const SUPER_ADMIN_DASHBOARD_PERIOD_DAYS = [7, 30, 90] as const;
export type SuperAdminDashboardPeriodDays =
  (typeof SUPER_ADMIN_DASHBOARD_PERIOD_DAYS)[number];

export const DASHBOARD_RISK_LEVELS = ["gray", "green", "yellow", "red"] as const;
export type DashboardRiskLevel = (typeof DASHBOARD_RISK_LEVELS)[number];

export const DASHBOARD_RISK_FACTORS = [
  "schedule",
  "finance",
  "staffing",
  "workflow"
] as const;
export type DashboardRiskFactorKind = (typeof DASHBOARD_RISK_FACTORS)[number];

export const DASHBOARD_RISK_REASON_CODES = [
  "project_deadline_overdue",
  "task_overdue",
  "task_forecast_late",
  "task_due_soon",
  "task_blocked",
  "task_behind_schedule",
  "task_low_schedule_buffer",
  "cost_budget_exceeded",
  "cost_budget_headroom_low",
  "overdue_execution_unassigned",
  "active_execution_unassigned",
  "inactive_execution_assignee",
  "lead_next_action_overdue",
  "project_on_hold",
  "estimate_changes_requested",
  "design_changes_requested",
  "delivery_failed",
  "delivery_disabled"
] as const;
export type DashboardRiskReasonCode =
  (typeof DASHBOARD_RISK_REASON_CODES)[number];

export const DASHBOARD_DATA_QUALITY_ISSUE_CODES = [
  "project_identity_mismatch",
  "estimate_project_lineage_mismatch",
  "finance_project_lineage_mismatch",
  "task_project_lineage_mismatch",
  "assignee_identity_mismatch",
  "module_aggregate_unavailable"
] as const;
export type DashboardDataQualityIssueCode =
  (typeof DASHBOARD_DATA_QUALITY_ISSUE_CODES)[number];

export const DASHBOARD_PROJECT_MODULES = [
  "projects",
  "estimation",
  "design",
  "procurement",
  "finance",
  "execution",
  "risk"
] as const;
export type DashboardProjectModule = (typeof DASHBOARD_PROJECT_MODULES)[number];

export const DASHBOARD_PROJECT_SORTS = [
  "risk_desc",
  "deadline_asc",
  "created_desc",
  "name_asc"
] as const;
export type DashboardProjectSort = (typeof DASHBOARD_PROJECT_SORTS)[number];

export const DASHBOARD_PROJECT_MODULE_STATUSES = [
  "planning", "active", "on_hold", "completed",
  "no_estimate", "draft_internal", "ready_for_client", "sent_to_client",
  "client_changes_requested", "client_approved",
  "pending_assignment", "assigned", "in_progress", "changes_requested", "approved",
  "not_started", "open", "over_budget", "within_budget",
  "unassigned", "overdue", "on_track",
  "gray", "green", "yellow", "red"
] as const;
export type DashboardProjectModuleStatus =
  (typeof DASHBOARD_PROJECT_MODULE_STATUSES)[number];

export const DASHBOARD_WORKFORCE_ASSIGNMENT_STATES = [
  "assigned",
  "unassigned"
] as const;
export type DashboardWorkforceAssignmentState =
  (typeof DASHBOARD_WORKFORCE_ASSIGNMENT_STATES)[number];

export const DASHBOARD_WORKFORCE_CAPACITY_STATES = [
  "within_capacity",
  "over_capacity",
  "unavailable"
] as const;
export type DashboardWorkforceCapacityState =
  (typeof DASHBOARD_WORKFORCE_CAPACITY_STATES)[number];

export const DASHBOARD_KPI_AVAILABILITY = ["available", "unavailable"] as const;
export type DashboardKpiAvailability =
  (typeof DASHBOARD_KPI_AVAILABILITY)[number];

export const DASHBOARD_WORKFORCE_SORTS = [
  "workload_desc",
  "kpi_desc",
  "name_asc"
] as const;
export type DashboardWorkforceSort = (typeof DASHBOARD_WORKFORCE_SORTS)[number];

export interface DashboardRatio {
  numerator: number;
  denominator: number;
  rateBps: number | null;
}

export interface DashboardPeriod {
  days: SuperAdminDashboardPeriodDays;
  startAt: string;
  endAt: string;
}

export interface DashboardRiskSource {
  entityType: "project" | "task" | "estimate" | "design_plan" | "lead" | "delivery";
  entityId: string;
}

export interface DashboardRiskFactor {
  kind: DashboardRiskFactorKind;
  level: Exclude<DashboardRiskLevel, "gray">;
  reasonCode: DashboardRiskReasonCode;
  reason: string;
  source: DashboardRiskSource;
  observedValue: number | string | boolean | null;
  threshold: number | string | boolean | null;
  drillDownTarget: string;
}

export interface DashboardProjectRisk {
  level: DashboardRiskLevel;
  factors: DashboardRiskFactor[];
}

export interface DashboardDataQualityIssue {
  code: DashboardDataQualityIssueCode;
  metricKey: string;
  message: string;
  entityType: "project" | "estimate" | "finance_bucket" | "task" | "user" | null;
  entityId: string | null;
}

export interface DashboardDataQuality {
  status: "complete" | "partial";
  totalIssueCount: number;
  issues: DashboardDataQualityIssue[];
  unavailableMetricKeys: string[];
}

export interface DashboardModuleCoverage {
  eligibleProjects: number;
  trackedProjects: number;
  unavailableProjects: number;
}

export interface DashboardProjectsMetrics {
  total: number;
  createdInPeriod: number;
  planning: number;
  active: number;
  onHold: number;
  completed: number;
  liveOverdue: number;
  completedLate: number;
  completionRate: DashboardRatio;
  atRisk: number;
}

export interface DashboardEstimationMetrics extends DashboardModuleCoverage {
  noEstimate: number;
  draftInternal: number;
  readyToSend: number;
  awaitingClient: number;
  changesRequested: number;
  clientApproved: number;
  approvedSubtotalPaise: number;
  approvedGstPaise: number;
  approvedContractTotalPaise: number;
  medianWaitingAgeDays: number | null;
  oldestWaitingAgeDays: number | null;
}

export interface DashboardDesignMetrics extends DashboardModuleCoverage {
  pendingAssignment: number;
  assigned: number;
  inProgress: number;
  readyForClient: number;
  changesRequested: number;
  approved: number;
  approvalRate: DashboardRatio;
  oldestPendingReviewAgeDays: number | null;
  failedDeliveryCount: number;
  disabledDeliveryCount: number;
}

export interface DashboardProcurementMetrics extends DashboardModuleCoverage {
  notStarted: number;
  open: number;
  inProgress: number;
  completed: number;
  plannedAmountPaise: number | null;
  postedSpendPaise: number;
  variancePaise: number | null;
  averageProgress: DashboardRatio;
}

export interface DashboardFinanceMetrics {
  projectCount: number;
  approvedContractTotalPaise: number;
  approvedGstPaise: number;
  approvedSubtotalPaise: number;
  targetProfitPaise: number;
  costBudgetPaise: number;
  procurementCostPaise: number;
  employeePaymentPaise: number;
  otherExpensePaise: number;
  directSpendPaise: number;
  overheadPaise: number;
  recordedCostPaise: number;
  remainingBudgetPaise: number;
  currentProfitPaise: number;
  currentMarginBps: number | null;
  overBudgetProjectCount: number;
  overdueProjectCount: number;
  lateCompletedProjectCount: number;
  overdueTaskCount: number;
}

export interface DashboardWeightedProgress extends DashboardRatio {
  fallbackTaskCount: number;
}

export interface DashboardExecutionMetrics {
  total: number;
  open: number;
  inProgress: number;
  completed: number;
  completedInPeriod: number;
  overdue: number;
  unassigned: number;
  overdueUnassigned: number;
  weightedProgress: DashboardWeightedProgress;
  projectDistribution: Array<{ projectId: string; taskCount: number }>;
  roleDistribution: Array<{ role: string; taskCount: number }>;
}

export interface DashboardWorkforceMetrics {
  activeWorkers: number;
  assignedWorkers: number;
  unassignedWorkers: number;
  activeAssignedTaskCount: number;
  activeUnassignedTaskCount: number;
  completedInPeriodTaskCount: number;
  overCapacityWorkers: number | null;
  capacityAvailable: boolean;
  inactiveAssigneeTaskCount: number;
  kpiEligibleWorkers: number;
  kpiUnavailableWorkers: number;
  averageKpi: DashboardRatio;
  roleDistribution: Array<{ role: WorkerRole; workerCount: number }>;
}

export interface DashboardGovernanceMetrics {
  pendingInvitations: number;
  expiredInvitations: number;
  failedInvitationDeliveries: number;
  pendingAccessRequests: number;
  pendingClientResponses: number;
  pendingDesignResponses: number;
  failedClientDeliveries: number;
  disabledClientDeliveries: number;
  failedDesignDeliveries: number;
  disabledDesignDeliveries: number;
}

export interface DashboardFactorDistributionItem {
  kind: DashboardRiskFactorKind;
  level: Exclude<DashboardRiskLevel, "gray">;
  reasonCode: DashboardRiskReasonCode;
  occurrenceCount: number;
  projectCount: number;
}

export interface DashboardTopRiskProject {
  projectId: string;
  projectName: string;
  projectStatus: ProjectStatus;
  risk: DashboardProjectRisk;
}

export interface DashboardRiskMetrics {
  projectDistribution: Record<DashboardRiskLevel, number>;
  factorDistribution: DashboardFactorDistributionItem[];
  topProjects: DashboardTopRiskProject[];
}

export interface DashboardTrendBucket {
  date: string;
  projectsCreated: number;
  projectsCompleted: number;
  estimatesApproved: number;
  designPlansApproved: number;
  workflowTasksCompleted: number;
  ledgerExpensesPostedPaise: number;
}

export interface SuperAdminDashboardOverview {
  observedAt: string;
  period: DashboardPeriod;
  projects: DashboardProjectsMetrics;
  estimation: DashboardEstimationMetrics;
  design: DashboardDesignMetrics;
  procurement: DashboardProcurementMetrics;
  finance: DashboardFinanceMetrics;
  execution: DashboardExecutionMetrics;
  workforce: DashboardWorkforceMetrics;
  governance: DashboardGovernanceMetrics;
  risk: DashboardRiskMetrics;
  trends: DashboardTrendBucket[];
  dataQuality: DashboardDataQuality;
}

export interface DashboardProjectFilters {
  module?: DashboardProjectModule;
  projectStatus?: ProjectStatus;
  moduleStatus?: DashboardProjectModuleStatus;
  riskLevel?: DashboardRiskLevel;
  riskFactor?: DashboardRiskFactorKind;
  search?: string;
  sort: DashboardProjectSort;
  limit: number;
  offset: number;
}

export interface DashboardProjectRow {
  projectId: string;
  projectName: string;
  projectStatus: ProjectStatus;
  location: string;
  plannedStartAt: string;
  plannedEndAt: string;
  actualEndAt: string | null;
  manager: { id: string; name: string } | null;
  estimate: {
    id: string;
    projectId: string | null;
    resolvedProjectId: string;
    projectLinkSource: "estimate" | "lead" | "estimate_and_lead";
    version: number;
    reviewRoundId: string | null;
    status: string;
  } | null;
  designPlan: {
    estimateId: string;
    version: number;
    status: string;
    reviewRoundId: string | null;
  } | null;
  procurement: {
    taskId: string;
    estimateId: string;
    designPlanVersion: number;
    status: "open" | "in_progress" | "completed";
    progress: number;
    approvedAmountPaise: number | null;
    postedSpendPaise: number;
    variancePaise: number | null;
    sourceSectionIds: string[];
    sourceLineItemKeys: string[];
  } | null;
  execution: {
    taskIds: string[];
    assigneeWorkerIds: string[];
    sourceSectionIds: string[];
    sourceLineItemKeys: string[];
    taskCount: number;
    overdueTaskCount: number;
    unassignedTaskCount: number;
    progress: DashboardWeightedProgress;
  };
  finance: {
    bucketId: string;
    version: number;
    estimateId: string;
    estimateVersion: number;
    estimateReviewRoundId: string | null;
    designPlanVersion: number;
    approvedSubtotalPaise: number;
    recordedCostPaise: number;
    currentProfitPaise: number;
    currentMarginBps: number | null;
  } | null;
  risk: DashboardProjectRisk;
}

export interface DashboardWorkforceFilters {
  role?: WorkerRole;
  assignmentState?: DashboardWorkforceAssignmentState;
  capacityState?: DashboardWorkforceCapacityState;
  kpiAvailability?: DashboardKpiAvailability;
  search?: string;
  sort: DashboardWorkforceSort;
  limit: number;
  offset: number;
}

export interface DashboardWorkforceRow {
  workerId: string;
  workerName: string;
  role: WorkerRole;
  assignmentState: DashboardWorkforceAssignmentState;
  activeTaskCount: number;
  completedInPeriod: number;
  plannedEffort: number;
  completedEffort: number;
  remainingEffort: number;
  remainingWorkloadPercentage: number;
  capacityEffort: number | null;
  capacityAvailable: boolean;
  capacityState: DashboardWorkforceCapacityState;
  kpi: {
    availability: DashboardKpiAvailability;
    scoreBps: number | null;
    eligibleComponentCount: number;
  };
}

export interface DashboardPage<T> {
  observedAt: string;
  period: DashboardPeriod;
  items: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  dataQuality: DashboardDataQuality;
}

export type SuperAdminDashboardProjectsPage = DashboardPage<DashboardProjectRow>;
export type SuperAdminDashboardWorkforcePage = DashboardPage<DashboardWorkforceRow>;
