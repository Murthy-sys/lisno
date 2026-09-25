import { z } from "zod";

import { WORKER_ROLES } from "../../../contracts/authorization";

export const DASHBOARD_PERIODS = [7, 30, 365] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];
/** Response windows the backend may return; 90 stays tolerated for other clients. */
export const DASHBOARD_RESPONSE_PERIOD_DAYS = [7, 30, 90, 365] as const;
export type DashboardResponsePeriodDays = (typeof DASHBOARD_RESPONSE_PERIOD_DAYS)[number];
const MAX_DASHBOARD_PERIOD_DAYS = 365;

export function isDashboardPeriod(value: unknown): value is DashboardPeriod {
  return (DASHBOARD_PERIODS as readonly unknown[]).includes(value);
}

export const DASHBOARD_COUNT_COMPARISON_METRIC_IDS = [
  "projects_created",
  "clients_created",
  "projects_completed",
  "execution_tasks_completed",
  "estimates_approved",
  "design_plans_approved"
] as const;
export type DashboardCountComparisonMetricId =
  (typeof DASHBOARD_COUNT_COMPARISON_METRIC_IDS)[number];

export const DASHBOARD_HERO_METRIC_IDS = DASHBOARD_COUNT_COMPARISON_METRIC_IDS;
export type DashboardHeroMetricId = DashboardCountComparisonMetricId;

export const DASHBOARD_COMPARISON_METRIC_IDS = [
  ...DASHBOARD_COUNT_COMPARISON_METRIC_IDS,
  "recorded_expenses_paise"
] as const;
export type DashboardComparisonMetricId =
  (typeof DASHBOARD_COMPARISON_METRIC_IDS)[number];

export const DASHBOARD_MODULE_IDS = ["overview", "delivery", "capital", "people"] as const;
export type DashboardModuleId = (typeof DASHBOARD_MODULE_IDS)[number];

export const DASHBOARD_RISK_LEVELS = ["gray", "green", "yellow", "red"] as const;
export type DashboardRiskLevel = (typeof DASHBOARD_RISK_LEVELS)[number];

export const DASHBOARD_RISK_FACTORS = ["schedule", "finance", "staffing", "workflow"] as const;
export type DashboardRiskFactorKind = (typeof DASHBOARD_RISK_FACTORS)[number];

const riskReasonCodes = [
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

const dataQualityIssueCodes = [
  "project_identity_mismatch",
  "estimate_project_lineage_mismatch",
  "finance_project_lineage_mismatch",
  "task_project_lineage_mismatch",
  "assignee_identity_mismatch",
  "module_aggregate_unavailable"
] as const;

const nonNegativeIntegerSchema = z.number().refine(
  (value) => Number.isSafeInteger(value) && value >= 0,
  "Expected a non-negative safe integer."
);
const signedIntegerSchema = z.number().refine(
  Number.isSafeInteger,
  "Expected a safe integer."
);
const finiteNumberSchema = z.number().refine(Number.isFinite, "Expected a finite number.");
const nullableNonNegativeIntegerSchema = nonNegativeIntegerSchema.nullable();
const nullableSignedIntegerSchema = signedIntegerSchema.nullable();

function isRealUtcTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function isRealUtcDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

const utcTimestampSchema = z.string().refine(isRealUtcTimestamp, "Expected an ISO UTC timestamp.");
const utcDateSchema = z.string().refine(isRealUtcDate, "Expected an ISO UTC date.");
const identifierSchema = z.string().min(1).max(256);
const boundedTextSchema = z.string().max(2_000);

const dashboardPeriodSchema = z.object({
  days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]),
  startAt: utcTimestampSchema,
  endAt: utcTimestampSchema
}).strict().superRefine((period, context) => {
  if (Date.parse(period.startAt) > Date.parse(period.endAt)) {
    context.addIssue({ code: "custom", path: ["startAt"], message: "The period start must not follow its end." });
  }
});

const dashboardRatioSchema = z.object({
  numerator: nonNegativeIntegerSchema,
  denominator: nonNegativeIntegerSchema,
  rateBps: nullableSignedIntegerSchema
}).strict();

const comparisonMetricSchema = z.object({
  unit: z.enum(["count", "paise"]),
  timeBasis: z.literal("event_window"),
  current: nullableSignedIntegerSchema,
  previous: nullableSignedIntegerSchema,
  delta: nullableSignedIntegerSchema,
  changeBps: nullableSignedIntegerSchema,
  changeKind: z.enum(["percentage", "new", "no_change", "unavailable"]),
  currentStatus: z.enum(["available", "unavailable"]),
  previousStatus: z.enum(["available", "unavailable"]),
  currentUnavailableReason: boundedTextSchema.nullable(),
  previousUnavailableReason: boundedTextSchema.nullable()
}).strict().superRefine((metric, context) => {
  const sides = [
    ["current", metric.currentStatus, metric.current, metric.currentUnavailableReason],
    ["previous", metric.previousStatus, metric.previous, metric.previousUnavailableReason]
  ] as const;
  for (const [path, status, value, reason] of sides) {
    if (status === "available" && value === null) {
      context.addIssue({ code: "custom", path: [path], message: "Available comparison values require a number." });
    }
    if (status === "unavailable" && value !== null) {
      context.addIssue({ code: "custom", path: [path], message: "Unavailable comparison values must be null." });
    }
    if (status === "unavailable" && (!reason || reason.trim().length === 0)) {
      context.addIssue({ code: "custom", path: [`${path}UnavailableReason`], message: "Unavailable comparison values require a reason." });
    }
  }
  const bothAvailable = metric.currentStatus === "available" && metric.previousStatus === "available";
  if (bothAvailable && metric.delta === null) {
    context.addIssue({ code: "custom", path: ["delta"], message: "Comparable values require a backend delta." });
  }
  if (!bothAvailable && metric.changeKind !== "unavailable") {
    context.addIssue({ code: "custom", path: ["changeKind"], message: "An unavailable comparison side requires an unavailable change state." });
  }
});

const comparisonBucketSchema = z.object({
  dayIndex: nonNegativeIntegerSchema,
  date: utcDateSchema,
  projectsCreated: nullableNonNegativeIntegerSchema,
  clientsCreated: nullableNonNegativeIntegerSchema,
  projectsCompleted: nullableNonNegativeIntegerSchema,
  executionTasksCompleted: nullableNonNegativeIntegerSchema,
  estimatesApproved: nullableNonNegativeIntegerSchema,
  designPlansApproved: nullableNonNegativeIntegerSchema,
  recordedExpensesPaise: nullableNonNegativeIntegerSchema
}).strict();

const comparisonMetricsSchema = z.object({
  projects_created: comparisonMetricSchema,
  clients_created: comparisonMetricSchema,
  projects_completed: comparisonMetricSchema,
  execution_tasks_completed: comparisonMetricSchema,
  estimates_approved: comparisonMetricSchema,
  design_plans_approved: comparisonMetricSchema,
  recorded_expenses_paise: comparisonMetricSchema
}).strict().superRefine((metrics, context) => {
  for (const id of DASHBOARD_COUNT_COMPARISON_METRIC_IDS) {
    if (metrics[id].unit !== "count") {
      context.addIssue({ code: "custom", path: [id, "unit"], message: "Count comparison metrics must use count units." });
    }
  }
  if (metrics.recorded_expenses_paise.unit !== "paise") {
    context.addIssue({ code: "custom", path: ["recorded_expenses_paise", "unit"], message: "Recorded expenses must use paise units." });
  }
});

const comparisonSchema = z.object({
  window: z.object({
    timezone: z.literal("UTC"),
    current: dashboardPeriodSchema,
    previous: dashboardPeriodSchema,
    partialFinalDay: z.boolean()
  }).strict(),
  metrics: comparisonMetricsSchema,
  currentBuckets: z.array(comparisonBucketSchema).max(MAX_DASHBOARD_PERIOD_DAYS),
  previousBuckets: z.array(comparisonBucketSchema).max(MAX_DASHBOARD_PERIOD_DAYS)
}).strict();

const moduleCoverageShape = {
  eligibleProjects: nonNegativeIntegerSchema,
  trackedProjects: nonNegativeIntegerSchema,
  unavailableProjects: nonNegativeIntegerSchema
} as const;

const riskFactorSchema = z.object({
  kind: z.enum(DASHBOARD_RISK_FACTORS),
  level: z.enum(["green", "yellow", "red"]),
  reasonCode: z.enum(riskReasonCodes),
  reason: boundedTextSchema,
  source: z.object({
    entityType: z.enum(["project", "task", "estimate", "design_plan", "lead", "delivery"]),
    entityId: identifierSchema
  }).strict(),
  observedValue: z.union([finiteNumberSchema, boundedTextSchema, z.boolean()]).nullable(),
  threshold: z.union([finiteNumberSchema, boundedTextSchema, z.boolean()]).nullable(),
  drillDownTarget: z.string().min(1).max(1_000).startsWith("/")
}).strict();

const projectRiskSchema = z.object({
  level: z.enum(DASHBOARD_RISK_LEVELS),
  factors: z.array(riskFactorSchema)
}).strict();

const dataQualitySchema = z.object({
  status: z.enum(["complete", "partial"]),
  totalIssueCount: nonNegativeIntegerSchema,
  issues: z.array(z.object({
    code: z.enum(dataQualityIssueCodes),
    metricKey: z.string().min(1).max(256),
    message: boundedTextSchema,
    entityType: z.enum(["project", "estimate", "finance_bucket", "task", "user"]).nullable(),
    entityId: identifierSchema.nullable()
  }).strict()).max(50),
  unavailableMetricKeys: z.array(z.string().min(1).max(256))
}).strict().superRefine((quality, context) => {
  if (quality.status === "complete" && (quality.totalIssueCount > 0 || quality.unavailableMetricKeys.length > 0)) {
    context.addIssue({ code: "custom", path: ["status"], message: "Complete data quality cannot contain unavailable metrics or issues." });
  }
});

export const dashboardOverviewSchema = z.object({
  observedAt: utcTimestampSchema,
  period: dashboardPeriodSchema,
  projects: z.object({
    total: nonNegativeIntegerSchema,
    createdInPeriod: nonNegativeIntegerSchema,
    completedInPeriod: nonNegativeIntegerSchema,
    planning: nonNegativeIntegerSchema,
    active: nonNegativeIntegerSchema,
    onHold: nonNegativeIntegerSchema,
    completed: nonNegativeIntegerSchema,
    liveOverdue: nonNegativeIntegerSchema,
    completedLate: nonNegativeIntegerSchema,
    completionRate: dashboardRatioSchema,
    atRisk: nonNegativeIntegerSchema
  }).strict(),
  clients: z.object({
    accountsStatus: z.enum(["available", "unavailable"]),
    relationshipsStatus: z.enum(["available", "unavailable"]),
    accountsUnavailableReason: boundedTextSchema.nullable(),
    relationshipsUnavailableReason: boundedTextSchema.nullable(),
    registeredAccounts: nullableNonNegativeIntegerSchema,
    activeAccounts: nullableNonNegativeIntegerSchema,
    inactiveAccounts: nullableNonNegativeIntegerSchema,
    accountsCreatedInPeriod: nullableNonNegativeIntegerSchema,
    clientsWithProjects: nullableNonNegativeIntegerSchema,
    clientsWithActiveProjects: nullableNonNegativeIntegerSchema,
    unlinkedProjects: nullableNonNegativeIntegerSchema,
    invalidProjectClientLinks: nullableNonNegativeIntegerSchema
  }).strict(),
  estimation: z.object({
    ...moduleCoverageShape,
    noEstimate: nonNegativeIntegerSchema,
    draftInternal: nonNegativeIntegerSchema,
    readyToSend: nonNegativeIntegerSchema,
    awaitingClient: nonNegativeIntegerSchema,
    changesRequested: nonNegativeIntegerSchema,
    clientApproved: nonNegativeIntegerSchema,
    approvedSubtotalPaise: nonNegativeIntegerSchema,
    approvedGstPaise: nonNegativeIntegerSchema,
    approvedContractTotalPaise: nonNegativeIntegerSchema,
    medianWaitingAgeDays: nullableNonNegativeIntegerSchema,
    oldestWaitingAgeDays: nullableNonNegativeIntegerSchema
  }).strict(),
  design: z.object({
    ...moduleCoverageShape,
    pendingAssignment: nonNegativeIntegerSchema,
    assigned: nonNegativeIntegerSchema,
    inProgress: nonNegativeIntegerSchema,
    readyForClient: nonNegativeIntegerSchema,
    changesRequested: nonNegativeIntegerSchema,
    approved: nonNegativeIntegerSchema,
    approvalRate: dashboardRatioSchema,
    oldestPendingReviewAgeDays: nullableNonNegativeIntegerSchema,
    failedDeliveryCount: nonNegativeIntegerSchema,
    disabledDeliveryCount: nonNegativeIntegerSchema
  }).strict(),
  procurement: z.object({
    ...moduleCoverageShape,
    notStarted: nonNegativeIntegerSchema,
    open: nonNegativeIntegerSchema,
    inProgress: nonNegativeIntegerSchema,
    completed: nonNegativeIntegerSchema,
    plannedAmountPaise: nullableNonNegativeIntegerSchema,
    postedSpendPaise: nonNegativeIntegerSchema,
    variancePaise: nullableSignedIntegerSchema,
    averageProgress: dashboardRatioSchema
  }).strict(),
  finance: z.object({
    projectCount: nonNegativeIntegerSchema,
    approvedContractTotalPaise: nonNegativeIntegerSchema,
    approvedGstPaise: nonNegativeIntegerSchema,
    approvedSubtotalPaise: nonNegativeIntegerSchema,
    targetProfitPaise: signedIntegerSchema,
    costBudgetPaise: signedIntegerSchema,
    procurementCostPaise: nonNegativeIntegerSchema,
    employeePaymentPaise: nonNegativeIntegerSchema,
    otherExpensePaise: nonNegativeIntegerSchema,
    directSpendPaise: nonNegativeIntegerSchema,
    overheadPaise: nonNegativeIntegerSchema,
    recordedCostPaise: nonNegativeIntegerSchema,
    remainingBudgetPaise: signedIntegerSchema,
    currentProfitPaise: signedIntegerSchema,
    currentMarginBps: nullableSignedIntegerSchema,
    overBudgetProjectCount: nonNegativeIntegerSchema,
    overdueProjectCount: nonNegativeIntegerSchema,
    lateCompletedProjectCount: nonNegativeIntegerSchema,
    overdueTaskCount: nonNegativeIntegerSchema
  }).strict(),
  execution: z.object({
    total: nonNegativeIntegerSchema,
    open: nonNegativeIntegerSchema,
    inProgress: nonNegativeIntegerSchema,
    completed: nonNegativeIntegerSchema,
    completedInPeriod: nonNegativeIntegerSchema,
    overdue: nonNegativeIntegerSchema,
    unassigned: nonNegativeIntegerSchema,
    overdueUnassigned: nonNegativeIntegerSchema,
    weightedProgress: dashboardRatioSchema.extend({
      fallbackTaskCount: nonNegativeIntegerSchema
    }).strict(),
    projectDistribution: z.array(z.object({
      projectId: identifierSchema,
      taskCount: nonNegativeIntegerSchema
    }).strict()),
    roleDistribution: z.array(z.object({
      role: z.string().min(1).max(128),
      taskCount: nonNegativeIntegerSchema
    }).strict())
  }).strict(),
  workforce: z.object({
    activeWorkers: nonNegativeIntegerSchema,
    assignedWorkers: nonNegativeIntegerSchema,
    unassignedWorkers: nonNegativeIntegerSchema,
    activeAssignedTaskCount: nonNegativeIntegerSchema,
    activeUnassignedTaskCount: nonNegativeIntegerSchema,
    completedInPeriodTaskCount: nonNegativeIntegerSchema,
    overCapacityWorkers: nullableNonNegativeIntegerSchema,
    capacityAvailable: z.boolean(),
    inactiveAssigneeTaskCount: nonNegativeIntegerSchema,
    kpiEligibleWorkers: nonNegativeIntegerSchema,
    kpiUnavailableWorkers: nonNegativeIntegerSchema,
    averageKpi: dashboardRatioSchema,
    roleDistribution: z.array(z.object({
      role: z.enum(WORKER_ROLES),
      workerCount: nonNegativeIntegerSchema
    }).strict())
  }).strict(),
  governance: z.object({
    pendingInvitations: nonNegativeIntegerSchema,
    expiredInvitations: nonNegativeIntegerSchema,
    failedInvitationDeliveries: nonNegativeIntegerSchema,
    pendingAccessRequests: nonNegativeIntegerSchema,
    pendingClientResponses: nonNegativeIntegerSchema,
    pendingDesignResponses: nonNegativeIntegerSchema,
    failedClientDeliveries: nonNegativeIntegerSchema,
    disabledClientDeliveries: nonNegativeIntegerSchema,
    failedDesignDeliveries: nonNegativeIntegerSchema,
    disabledDesignDeliveries: nonNegativeIntegerSchema
  }).strict(),
  risk: z.object({
    projectDistribution: z.object({
      gray: nonNegativeIntegerSchema,
      green: nonNegativeIntegerSchema,
      yellow: nonNegativeIntegerSchema,
      red: nonNegativeIntegerSchema
    }).strict(),
    factorDistribution: z.array(z.object({
      kind: z.enum(DASHBOARD_RISK_FACTORS),
      level: z.enum(["green", "yellow", "red"]),
      reasonCode: z.enum(riskReasonCodes),
      occurrenceCount: nonNegativeIntegerSchema,
      projectCount: nonNegativeIntegerSchema
    }).strict()),
    topProjects: z.array(z.object({
      projectId: identifierSchema,
      projectName: z.string().min(1).max(500),
      projectStatus: z.enum(["planning", "active", "on_hold", "completed"]),
      risk: projectRiskSchema
    }).strict())
  }).strict(),
  trends: z.array(z.object({
    date: utcDateSchema,
    projectsCreated: nonNegativeIntegerSchema,
    projectsCompleted: nonNegativeIntegerSchema,
    estimatesApproved: nonNegativeIntegerSchema,
    designPlansApproved: nonNegativeIntegerSchema,
    workflowTasksCompleted: nonNegativeIntegerSchema,
    ledgerExpensesPostedPaise: nonNegativeIntegerSchema
  }).strict()).max(MAX_DASHBOARD_PERIOD_DAYS),
  comparison: comparisonSchema,
  dataQuality: dataQualitySchema
}).strict().superRefine((overview, context) => {
  const current = overview.comparison.window.current;
  const previous = overview.comparison.window.previous;
  if (
    current.days !== overview.period.days ||
    current.startAt !== overview.period.startAt ||
    current.endAt !== overview.period.endAt
  ) {
    context.addIssue({ code: "custom", path: ["comparison", "window", "current"], message: "The comparison current window must match the dashboard period." });
  }
  if (previous.days !== overview.period.days) {
    context.addIssue({ code: "custom", path: ["comparison", "window", "previous", "days"], message: "Comparison windows must use the selected period." });
  }
  for (const bucketSide of ["currentBuckets", "previousBuckets"] as const) {
    const buckets = overview.comparison[bucketSide];
    if (buckets.length !== overview.period.days) {
      context.addIssue({ code: "custom", path: ["comparison", bucketSide], message: "Comparison buckets must cover every selected day." });
    }
    buckets.forEach((bucket, index) => {
      if (bucket.dayIndex !== index) {
        context.addIssue({ code: "custom", path: ["comparison", bucketSide, index, "dayIndex"], message: "Comparison day indexes must be stable and contiguous." });
      }
    });
  }
});

export type DashboardOverview = z.infer<typeof dashboardOverviewSchema>;
export type ParsedDashboardOverview = DashboardOverview;
export type DashboardComparisonMetric = DashboardOverview["comparison"]["metrics"][DashboardComparisonMetricId];
export type DashboardDataQuality = DashboardOverview["dataQuality"];

export class InvalidDashboardResponseError extends Error {
  readonly code = "INVALID_DASHBOARD_RESPONSE";

  constructor() {
    super("The dashboard service returned an invalid response.");
    this.name = "InvalidDashboardResponseError";
  }
}

export function parseDashboardOverview(input: unknown): ParsedDashboardOverview {
  const parsed = dashboardOverviewSchema.safeParse(input);
  if (!parsed.success) throw new InvalidDashboardResponseError();
  return parsed.data;
}
