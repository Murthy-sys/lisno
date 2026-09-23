import type { DashboardOverview, DashboardPeriod } from "./contract";

const OBSERVED_AT = "2026-09-22T10:30:00.000Z";

function shiftUtcDate(value: string, days: number): Date {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function periodWindow(days: DashboardPeriod, offset: number) {
  const observed = new Date(OBSERVED_AT);
  const end = shiftUtcDate(observed.toISOString(), offset);
  const start = shiftUtcDate(observed.toISOString(), offset - days + 1);
  start.setUTCHours(0, 0, 0, 0);
  return { days, startAt: start.toISOString(), endAt: end.toISOString() };
}

function comparisonMetric(current: number, previous: number, unit: "count" | "paise") {
  const delta = current - previous;
  return {
    unit,
    timeBasis: "event_window" as const,
    current,
    previous,
    delta,
    changeBps: previous === 0 ? null : Math.round(delta * 10_000 / previous),
    changeKind: previous === 0
      ? current === 0 ? "no_change" as const : "new" as const
      : delta === 0 ? "no_change" as const : "percentage" as const,
    currentStatus: "available" as const,
    previousStatus: "available" as const,
    currentUnavailableReason: null,
    previousUnavailableReason: null
  };
}

function buckets(days: DashboardPeriod, startAt: string, side: "current" | "previous") {
  const final = side === "current"
    ? {
        projectsCreated: 5,
        clientsCreated: 2,
        projectsCompleted: 1,
        executionTasksCompleted: 13,
        estimatesApproved: 4,
        designPlansApproved: 3,
        recordedExpensesPaise: 715_300
      }
    : {
        projectsCreated: 3,
        clientsCreated: 4,
        projectsCompleted: 2,
        executionTasksCompleted: 8,
        estimatesApproved: 2,
        designPlansApproved: 1,
        recordedExpensesPaise: 490_100
      };
  return Array.from({ length: days }, (_, dayIndex) => {
    const date = shiftUtcDate(startAt, dayIndex);
    const populated = dayIndex === days - 1;
    return {
      dayIndex,
      date: dateOnly(date),
      projectsCreated: populated ? final.projectsCreated : 0,
      clientsCreated: populated ? final.clientsCreated : 0,
      projectsCompleted: populated ? final.projectsCompleted : 0,
      executionTasksCompleted: populated ? final.executionTasksCompleted : 0,
      estimatesApproved: populated ? final.estimatesApproved : 0,
      designPlansApproved: populated ? final.designPlansApproved : 0,
      recordedExpensesPaise: populated ? final.recordedExpensesPaise : 0
    };
  });
}

export function cloneDashboardFixture(value: DashboardOverview): DashboardOverview {
  return JSON.parse(JSON.stringify(value)) as DashboardOverview;
}

export function createDashboardOverviewFixture(days: DashboardPeriod = 7): DashboardOverview {
  const current = periodWindow(days, 0);
  const previous = periodWindow(days, -days);
  return {
    observedAt: OBSERVED_AT,
    period: current,
    projects: {
      total: 17,
      createdInPeriod: 5,
      completedInPeriod: 1,
      planning: 3,
      active: 9,
      onHold: 2,
      completed: 3,
      liveOverdue: 4,
      completedLate: 1,
      completionRate: { numerator: 3, denominator: 17, rateBps: 1_765 },
      atRisk: 6
    },
    clients: {
      accountsStatus: "available",
      relationshipsStatus: "available",
      accountsUnavailableReason: null,
      relationshipsUnavailableReason: null,
      registeredAccounts: 11,
      activeAccounts: 8,
      inactiveAccounts: 3,
      accountsCreatedInPeriod: 2,
      clientsWithProjects: 9,
      clientsWithActiveProjects: 7,
      unlinkedProjects: 1,
      invalidProjectClientLinks: 0
    },
    estimation: {
      eligibleProjects: 14,
      trackedProjects: 13,
      unavailableProjects: 1,
      noEstimate: 2,
      draftInternal: 3,
      readyToSend: 1,
      awaitingClient: 2,
      changesRequested: 1,
      clientApproved: 4,
      approvedSubtotalPaise: 18_500_000,
      approvedGstPaise: 3_330_000,
      approvedContractTotalPaise: 21_830_000,
      medianWaitingAgeDays: 3,
      oldestWaitingAgeDays: 12
    },
    design: {
      eligibleProjects: 10,
      trackedProjects: 9,
      unavailableProjects: 1,
      pendingAssignment: 1,
      assigned: 2,
      inProgress: 3,
      readyForClient: 1,
      changesRequested: 1,
      approved: 2,
      approvalRate: { numerator: 2, denominator: 3, rateBps: 6_667 },
      oldestPendingReviewAgeDays: 5,
      failedDeliveryCount: 1,
      disabledDeliveryCount: 0
    },
    procurement: {
      eligibleProjects: 8,
      trackedProjects: 7,
      unavailableProjects: 1,
      notStarted: 1,
      open: 2,
      inProgress: 3,
      completed: 1,
      plannedAmountPaise: 7_000_000,
      postedSpendPaise: 4_600_000,
      variancePaise: 2_400_000,
      averageProgress: { numerator: 420, denominator: 7, rateBps: 6_000 }
    },
    finance: {
      projectCount: 7,
      approvedContractTotalPaise: 21_830_000,
      approvedGstPaise: 3_330_000,
      approvedSubtotalPaise: 18_500_000,
      targetProfitPaise: 3_700_000,
      costBudgetPaise: 14_800_000,
      procurementCostPaise: 4_600_000,
      employeePaymentPaise: 2_400_000,
      otherExpensePaise: 900_000,
      directSpendPaise: 7_900_000,
      overheadPaise: 600_000,
      recordedCostPaise: 8_500_000,
      remainingBudgetPaise: 6_300_000,
      currentProfitPaise: 10_000_000,
      currentMarginBps: 5_405,
      overBudgetProjectCount: 2,
      overdueProjectCount: 3,
      lateCompletedProjectCount: 1,
      overdueTaskCount: 6
    },
    execution: {
      total: 42,
      open: 11,
      inProgress: 14,
      completed: 17,
      completedInPeriod: 13,
      overdue: 6,
      unassigned: 5,
      overdueUnassigned: 2,
      weightedProgress: { numerator: 2_730, denominator: 4_200, rateBps: 6_500, fallbackTaskCount: 3 },
      projectDistribution: [
        { projectId: "project-alpha", taskCount: 19 },
        { projectId: "project-beta", taskCount: 11 }
      ],
      roleDistribution: [
        { role: "worker_electrician", taskCount: 9 },
        { role: "worker_carpenter", taskCount: 7 }
      ]
    },
    workforce: {
      activeWorkers: 12,
      assignedWorkers: 9,
      unassignedWorkers: 3,
      activeAssignedTaskCount: 25,
      activeUnassignedTaskCount: 5,
      completedInPeriodTaskCount: 13,
      overCapacityWorkers: null,
      capacityAvailable: false,
      inactiveAssigneeTaskCount: 1,
      kpiEligibleWorkers: 8,
      kpiUnavailableWorkers: 4,
      averageKpi: { numerator: 59_200, denominator: 8, rateBps: 7_400 },
      roleDistribution: [
        { role: "worker_electrician", workerCount: 3 },
        { role: "worker_plumber", workerCount: 2 },
        { role: "worker_carpenter", workerCount: 4 },
        { role: "worker_painter", workerCount: 1 },
        { role: "worker_civil", workerCount: 1 },
        { role: "worker_other", workerCount: 1 }
      ]
    },
    governance: {
      pendingInvitations: 2,
      expiredInvitations: 1,
      failedInvitationDeliveries: 1,
      pendingAccessRequests: 4,
      pendingClientResponses: 3,
      pendingDesignResponses: 2,
      failedClientDeliveries: 1,
      disabledClientDeliveries: 0,
      failedDesignDeliveries: 1,
      disabledDesignDeliveries: 1
    },
    risk: {
      projectDistribution: { gray: 1, green: 7, yellow: 3, red: 6 },
      factorDistribution: [
        { kind: "schedule", level: "red", reasonCode: "project_deadline_overdue", occurrenceCount: 6, projectCount: 4 },
        { kind: "finance", level: "yellow", reasonCode: "cost_budget_headroom_low", occurrenceCount: 3, projectCount: 2 }
      ],
      topProjects: [{
        projectId: "project-alpha",
        projectName: "Atrium Residence",
        projectStatus: "active",
        risk: {
          level: "red",
          factors: [{
            kind: "schedule",
            level: "red",
            reasonCode: "project_deadline_overdue",
            reason: "Project is past its planned deadline.",
            source: { entityType: "project", entityId: "project-alpha" },
            observedValue: 8,
            threshold: 0,
            drillDownTarget: "/admin/projects/project-alpha"
          }]
        }
      }]
    },
    trends: Array.from({ length: days }, (_, dayIndex) => ({
      date: dateOnly(shiftUtcDate(current.startAt, dayIndex)),
      projectsCreated: dayIndex === days - 1 ? 5 : 0,
      projectsCompleted: dayIndex === days - 2 ? 1 : 0,
      estimatesApproved: dayIndex === days - 1 ? 4 : 0,
      designPlansApproved: dayIndex === days - 1 ? 3 : 0,
      workflowTasksCompleted: dayIndex === days - 1 ? 13 : 0,
      ledgerExpensesPostedPaise: dayIndex === days - 1 ? 715_300 : 0
    })),
    comparison: {
      window: { timezone: "UTC", current, previous, partialFinalDay: true },
      metrics: {
        projects_created: comparisonMetric(5, 3, "count"),
        clients_created: comparisonMetric(2, 4, "count"),
        projects_completed: comparisonMetric(1, 2, "count"),
        execution_tasks_completed: comparisonMetric(13, 8, "count"),
        estimates_approved: comparisonMetric(4, 2, "count"),
        design_plans_approved: comparisonMetric(3, 1, "count"),
        recorded_expenses_paise: comparisonMetric(715_300, 490_100, "paise")
      },
      currentBuckets: buckets(days, current.startAt, "current"),
      previousBuckets: buckets(days, previous.startAt, "previous")
    },
    dataQuality: {
      status: "complete",
      totalIssueCount: 0,
      issues: [],
      unavailableMetricKeys: []
    }
  };
}

export function createPartialDashboardOverviewFixture(): DashboardOverview {
  const value = cloneDashboardFixture(createDashboardOverviewFixture());
  value.clients.accountsStatus = "unavailable";
  value.clients.relationshipsStatus = "unavailable";
  value.clients.accountsUnavailableReason = "Client account aggregates are temporarily unavailable.";
  value.clients.relationshipsUnavailableReason = "Client relationship aggregates are temporarily unavailable.";
  value.clients.registeredAccounts = null;
  value.clients.activeAccounts = null;
  value.clients.inactiveAccounts = null;
  value.clients.accountsCreatedInPeriod = null;
  value.clients.clientsWithProjects = null;
  value.clients.clientsWithActiveProjects = null;
  value.clients.unlinkedProjects = null;
  value.clients.invalidProjectClientLinks = null;
  value.comparison.metrics.clients_created = {
    unit: "count",
    timeBasis: "event_window",
    current: null,
    previous: null,
    delta: null,
    changeBps: null,
    changeKind: "unavailable",
    currentStatus: "unavailable",
    previousStatus: "unavailable",
    currentUnavailableReason: "Client account aggregates are temporarily unavailable.",
    previousUnavailableReason: "Client account aggregates are temporarily unavailable."
  };
  for (const bucket of value.comparison.currentBuckets) bucket.clientsCreated = null;
  for (const bucket of value.comparison.previousBuckets) bucket.clientsCreated = null;
  value.dataQuality = {
    status: "partial",
    totalIssueCount: 8,
    issues: [{
      code: "module_aggregate_unavailable",
      metricKey: "clients",
      message: "Client aggregates are temporarily unavailable.",
      entityType: null,
      entityId: null
    }],
    unavailableMetricKeys: ["clients", "comparison.clients_created"]
  };
  return value;
}

export function createUnavailableDashboardOverviewFixture(): DashboardOverview {
  const value = cloneDashboardFixture(createDashboardOverviewFixture());
  const reason = "The comparison source is unavailable.";
  for (const id of Object.keys(value.comparison.metrics) as Array<keyof typeof value.comparison.metrics>) {
    value.comparison.metrics[id] = {
      ...value.comparison.metrics[id],
      current: null,
      previous: null,
      delta: null,
      changeBps: null,
      changeKind: "unavailable",
      currentStatus: "unavailable",
      previousStatus: "unavailable",
      currentUnavailableReason: reason,
      previousUnavailableReason: reason
    };
  }
  for (const bucket of [...value.comparison.currentBuckets, ...value.comparison.previousBuckets]) {
    bucket.projectsCreated = null;
    bucket.clientsCreated = null;
    bucket.projectsCompleted = null;
    bucket.executionTasksCompleted = null;
    bucket.estimatesApproved = null;
    bucket.designPlansApproved = null;
    bucket.recordedExpensesPaise = null;
  }
  value.dataQuality = {
    status: "partial",
    totalIssueCount: 7,
    issues: [{
      code: "module_aggregate_unavailable",
      metricKey: "comparison",
      message: reason,
      entityType: null,
      entityId: null
    }],
    unavailableMetricKeys: ["comparison"]
  };
  return value;
}

export function createOverspendDashboardOverviewFixture(): DashboardOverview {
  const value = cloneDashboardFixture(createDashboardOverviewFixture());
  value.finance.costBudgetPaise = 5_000_000;
  value.finance.recordedCostPaise = 7_000_000;
  value.finance.remainingBudgetPaise = -2_000_000;
  value.finance.currentProfitPaise = -1_250_000;
  value.finance.currentMarginBps = -676;
  value.finance.overBudgetProjectCount = 3;
  return value;
}

export function createZeroDashboardOverviewFixture(): DashboardOverview {
  const value = cloneDashboardFixture(createDashboardOverviewFixture());
  const zeroRecord = (record: Record<string, unknown>) => {
    for (const [key, item] of Object.entries(record)) {
      if (typeof item === "number") record[key] = 0;
    }
  };
  zeroRecord(value.projects);
  value.projects.completionRate = { numerator: 0, denominator: 0, rateBps: null };
  for (const key of Object.keys(value.clients) as Array<keyof typeof value.clients>) {
    if (typeof value.clients[key] === "number") (value.clients as Record<string, unknown>)[key] = 0;
  }
  for (const module of [value.estimation, value.design, value.procurement, value.finance, value.execution, value.workforce, value.governance]) {
    zeroRecord(module as unknown as Record<string, unknown>);
  }
  value.estimation.medianWaitingAgeDays = 0;
  value.estimation.oldestWaitingAgeDays = 0;
  value.design.oldestPendingReviewAgeDays = 0;
  value.design.approvalRate = { numerator: 0, denominator: 0, rateBps: null };
  value.procurement.averageProgress = { numerator: 0, denominator: 0, rateBps: null };
  value.procurement.plannedAmountPaise = 0;
  value.procurement.variancePaise = 0;
  value.execution.weightedProgress = { numerator: 0, denominator: 0, rateBps: null, fallbackTaskCount: 0 };
  value.execution.projectDistribution = [];
  value.execution.roleDistribution = [];
  value.workforce.overCapacityWorkers = 0;
  value.workforce.capacityAvailable = true;
  value.workforce.averageKpi = { numerator: 0, denominator: 0, rateBps: null };
  value.workforce.roleDistribution = [];
  value.risk.projectDistribution = { gray: 0, green: 0, yellow: 0, red: 0 };
  value.risk.factorDistribution = [];
  value.risk.topProjects = [];
  for (const trend of value.trends) zeroRecord(trend as unknown as Record<string, unknown>);
  for (const id of Object.keys(value.comparison.metrics) as Array<keyof typeof value.comparison.metrics>) {
    const unit = value.comparison.metrics[id].unit;
    value.comparison.metrics[id] = comparisonMetric(0, 0, unit);
  }
  for (const bucket of [...value.comparison.currentBuckets, ...value.comparison.previousBuckets]) {
    bucket.projectsCreated = 0;
    bucket.clientsCreated = 0;
    bucket.projectsCompleted = 0;
    bucket.executionTasksCompleted = 0;
    bucket.estimatesApproved = 0;
    bucket.designPlansApproved = 0;
    bucket.recordedExpensesPaise = 0;
  }
  return value;
}
