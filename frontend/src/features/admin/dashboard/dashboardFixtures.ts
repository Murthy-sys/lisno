import type {
  DashboardProjectRow,
  DashboardWorkforceRow,
  SuperAdminDashboardOverview,
  SuperAdminDashboardProjectsPage,
  SuperAdminDashboardWorkforcePage
} from "./superAdminDashboardApi";

const observedAt = "2026-08-30T12:30:00.000Z";
const period = {
  days: 30 as const,
  startAt: "2026-08-01T00:00:00.000Z",
  endAt: observedAt
};
const completeQuality = {
  status: "complete" as const,
  totalIssueCount: 0,
  issues: [],
  unavailableMetricKeys: []
};

export const superAdminDashboardOverviewFixture: SuperAdminDashboardOverview = {
  observedAt,
  period,
  projects: { total: 2, createdInPeriod: 1, planning: 0, active: 1, onHold: 0, completed: 1, liveOverdue: 1, completedLate: 0, completionRate: { numerator: 1, denominator: 2, rateBps: 5000 }, atRisk: 1 },
  estimation: { eligibleProjects: 2, trackedProjects: 2, unavailableProjects: 0, noEstimate: 0, draftInternal: 0, readyToSend: 0, awaitingClient: 1, changesRequested: 0, clientApproved: 1, approvedSubtotalPaise: 10_000_000, approvedGstPaise: 1_800_000, approvedContractTotalPaise: 11_800_000, medianWaitingAgeDays: 3, oldestWaitingAgeDays: 6 },
  design: { eligibleProjects: 2, trackedProjects: 2, unavailableProjects: 0, pendingAssignment: 0, assigned: 0, inProgress: 1, readyForClient: 0, changesRequested: 0, approved: 1, approvalRate: { numerator: 1, denominator: 2, rateBps: 5000 }, oldestPendingReviewAgeDays: 2, failedDeliveryCount: 1, disabledDeliveryCount: 0 },
  procurement: { eligibleProjects: 2, trackedProjects: 1, unavailableProjects: 1, notStarted: 1, open: 0, inProgress: 1, completed: 0, plannedAmountPaise: 3_000_000, postedSpendPaise: 1_200_000, variancePaise: 1_800_000, averageProgress: { numerator: 65, denominator: 1, rateBps: 6500 } },
  finance: { projectCount: 2, approvedContractTotalPaise: 11_800_000, approvedGstPaise: 1_800_000, approvedSubtotalPaise: 10_000_000, targetProfitPaise: 2_000_000, costBudgetPaise: 8_000_000, procurementCostPaise: 1_200_000, employeePaymentPaise: 900_000, otherExpensePaise: 400_000, directSpendPaise: 2_500_000, overheadPaise: 300_000, recordedCostPaise: 2_800_000, remainingBudgetPaise: 5_200_000, currentProfitPaise: 7_200_000, currentMarginBps: 7200, overBudgetProjectCount: 1, overdueProjectCount: 1, lateCompletedProjectCount: 0, overdueTaskCount: 2 },
  execution: { total: 8, open: 2, inProgress: 3, completed: 3, completedInPeriod: 2, overdue: 2, unassigned: 1, overdueUnassigned: 1, weightedProgress: { numerator: 56, denominator: 100, rateBps: 5600, fallbackTaskCount: 1 }, projectDistribution: [{ projectId: "project-risk", taskCount: 5 }, { projectId: "project-clear", taskCount: 3 }], roleDistribution: [{ role: "worker_electrician", taskCount: 4 }] },
  workforce: { activeWorkers: 2, assignedWorkers: 1, unassignedWorkers: 1, activeAssignedTaskCount: 5, activeUnassignedTaskCount: 1, completedInPeriodTaskCount: 2, overCapacityWorkers: null, capacityAvailable: false, inactiveAssigneeTaskCount: 1, kpiEligibleWorkers: 1, kpiUnavailableWorkers: 1, averageKpi: { numerator: 7800, denominator: 1, rateBps: 7800 }, roleDistribution: [{ role: "worker_electrician", workerCount: 1 }, { role: "worker_plumber", workerCount: 1 }] },
  governance: { pendingInvitations: 2, expiredInvitations: 1, failedInvitationDeliveries: 1, pendingAccessRequests: 3, pendingClientResponses: 1, pendingDesignResponses: 1, failedClientDeliveries: 1, disabledClientDeliveries: 0, failedDesignDeliveries: 1, disabledDesignDeliveries: 0 },
  risk: {
    projectDistribution: { gray: 0, green: 1, yellow: 0, red: 1 },
    factorDistribution: [{ kind: "schedule", level: "red", reasonCode: "project_deadline_overdue", occurrenceCount: 2, projectCount: 1 }],
    topProjects: [{ projectId: "project-risk", projectName: "North Residence", projectStatus: "active", risk: { level: "red", factors: [{ kind: "schedule", level: "red", reasonCode: "project_deadline_overdue", reason: "Project is past its planned deadline.", source: { entityType: "project", entityId: "project-risk" }, observedValue: 8, threshold: 0, drillDownTarget: "/admin/projects/project-risk" }] } }]
  },
  trends: [{ date: "2026-08-30", projectsCreated: 1, projectsCompleted: 0, estimatesApproved: 1, designPlansApproved: 0, workflowTasksCompleted: 2, ledgerExpensesPostedPaise: 250_000 }],
  dataQuality: completeQuality
};

export const dashboardProjectRowsFixture: DashboardProjectRow[] = [
  {
    projectId: "project-risk", projectName: "North Residence", projectStatus: "active", location: "Pune",
    plannedStartAt: "2026-01-01T00:00:00.000Z", plannedEndAt: "2026-08-22T00:00:00.000Z", actualEndAt: null,
    manager: { id: "manager-1", name: "Mira Shah" },
    estimate: { id: "estimate-risk", projectId: "project-risk", resolvedProjectId: "project-risk", projectLinkSource: "estimate_and_lead", version: 4, reviewRoundId: "round-estimate-1", status: "client_approved" },
    designPlan: { estimateId: "estimate-risk", version: 2, status: "approved", reviewRoundId: "round-design-1" },
    procurement: { taskId: "procurement-task-1", estimateId: "estimate-risk", designPlanVersion: 2, status: "in_progress", progress: 65, approvedAmountPaise: 3_000_000, postedSpendPaise: 1_200_000, variancePaise: 1_800_000, sourceSectionIds: ["section-1"], sourceLineItemKeys: ["line-1"] },
    execution: { taskIds: ["task-1", "task-2"], assigneeWorkerIds: ["worker-1"], sourceSectionIds: ["section-1"], sourceLineItemKeys: ["line-1"], taskCount: 5, overdueTaskCount: 2, unassignedTaskCount: 1, progress: { numerator: 50, denominator: 100, rateBps: 5000, fallbackTaskCount: 1 } },
    finance: { bucketId: "bucket-1", version: 3, estimateId: "estimate-risk", estimateVersion: 4, estimateReviewRoundId: "round-estimate-1", designPlanVersion: 2, approvedSubtotalPaise: 10_000_000, recordedCostPaise: 2_800_000, currentProfitPaise: 7_200_000, currentMarginBps: 7200 },
    risk: superAdminDashboardOverviewFixture.risk.topProjects[0].risk
  },
  {
    projectId: "project-clear", projectName: "Lake Apartment", projectStatus: "completed", location: "Mumbai",
    plannedStartAt: "2026-02-01T00:00:00.000Z", plannedEndAt: "2026-07-20T00:00:00.000Z", actualEndAt: "2026-07-18T00:00:00.000Z",
    manager: null, estimate: null, designPlan: null, procurement: null,
    execution: { taskIds: [], assigneeWorkerIds: [], sourceSectionIds: [], sourceLineItemKeys: [], taskCount: 3, overdueTaskCount: 0, unassignedTaskCount: 0, progress: { numerator: 3, denominator: 3, rateBps: 10_000, fallbackTaskCount: 0 } },
    finance: null, risk: { level: "green", factors: [] }
  }
];

export const dashboardWorkforceRowsFixture: DashboardWorkforceRow[] = [
  { workerId: "worker-1", workerName: "Aarav Electrician", role: "worker_electrician", assignmentState: "assigned", activeTaskCount: 4, completedInPeriod: 2, plannedEffort: 100, completedEffort: 55, remainingEffort: 45, remainingWorkloadPercentage: 45, capacityEffort: null, capacityAvailable: false, capacityState: "unavailable", kpi: { availability: "available", scoreBps: 7800, eligibleComponentCount: 3 } },
  { workerId: "worker-2", workerName: "Diya Plumber", role: "worker_plumber", assignmentState: "unassigned", activeTaskCount: 0, completedInPeriod: 0, plannedEffort: 0, completedEffort: 0, remainingEffort: 0, remainingWorkloadPercentage: 0, capacityEffort: null, capacityAvailable: false, capacityState: "unavailable", kpi: { availability: "unavailable", scoreBps: null, eligibleComponentCount: 0 } }
];

export const superAdminDashboardProjectsPageFixture: SuperAdminDashboardProjectsPage = {
  observedAt, period, items: dashboardProjectRowsFixture,
  pagination: { limit: 20, offset: 0, total: 2, hasMore: false }, dataQuality: completeQuality
};
export const superAdminDashboardWorkforcePageFixture: SuperAdminDashboardWorkforcePage = {
  observedAt, period, items: dashboardWorkforceRowsFixture,
  pagination: { limit: 20, offset: 0, total: 2, hasMore: false }, dataQuality: completeQuality
};
