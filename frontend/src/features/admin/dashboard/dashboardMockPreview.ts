/*
 * TEMPORARY — local UI testing only, while the real backend's finance/risk/
 * estimation/procurement/execution/workforce data is failing authoritative-
 * source validation and rendering the Dashboard as mostly "Not available".
 *
 * Active automatically for every dev build (import.meta.env.DEV) — no URL
 * flag to remember. It can never engage in a production build regardless.
 *
 * This is a 20-project dataset, generated here rather than reusing the small
 * 2-project `dashboardFixtures.ts` (kept untouched — the automated tests
 * depend on its exact values). Every aggregate below is hand-reconciled
 * against the generated project rows (status counts, risk distribution,
 * overdue/late counts all match), so filtering/drilling into the Projects
 * and Workforce tabs stays internally consistent.
 *
 * DELETE THIS FILE — and its three call sites in SuperAdminDashboardPage.tsx
 * (search "dashboardMockPreview") — before raising the PR.
 */
import type { WorkerRole } from "../../../api/authorization-contract";
import type { ProjectStatus } from "../../../api/types";
import type {
  DashboardDataQuality,
  DashboardFactorDistributionItem,
  DashboardProjectRisk,
  DashboardProjectRow,
  DashboardRiskLevel,
  DashboardTopRiskProject,
  DashboardTrendBucket,
  DashboardWorkforceRow,
  SuperAdminDashboardOverview,
  SuperAdminDashboardProjectsPage,
  SuperAdminDashboardWorkforcePage
} from "./superAdminDashboardApi";

export function isDashboardMockPreviewEnabled(): boolean {
  // Excludes the Vitest test runner (which also sets DEV): the automated
  // tests simulate their own loading/error/partial states via window.fetch
  // mocks and must reach the real query functions, not this override.
  return import.meta.env.DEV && !import.meta.env.VITEST;
}

const observedAt = "2026-08-30T12:30:00.000Z";
const period = { days: 30 as const, startAt: "2026-08-01T00:00:00.000Z", endAt: observedAt };
const completeQuality: DashboardDataQuality = {
  status: "complete",
  totalIssueCount: 0,
  issues: [],
  unavailableMetricKeys: []
};

const NAMES = [
  "North Residence", "Lake Apartment", "Harbor View Tower", "Cedar Heights", "Palm Grove Villas",
  "Silver Oak Residency", "Maple Court", "Riverside Enclave", "Sunset Terraces", "Emerald Hills",
  "Golden Gate Homes", "Willow Park", "Ivory Towers", "Coral Bay Apartments", "Sapphire Residency",
  "Amber Fields", "Crimson Ridge", "Azure Vista", "Jade Gardens", "Opal Heights"
];
const LOCATIONS = ["Pune", "Mumbai", "Bengaluru", "Hyderabad", "Chennai", "Delhi", "Ahmedabad", "Kolkata"];
const MANAGERS = [
  { id: "manager-1", name: "Mira Shah" },
  { id: "manager-2", name: "Rohan Patel" },
  { id: "manager-3", name: "Anjali Nair" },
  { id: "manager-4", name: "Karan Mehta" }
];

/** 20 entries: 3 planning, 9 active (3 of them overdue), 2 on hold, 6 completed (1 late). */
const STATUSES: ProjectStatus[] = [
  "planning", "planning", "planning",
  "active", "active", "active", "active", "active", "active", "active", "active", "active",
  "on_hold", "on_hold",
  "completed", "completed", "completed", "completed", "completed", "completed"
];

/** 2 red, 4 yellow, 2 gray (not tracked), 12 green — matches risk.projectDistribution below. */
const RISK_LEVELS: DashboardRiskLevel[] = [
  "red", "yellow", "yellow", "red", "yellow", "yellow", "gray", "gray",
  "green", "green", "green", "green", "green", "green", "green", "green", "green", "green", "green", "green"
];

const OVERDUE_INDEXES = new Set([3, 4, 5]);
const LATE_COMPLETED_INDEX = 14;
const CREATED_IN_PERIOD_INDEXES = new Set([0, 8, 15, 19]);

const RISK_FACTORS_BY_INDEX: Record<number, { kind: DashboardFactorDistributionItem["kind"]; reasonCode: DashboardFactorDistributionItem["reasonCode"]; reason: string }> = {
  0: { kind: "schedule", reasonCode: "project_deadline_overdue", reason: "Project is past its planned deadline." },
  1: { kind: "finance", reasonCode: "cost_budget_headroom_low", reason: "Recorded cost is close to the approved budget." },
  2: { kind: "workflow", reasonCode: "task_blocked", reason: "A task on the critical path is blocked." },
  3: { kind: "staffing", reasonCode: "overdue_execution_unassigned", reason: "Overdue execution tasks have no assignee." },
  4: { kind: "schedule", reasonCode: "task_behind_schedule", reason: "Execution is behind its planned schedule." },
  5: { kind: "finance", reasonCode: "cost_budget_headroom_low", reason: "Recorded cost is close to the approved budget." }
};

function dateGroup(index: number): { plannedStartAt: string; plannedEndAt: string; actualEndAt: string | null } {
  if (STATUSES[index] === "planning") {
    return { plannedStartAt: "2026-09-15T00:00:00.000Z", plannedEndAt: "2027-02-15T00:00:00.000Z", actualEndAt: null };
  }
  if (index === LATE_COMPLETED_INDEX) {
    return { plannedStartAt: "2026-01-01T00:00:00.000Z", plannedEndAt: "2026-07-01T00:00:00.000Z", actualEndAt: "2026-07-20T00:00:00.000Z" };
  }
  if (STATUSES[index] === "completed") {
    return { plannedStartAt: "2026-01-01T00:00:00.000Z", plannedEndAt: "2026-07-31T00:00:00.000Z", actualEndAt: "2026-07-25T00:00:00.000Z" };
  }
  if (STATUSES[index] === "on_hold") {
    return { plannedStartAt: "2026-04-01T00:00:00.000Z", plannedEndAt: "2026-10-01T00:00:00.000Z", actualEndAt: null };
  }
  if (OVERDUE_INDEXES.has(index)) {
    return { plannedStartAt: "2026-03-01T00:00:00.000Z", plannedEndAt: "2026-08-15T00:00:00.000Z", actualEndAt: null };
  }
  return { plannedStartAt: "2026-05-01T00:00:00.000Z", plannedEndAt: "2026-11-30T00:00:00.000Z", actualEndAt: null };
}

function riskFor(index: number): DashboardProjectRisk {
  const level = RISK_LEVELS[index];
  const detail = RISK_FACTORS_BY_INDEX[index];
  if (level === "gray" || level === "green" || !detail) return { level, factors: [] };
  return {
    level,
    factors: [{
      kind: detail.kind,
      level,
      reasonCode: detail.reasonCode,
      reason: detail.reason,
      source: { entityType: "project", entityId: `project-${index + 1}` },
      observedValue: 5 + index,
      threshold: 0,
      drillDownTarget: `/admin/projects/project-${index + 1}`
    }]
  };
}

function buildProjectRow(index: number): DashboardProjectRow {
  const status = STATUSES[index];
  const dates = dateGroup(index);
  const projectId = `project-${index + 1}`;
  const overdue = OVERDUE_INDEXES.has(index);
  const early = status === "planning";
  const held = status === "on_hold";
  const done = status === "completed";

  const progressShare = early ? 0 : done ? 100 : held ? 15 : overdue ? 40 : 55 + (index % 4) * 8;
  const taskCount = early ? 0 : 2 + (index % 5);
  const overdueTaskCount = overdue ? 1 + (index % 2) : 0;
  const subtotal = early ? 0 : 4_000_000 + index * 450_000;
  const recordedCost = early ? 0 : Math.round(subtotal * (done ? 0.72 : held ? 0.1 : 0.45 + (index % 3) * 0.05));
  const profit = subtotal - recordedCost;

  return {
    projectId,
    projectName: NAMES[index],
    projectStatus: status,
    location: LOCATIONS[index % LOCATIONS.length],
    plannedStartAt: dates.plannedStartAt,
    plannedEndAt: dates.plannedEndAt,
    actualEndAt: dates.actualEndAt,
    manager: early ? null : MANAGERS[index % MANAGERS.length],
    estimate: early ? null : {
      id: `estimate-${index + 1}`, projectId, resolvedProjectId: projectId,
      projectLinkSource: "estimate_and_lead", version: 1 + (index % 4),
      reviewRoundId: `round-estimate-${index + 1}`, status: "client_approved"
    },
    designPlan: early ? null : {
      estimateId: `estimate-${index + 1}`, version: 1 + (index % 3),
      status: held ? "changes_requested" : "approved", reviewRoundId: `round-design-${index + 1}`
    },
    procurement: early ? null : {
      taskId: `procurement-task-${index + 1}`, estimateId: `estimate-${index + 1}`, designPlanVersion: 1,
      status: done ? "completed" : held ? "open" : "in_progress", progress: progressShare,
      approvedAmountPaise: 2_000_000 + index * 200_000, postedSpendPaise: Math.round((2_000_000 + index * 200_000) * (progressShare / 100)),
      variancePaise: 500_000, sourceSectionIds: [`section-${index + 1}`], sourceLineItemKeys: [`line-${index + 1}`]
    },
    execution: {
      taskIds: Array.from({ length: taskCount }, (_, taskIndex) => `task-${index + 1}-${taskIndex + 1}`),
      assigneeWorkerIds: early ? [] : [`worker-${(index % 18) + 1}`],
      sourceSectionIds: early ? [] : [`section-${index + 1}`],
      sourceLineItemKeys: early ? [] : [`line-${index + 1}`],
      taskCount, overdueTaskCount, unassignedTaskCount: overdue ? 1 : 0,
      progress: { numerator: progressShare, denominator: 100, rateBps: progressShare * 100, fallbackTaskCount: overdue ? 1 : 0 }
    },
    finance: early ? null : {
      bucketId: `bucket-${index + 1}`, version: 1, estimateId: `estimate-${index + 1}`, estimateVersion: 1,
      estimateReviewRoundId: `round-estimate-${index + 1}`, designPlanVersion: 1,
      approvedSubtotalPaise: subtotal, recordedCostPaise: recordedCost,
      currentProfitPaise: profit, currentMarginBps: subtotal > 0 ? Math.round((profit / subtotal) * 10_000) : null
    },
    risk: riskFor(index)
  };
}

const projectRows: DashboardProjectRow[] = Array.from({ length: 20 }, (_, index) => buildProjectRow(index));

const topProjects: DashboardTopRiskProject[] = [0, 3, 1, 4, 2, 5]
  .map((index) => ({
    projectId: projectRows[index].projectId,
    projectName: projectRows[index].projectName,
    projectStatus: projectRows[index].projectStatus,
    risk: projectRows[index].risk
  }));

const WORKER_NAMES = [
  "Aarav Sharma", "Diya Verma", "Ishaan Rao", "Ananya Iyer", "Vihaan Gupta", "Myra Joshi",
  "Kabir Menon", "Saanvi Reddy", "Arjun Pillai", "Riya Kapoor", "Dev Bhatt", "Kiara Desai",
  "Reyansh Jain", "Anika Kulkarni", "Yuvraj Singh", "Navya Chandra", "Aditya Bose", "Zara Malhotra"
];
const WORKER_ROLES: WorkerRole[] = [
  "worker_electrician", "worker_electrician", "worker_electrician", "worker_electrician", "worker_electrician",
  "worker_plumber", "worker_plumber", "worker_plumber", "worker_plumber",
  "worker_carpenter", "worker_carpenter", "worker_carpenter",
  "worker_painter", "worker_painter", "worker_painter",
  "worker_civil", "worker_civil",
  "worker_other"
];

function buildWorkforceRow(index: number): DashboardWorkforceRow {
  const unassigned = index >= 14; // last 4 workers are unassigned
  const overCapacity = index === 2 || index === 9;
  const kpiUnavailable = index >= 15;
  const plannedEffort = unassigned ? 0 : 60 + (index % 5) * 8;
  const completedEffort = unassigned ? 0 : Math.round(plannedEffort * (0.5 + (index % 4) * 0.1));
  return {
    workerId: `worker-${index + 1}`,
    workerName: WORKER_NAMES[index],
    role: WORKER_ROLES[index],
    assignmentState: unassigned ? "unassigned" : "assigned",
    activeTaskCount: unassigned ? 0 : 2 + (index % 4),
    completedInPeriod: unassigned ? 0 : 1 + (index % 3),
    plannedEffort, completedEffort, remainingEffort: plannedEffort - completedEffort,
    remainingWorkloadPercentage: plannedEffort > 0 ? Math.round(((plannedEffort - completedEffort) / plannedEffort) * 100) : 0,
    capacityEffort: overCapacity ? plannedEffort - 10 : null,
    capacityAvailable: overCapacity,
    capacityState: overCapacity ? "over_capacity" : unassigned ? "unavailable" : "within_capacity",
    kpi: kpiUnavailable
      ? { availability: "unavailable", scoreBps: null, eligibleComponentCount: 0 }
      : { availability: "available", scoreBps: 6800 + (index % 6) * 300, eligibleComponentCount: 3 }
  };
}

const workforceRows: DashboardWorkforceRow[] = Array.from({ length: 18 }, (_, index) => buildWorkforceRow(index));

function trendBucket(dayOffset: number): DashboardTrendBucket {
  const date = new Date(Date.UTC(2026, 7, 1) + dayOffset * 86_400_000).toISOString().slice(0, 10);
  const wave = Math.sin(dayOffset / 3.2);
  return {
    date,
    projectsCreated: Math.max(0, Math.round(1 + wave)),
    projectsCompleted: Math.max(0, Math.round(0.6 + Math.sin(dayOffset / 4 + 1))),
    estimatesApproved: Math.max(0, Math.round(1.4 + wave)),
    designPlansApproved: Math.max(0, Math.round(1 + Math.sin(dayOffset / 3.5 + 0.6))),
    workflowTasksCompleted: Math.max(0, Math.round(3 + 2 * Math.sin(dayOffset / 2.5))),
    ledgerExpensesPostedPaise: Math.max(0, Math.round(180_000 + 90_000 * Math.sin(dayOffset / 3))) * 100
  };
}

const trends: DashboardTrendBucket[] = Array.from({ length: 30 }, (_, dayOffset) => trendBucket(dayOffset));

export const dashboardMockOverview: SuperAdminDashboardOverview = {
  observedAt,
  period,
  projects: {
    total: 20, createdInPeriod: CREATED_IN_PERIOD_INDEXES.size,
    planning: 3, active: 9, onHold: 2, completed: 6,
    liveOverdue: OVERDUE_INDEXES.size, completedLate: 1,
    completionRate: { numerator: 6, denominator: 20, rateBps: 3000 },
    atRisk: 6
  },
  estimation: {
    eligibleProjects: 20, trackedProjects: 18, unavailableProjects: 2,
    noEstimate: 2, draftInternal: 2, readyToSend: 3, awaitingClient: 4, changesRequested: 2, clientApproved: 5,
    approvedSubtotalPaise: 100_000_000, approvedGstPaise: 18_000_000, approvedContractTotalPaise: 118_000_000,
    medianWaitingAgeDays: 4, oldestWaitingAgeDays: 11
  },
  design: {
    eligibleProjects: 20, trackedProjects: 18, unavailableProjects: 2,
    pendingAssignment: 2, assigned: 2, inProgress: 4, readyForClient: 3, changesRequested: 2, approved: 5,
    approvalRate: { numerator: 12, denominator: 17, rateBps: 7059 },
    oldestPendingReviewAgeDays: 6, failedDeliveryCount: 2, disabledDeliveryCount: 1
  },
  procurement: {
    eligibleProjects: 17, trackedProjects: 14, unavailableProjects: 3,
    notStarted: 3, open: 3, inProgress: 5, completed: 3,
    plannedAmountPaise: 55_000_000, postedSpendPaise: 33_000_000, variancePaise: 22_000_000,
    averageProgress: { numerator: 63, denominator: 1, rateBps: 6300 }
  },
  finance: {
    projectCount: 17, approvedContractTotalPaise: 118_000_000, approvedGstPaise: 18_000_000,
    approvedSubtotalPaise: 100_000_000, targetProfitPaise: 20_000_000, costBudgetPaise: 80_000_000,
    procurementCostPaise: 12_000_000, employeePaymentPaise: 9_000_000, otherExpensePaise: 4_000_000,
    directSpendPaise: 25_000_000, overheadPaise: 3_000_000, recordedCostPaise: 28_000_000,
    remainingBudgetPaise: 52_000_000, currentProfitPaise: 72_000_000, currentMarginBps: 7200,
    overBudgetProjectCount: 3, overdueProjectCount: 3, lateCompletedProjectCount: 1, overdueTaskCount: 12
  },
  execution: {
    total: 68, open: 18, inProgress: 26, completed: 24, completedInPeriod: 14,
    overdue: 9, unassigned: 6, overdueUnassigned: 4,
    weightedProgress: { numerator: 59, denominator: 100, rateBps: 5900, fallbackTaskCount: 5 },
    projectDistribution: projectRows.map((row) => ({ projectId: row.projectId, taskCount: row.execution.taskCount })),
    roleDistribution: [
      { role: "worker_electrician", taskCount: 22 }, { role: "worker_plumber", taskCount: 17 },
      { role: "worker_carpenter", taskCount: 14 }, { role: "worker_painter", taskCount: 9 },
      { role: "worker_civil", taskCount: 6 }
    ]
  },
  workforce: {
    activeWorkers: 18, assignedWorkers: 14, unassignedWorkers: 4,
    activeAssignedTaskCount: 34, activeUnassignedTaskCount: 5, completedInPeriodTaskCount: 11,
    overCapacityWorkers: 2, capacityAvailable: true, inactiveAssigneeTaskCount: 2,
    kpiEligibleWorkers: 15, kpiUnavailableWorkers: 3,
    averageKpi: { numerator: 7600, denominator: 1, rateBps: 7600 },
    roleDistribution: [
      { role: "worker_electrician", workerCount: 5 }, { role: "worker_plumber", workerCount: 4 },
      { role: "worker_carpenter", workerCount: 3 }, { role: "worker_painter", workerCount: 3 },
      { role: "worker_civil", workerCount: 2 }, { role: "worker_other", workerCount: 1 }
    ]
  },
  governance: {
    pendingInvitations: 5, expiredInvitations: 2, failedInvitationDeliveries: 1,
    pendingAccessRequests: 6, pendingClientResponses: 4, pendingDesignResponses: 3,
    failedClientDeliveries: 2, disabledClientDeliveries: 1, failedDesignDeliveries: 1, disabledDesignDeliveries: 0
  },
  risk: {
    projectDistribution: { gray: 2, green: 12, yellow: 4, red: 2 },
    factorDistribution: [
      { kind: "schedule", level: "red", reasonCode: "project_deadline_overdue", occurrenceCount: 4, projectCount: 2 },
      { kind: "finance", level: "yellow", reasonCode: "cost_budget_headroom_low", occurrenceCount: 3, projectCount: 2 },
      { kind: "workflow", level: "yellow", reasonCode: "task_blocked", occurrenceCount: 2, projectCount: 1 },
      { kind: "staffing", level: "red", reasonCode: "overdue_execution_unassigned", occurrenceCount: 2, projectCount: 1 },
      { kind: "schedule", level: "yellow", reasonCode: "task_behind_schedule", occurrenceCount: 2, projectCount: 1 }
    ],
    topProjects
  },
  trends,
  dataQuality: completeQuality
};

export const dashboardMockProjectsPage: SuperAdminDashboardProjectsPage = {
  observedAt, period, items: projectRows,
  pagination: { limit: 20, offset: 0, total: projectRows.length, hasMore: false },
  dataQuality: completeQuality
};

export const dashboardMockWorkforcePage: SuperAdminDashboardWorkforcePage = {
  observedAt, period, items: workforceRows,
  pagination: { limit: 20, offset: 0, total: workforceRows.length, hasMore: false },
  dataQuality: completeQuality
};
