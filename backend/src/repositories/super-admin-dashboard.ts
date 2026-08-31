import type {
  DashboardDataQuality,
  DashboardFactorDistributionItem,
  DashboardFinanceMetrics,
  DashboardPeriod,
  DashboardProjectFilters,
  DashboardProjectRow,
  DashboardRiskFactor,
  DashboardRiskFactorKind,
  DashboardTrendBucket,
  DashboardTopRiskProject,
  DashboardWorkforceFilters,
  DashboardWorkforceMetrics,
  DashboardWorkforceRow,
  SuperAdminDashboardOverview
} from "../contracts/super-admin-dashboard.js";
import {
  dashboardFactorDistribution,
  dashboardRatio,
  dashboardTaskRiskFactor,
  dashboardWeightedProgress,
  financeRiskFactors,
  overallDashboardRisk,
  riskFactor
} from "../domain/super-admin-dashboard.js";
import { resolveEstimateReviewRoundId } from "../domain/estimate-client-review.js";
import {
  MAX_FINANCE_AMOUNT_PAISE,
  PROJECT_FINANCE_TARGET_MARGIN_BPS,
  projectFinanceBaseline
} from "../domain/project-finance.js";
import {
  WORKFLOW_TASK_SCHEDULE,
  workflowTaskDueAt,
  type ProjectWorkflowTaskKind
} from "../domain/project-workflow.js";
import { WORKER_ROLES, type WorkerRole } from "../domain/roles.js";
import {
  TASK_RISK_DUE_SOON_MS,
  TASK_RISK_MIN_SCHEDULE_BUFFER
} from "../domain/risk.js";
import type { PipelineStage } from "mongoose";
import { AccessRequestModel } from "../models/AccessRequest.js";
import { EstimateModel } from "../models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { DesignPlanReviewRoundModel } from "../models/DesignPlanReviewRound.js";
import { FinanceLedgerEntryModel } from "../models/FinanceLedgerEntry.js";
import { LeadModel } from "../models/Lead.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectFinanceBucketModel } from "../models/ProjectFinanceBucket.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { TaskModel } from "../models/Task.js";
import { UserInvitationModel } from "../models/UserInvitation.js";
import { UserModel } from "../models/User.js";
import {
  readProjectFinanceDashboardProjects,
  readProjectFinancePortfolioReport,
  type ProjectFinanceBucketDto
} from "../services/project-finance.service.js";
import {
  procurementDashboardProjection,
  readProcurementDashboardApprovalRounds,
  readProcurementDashboardPortfolioReport,
  type ProcurementDashboardProjection
} from "../services/procurement.service.js";
import type {
  DashboardPageResult,
  EstimateSummaryRecord,
  ProjectRecord,
  SeedData,
  TaskRecord,
  UserRecord
} from "./types.js";

export function memorySuperAdminDashboardOverview(
  state: SeedData,
  input: { observedAt: string; startAt: string; endAt: string; periodDays: 7 | 30 | 90 }
): SuperAdminDashboardOverview {
  const observedAt = new Date(input.observedAt);
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  const projects = state.projects;
  const rows = memoryProjectRows(state, input.observedAt);
  const estimates = canonicalEstimatesByProject(state);
  const activeWorkers = state.users.filter((user) =>
    user.active && (WORKER_ROLES as readonly string[]).includes(user.role)
  );
  const approvedBaselines = [...estimates.values()].flatMap((estimate) =>
    estimate.status === "client_approved" && estimate.approvedBaseline
      ? [projectFinanceBaseline({
          subtotalRupees: estimate.approvedBaseline.subtotal,
          gstRupees: estimate.approvedBaseline.gst,
          totalRupees: estimate.approvedBaseline.total
        })]
      : []
  );
  const finance = approvedBaselines.reduce<DashboardFinanceMetrics>(
    (summary, baseline) => {
      summary.projectCount += 1;
      summary.approvedContractTotalPaise += baseline.approvedContractTotalPaise;
      summary.approvedGstPaise += baseline.approvedGstPaise;
      summary.approvedSubtotalPaise += baseline.approvedSubtotalPaise;
      summary.targetProfitPaise += baseline.targetProfitPaise;
      summary.costBudgetPaise += baseline.costBudgetPaise;
      summary.remainingBudgetPaise += baseline.costBudgetPaise;
      summary.currentProfitPaise += baseline.approvedSubtotalPaise;
      return summary;
    },
    emptyFinance()
  );
  finance.currentMarginBps = finance.approvedSubtotalPaise === 0
    ? null
    : Math.round(finance.currentProfitPaise * 10_000 / finance.approvedSubtotalPaise);

  const estimateStatuses = [...estimates.values()];
  const waitingAges = estimateStatuses
    .filter((estimate) => estimate.status === "sent_to_client")
    .map((estimate) => elapsedDays(estimate.updatedAt, input.observedAt))
    .sort((left, right) => left - right);
  const designEligible = estimateStatuses.filter(
    (estimate) => estimate.designPlanStatus != null
  );
  const approvedDesign = designEligible.filter(
    (estimate) => estimate.designPlanStatus === "approved"
  );
  const projectRiskEntries = rows.map((row) => ({
    projectId: row.projectId,
    factors: row.risk.factors
  }));
  const riskDistribution = { gray: 0, green: 0, yellow: 0, red: 0 };
  for (const row of rows) riskDistribution[row.risk.level] += 1;
  const trends = trendBuckets(input.periodDays, startAt, projects, estimateStatuses);
  const statusCount = (status: ProjectRecord["status"]) =>
    projects.filter((project) => project.status === status).length;
  const clientChanges = estimateStatuses.filter(
    (estimate) => estimate.status === "client_changes_requested"
  ).length;
  const designChanges = designEligible.filter(
    (estimate) => estimate.designPlanStatus === "changes_requested"
  ).length;
  const activeProjectTasks = state.tasks.filter((task) => task.status !== "completed");

  return {
    observedAt: input.observedAt,
    period: period(input),
    projects: {
      total: projects.length,
      createdInPeriod: projects.filter((project) => within(project.createdAt, startAt, endAt)).length,
      planning: statusCount("planning"),
      active: statusCount("active"),
      onHold: statusCount("on_hold"),
      completed: statusCount("completed"),
      liveOverdue: projects.filter((project) =>
        project.status !== "completed" && new Date(project.plannedEndAt) < observedAt
      ).length,
      completedLate: projects.filter((project) =>
        project.status === "completed" && project.actualEndAt !== null &&
        new Date(project.actualEndAt) > new Date(project.plannedEndAt)
      ).length,
      completionRate: dashboardRatio(statusCount("completed"), projects.length),
      atRisk: rows.filter((row) => row.risk.level === "red" || row.risk.level === "yellow").length
    },
    estimation: {
      eligibleProjects: projects.length,
      trackedProjects: estimateStatuses.length,
      unavailableProjects: projects.length - estimateStatuses.length,
      noEstimate: projects.length - estimateStatuses.length,
      draftInternal: estimateStatuses.filter((estimate) => [
        "draft", "pending_manager_assignment", "pending_designer_approval",
        "designer_changes_requested"
      ].includes(estimate.status)).length,
      readyToSend: estimateStatuses.filter((estimate) => estimate.status === "ready_for_client").length,
      awaitingClient: estimateStatuses.filter((estimate) => estimate.status === "sent_to_client").length,
      changesRequested: clientChanges,
      clientApproved: approvedBaselines.length,
      approvedSubtotalPaise: finance.approvedSubtotalPaise,
      approvedGstPaise: finance.approvedGstPaise,
      approvedContractTotalPaise: finance.approvedContractTotalPaise,
      medianWaitingAgeDays: median(waitingAges),
      oldestWaitingAgeDays: waitingAges.at(-1) ?? null
    },
    design: {
      eligibleProjects: approvedBaselines.length,
      trackedProjects: designEligible.length,
      unavailableProjects: Math.max(0, approvedBaselines.length - designEligible.length),
      pendingAssignment: designEligible.filter((estimate) => estimate.designPlanStatus === "pending_assignment").length,
      assigned: designEligible.filter((estimate) => estimate.designPlanStatus === "assigned").length,
      inProgress: designEligible.filter((estimate) => estimate.designPlanStatus === "in_progress").length,
      readyForClient: designEligible.filter((estimate) => estimate.designPlanStatus === "ready_for_client").length,
      changesRequested: designChanges,
      approved: approvedDesign.length,
      approvalRate: dashboardRatio(approvedDesign.length, approvedBaselines.length),
      oldestPendingReviewAgeDays: null,
      failedDeliveryCount: 0,
      disabledDeliveryCount: 0
    },
    procurement: {
      eligibleProjects: approvedDesign.length,
      trackedProjects: 0,
      unavailableProjects: approvedDesign.length,
      notStarted: approvedDesign.length,
      open: 0,
      inProgress: 0,
      completed: 0,
      plannedAmountPaise: null,
      postedSpendPaise: 0,
      variancePaise: null,
      averageProgress: dashboardRatio(0, 0)
    },
    finance,
    execution: {
      total: 0, open: 0, inProgress: 0, completed: 0, completedInPeriod: 0,
      overdue: 0, unassigned: 0, overdueUnassigned: 0,
      weightedProgress: dashboardWeightedProgress([]),
      projectDistribution: [], roleDistribution: []
    },
    workforce: {
      activeWorkers: activeWorkers.length,
      assignedWorkers: 0,
      unassignedWorkers: activeWorkers.length,
      activeAssignedTaskCount: 0,
      activeUnassignedTaskCount: 0,
      completedInPeriodTaskCount: 0,
      overCapacityWorkers: null,
      capacityAvailable: false,
      inactiveAssigneeTaskCount: 0,
      kpiEligibleWorkers: 0,
      kpiUnavailableWorkers: activeWorkers.length,
      averageKpi: dashboardRatio(0, 0),
      roleDistribution: workerRoleDistribution(activeWorkers)
    },
    governance: {
      pendingInvitations: state.userInvitations.filter((item) =>
        item.status === "pending" && new Date(item.expiresAt) >= observedAt
      ).length,
      expiredInvitations: state.userInvitations.filter((item) =>
        item.status === "pending" && new Date(item.expiresAt) < observedAt
      ).length,
      failedInvitationDeliveries: state.userInvitations.filter((item) => item.deliveryStatus === "failed").length,
      pendingAccessRequests: state.accessRequests.filter((item) => item.status === "pending").length,
      pendingClientResponses: estimateStatuses.filter((item) => item.clientReview?.status === "pending").length,
      pendingDesignResponses: designEligible.filter((item) => item.designPlanStatus === "ready_for_client").length,
      failedClientDeliveries: 0,
      disabledClientDeliveries: 0,
      failedDesignDeliveries: 0,
      disabledDesignDeliveries: 0
    },
    risk: {
      projectDistribution: riskDistribution,
      factorDistribution: dashboardFactorDistribution(projectRiskEntries),
      topProjects: rows
        .filter((row) => row.risk.level === "red" || row.risk.level === "yellow")
        .sort(compareProjectRows)
        .slice(0, 10)
        .map((row) => ({
          projectId: row.projectId,
          projectName: row.projectName,
          projectStatus: row.projectStatus,
          risk: boundedProjectRisk(row.risk)
        }))
    },
    trends,
    dataQuality: unavailableDataQuality([
      "design.oldestPendingReviewAgeDays", "design.failedDeliveryCount",
      "design.disabledDeliveryCount",
      "procurement.trackedProjects", "procurement.unavailableProjects",
      "procurement.notStarted", "procurement.open", "procurement.inProgress",
      "procurement.completed", "procurement.approvedAmountPaise",
      "procurement.postedSpendPaise", "procurement.variancePaise",
      "procurement.averageProgress",
      "finance.procurementCostPaise", "finance.employeePaymentPaise",
      "finance.otherExpensePaise", "finance.directSpendPaise", "finance.overheadPaise",
      "finance.recordedCostPaise", "finance.remainingBudgetPaise",
      "finance.currentProfitPaise", "finance.currentMarginBps",
      "finance.overBudgetProjectCount", "finance.overdueProjectCount",
      "finance.lateCompletedProjectCount", "finance.overdueTaskCount",
      ...DASHBOARD_SOURCE_DEPENDENCIES.execution,
      "workforce.capacity",
      "workforce.assignedWorkers", "workforce.unassignedWorkers",
      "workforce.activeAssignedTaskCount", "workforce.activeUnassignedTaskCount",
      "workforce.completedInPeriodTaskCount", "workforce.inactiveAssigneeTaskCount",
      "workforce.kpiEligibleWorkers", "workforce.kpiUnavailableWorkers",
      "workforce.averageKpi",
      "governance.failedClientDeliveries", "governance.disabledClientDeliveries",
      "governance.failedDesignDeliveries", "governance.disabledDesignDeliveries",
      "trends.designPlansApproved", "trends.workflowTasksCompleted",
      "trends.ledgerExpensesPostedPaise",
      "risk.projectDistribution", "risk.factorDistribution", "risk.topProjects",
      "projects.atRisk",
      ...(memoryRiskFactorsMayBeTruncated(state)
        ? ["risk.factorDistribution", "risk.topProjects.factors"]
        : [])
    ])
  };
}

export function memorySuperAdminDashboardProjects(
  state: SeedData,
  observedAt: string,
  filters: DashboardProjectFilters
): DashboardPageResult<DashboardProjectRow> {
  let rows = memoryProjectRows(state, observedAt).filter((row) => {
    if (filters.module && !projectMatchesModule(row, filters.module)) return false;
    if (filters.projectStatus && row.projectStatus !== filters.projectStatus) return false;
    if (filters.riskLevel && row.risk.level !== filters.riskLevel) return false;
    if (filters.riskFactor && !row.risk.factors.some((factor) => factor.kind === filters.riskFactor)) return false;
    if (filters.search) {
      const search = filters.search.toLocaleLowerCase();
      if (!`${row.projectName} ${row.location}`.toLocaleLowerCase().includes(search)) return false;
    }
    if (filters.moduleStatus && !projectHasModuleStatus(row, filters.moduleStatus, filters.module)) return false;
    return true;
  });
  rows = rows.sort(filters.sort === "name_asc"
    ? (left, right) => left.projectName.localeCompare(right.projectName) || left.projectId.localeCompare(right.projectId)
    : filters.sort === "created_desc"
      ? (left, right) => right.projectId.localeCompare(left.projectId)
      : filters.sort === "deadline_asc"
        ? (left, right) => left.plannedEndAt.localeCompare(right.plannedEndAt) || left.projectId.localeCompare(right.projectId)
        : compareProjectRows);
  return {
    items: rows.slice(filters.offset, filters.offset + filters.limit).map((row) => ({
      ...row,
      risk: boundedProjectRisk(row.risk)
    })),
    total: rows.length,
    dataQuality: unavailableDataQuality([
      ...DASHBOARD_PROJECT_FINANCE_KEYS,
      ...projectProcurementMetricKeys(""),
      "execution.taskCount", "execution.overdueTaskCount", "execution.weightedProgress",
      ...(memoryRiskFactorsMayBeTruncated(state)
        ? ["risk.factorDistribution", "risk.projectDistribution"]
        : [])
    ])
  };
}

export function memorySuperAdminDashboardWorkforce(
  state: SeedData,
  input: { filters: DashboardWorkforceFilters }
): DashboardPageResult<DashboardWorkforceRow> {
  let rows: DashboardWorkforceRow[] = state.users.flatMap((user) =>
    user.active && (WORKER_ROLES as readonly string[]).includes(user.role)
      ? [{
          workerId: user.id,
          workerName: user.name,
          role: user.role as WorkerRole,
          assignmentState: "unassigned" as const,
          activeTaskCount: 0,
          completedInPeriod: 0,
          plannedEffort: 0,
          completedEffort: 0,
          remainingEffort: 0,
          remainingWorkloadPercentage: 0,
          capacityEffort: null,
          capacityAvailable: false,
          capacityState: "unavailable" as const,
          kpi: { availability: "unavailable" as const, scoreBps: null, eligibleComponentCount: 0 }
        }]
      : []
  );
  const { filters } = input;
  rows = rows.filter((row) =>
    (!filters.role || row.role === filters.role) &&
    (!filters.assignmentState || row.assignmentState === filters.assignmentState) &&
    (!filters.capacityState || row.capacityState === filters.capacityState) &&
    (!filters.kpiAvailability || row.kpi.availability === filters.kpiAvailability) &&
    (!filters.search || row.workerName.toLocaleLowerCase().includes(filters.search.toLocaleLowerCase()))
  );
  rows.sort((left, right) => left.workerName.localeCompare(right.workerName) || left.workerId.localeCompare(right.workerId));
  return {
    items: rows.slice(filters.offset, filters.offset + filters.limit),
    total: rows.length,
    dataQuality: unavailableDataQuality([
      "workforce.capacity",
      "workforce.assignmentState",
      "workforce.activeTaskCount",
      "workforce.completedInPeriod",
      "workforce.workload",
      "workforce.kpi"
    ])
  };
}

type MongoRow = Record<string, any>;

function mongoCanonicalEstimateStages(): PipelineStage[] {
  return [
    {
      $lookup: {
        from: LeadModel.collection.name,
        let: { projectId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$projectId", "$$projectId"] } } },
          { $project: { _id: 1, projectId: 1, stage: 1, nextActionAt: 1 } },
          { $limit: 2 }
        ],
        as: "_dashboardCanonicalLeads"
      }
    },
    {
      $lookup: {
        from: EstimateModel.collection.name,
        let: { projectId: "$_id", leadIds: "$_dashboardCanonicalLeads._id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $in: ["$leadId", "$$leadIds"] },
                  {
                    $or: [
                      { $eq: [{ $ifNull: ["$projectId", null] }, null] },
                      { $eq: ["$projectId", "$$projectId"] }
                    ]
                  }
                ]
              }
            }
          },
          { $set: { _approvedRank: { $cond: [{ $eq: ["$status", "client_approved"] }, 1, 0] } } },
          { $sort: { _approvedRank: -1, clientDecisionAt: -1, updatedAt: -1, _id: 1 } },
          { $limit: 1 }
        ],
        as: "_dashboardCanonicalEstimates"
      }
    },
    {
      $set: {
        _dashboardCanonicalEstimate: {
          $arrayElemAt: ["$_dashboardCanonicalEstimates", 0]
        }
      }
    }
  ];
}

async function mongoCanonicalModuleMetrics(): Promise<MongoRow> {
  const [row] = await ProjectModel.aggregate<MongoRow>([
    ...mongoCanonicalEstimateStages(),
    {
      $group: {
        _id: null,
        tracked: {
          $sum: { $cond: [{ $ne: [{ $ifNull: ["$_dashboardCanonicalEstimate._id", null] }, null] }, 1, 0] }
        },
        draftInternal: { $sum: { $cond: [{ $in: ["$_dashboardCanonicalEstimate.status", ["draft", "pending_manager_assignment", "pending_designer_approval", "designer_changes_requested"]] }, 1, 0] } },
        readyToSend: { $sum: { $cond: [{ $eq: ["$_dashboardCanonicalEstimate.status", "ready_for_client"] }, 1, 0] } },
        awaitingClient: { $sum: { $cond: [{ $eq: ["$_dashboardCanonicalEstimate.status", "sent_to_client"] }, 1, 0] } },
        changesRequested: { $sum: { $cond: [{ $eq: ["$_dashboardCanonicalEstimate.status", "client_changes_requested"] }, 1, 0] } },
        clientApproved: { $sum: { $cond: [{ $eq: ["$_dashboardCanonicalEstimate.status", "client_approved"] }, 1, 0] } },
        designEligible: { $sum: { $cond: [{ $eq: ["$_dashboardCanonicalEstimate.status", "client_approved"] }, 1, 0] } },
        designTracked: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$_dashboardCanonicalEstimate.status", "client_approved"] },
                  { $ne: [{ $ifNull: ["$_dashboardCanonicalEstimate.designPlanStatus", null] }, null] }
                ]
              },
              1,
              0
            ]
          }
        },
        pendingAssignment: { $sum: { $cond: [{ $eq: ["$_dashboardCanonicalEstimate.designPlanStatus", "pending_assignment"] }, 1, 0] } },
        assigned: { $sum: { $cond: [{ $eq: ["$_dashboardCanonicalEstimate.designPlanStatus", "assigned"] }, 1, 0] } },
        designInProgress: { $sum: { $cond: [{ $eq: ["$_dashboardCanonicalEstimate.designPlanStatus", "in_progress"] }, 1, 0] } },
        designReady: { $sum: { $cond: [{ $eq: ["$_dashboardCanonicalEstimate.designPlanStatus", "ready_for_client"] }, 1, 0] } },
        designChanges: { $sum: { $cond: [{ $eq: ["$_dashboardCanonicalEstimate.designPlanStatus", "changes_requested"] }, 1, 0] } },
        designApproved: { $sum: { $cond: [{ $eq: ["$_dashboardCanonicalEstimate.designPlanStatus", "approved"] }, 1, 0] } },
        procurementEligible: { $sum: { $cond: [{ $eq: ["$_dashboardCanonicalEstimate.designPlanStatus", "approved"] }, 1, 0] } }
      }
    }
  ] as PipelineStage[]).exec();
  return row ?? {};
}

async function mongoCanonicalProcurementMetrics(): Promise<MongoRow> {
  const [row] = await ProjectWorkflowTaskModel.aggregate<MongoRow>([
    { $match: { kind: "procurement" } },
    {
      $lookup: {
        from: ProjectModel.collection.name,
        localField: "projectId",
        foreignField: "_id",
        as: "project"
      }
    },
    {
      $lookup: {
        from: EstimateModel.collection.name,
        localField: "estimateId",
        foreignField: "_id",
        as: "estimate"
      }
    },
    { $set: { project: { $arrayElemAt: ["$project", 0] }, estimate: { $arrayElemAt: ["$estimate", 0] } } },
    {
      $lookup: {
        from: LeadModel.collection.name,
        localField: "estimate.leadId",
        foreignField: "_id",
        as: "lead"
      }
    },
    { $set: { lead: { $arrayElemAt: ["$lead", 0] } } },
    {
      $match: {
        "project._id": { $exists: true },
        "estimate.designPlanStatus": "approved",
        $expr: {
          $and: [
            { $eq: [{ $ifNull: ["$estimate.projectId", "$lead.projectId"] }, "$projectId"] },
            { $eq: ["$estimate._id", "$estimateId"] },
            { $eq: ["$estimate.designPlanVersion", "$designPlanVersion"] }
          ]
        }
      }
    },
    {
      $group: {
        _id: "$projectId",
        open: { $max: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] } },
        inProgress: { $max: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } },
        completed: { $max: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        progressNumerator: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 100, "$progress"] } },
        progressDenominator: { $sum: 100 }
      }
    },
    {
      $group: {
        _id: null,
        trackedProjects: { $sum: 1 },
        open: { $sum: "$open" },
        inProgress: { $sum: "$inProgress" },
        completed: { $sum: "$completed" },
        progressNumerator: { $sum: "$progressNumerator" },
        progressDenominator: { $sum: "$progressDenominator" }
      }
    }
  ] as PipelineStage[]).exec();
  return row ?? {};
}

async function mongoCanonicalApprovalTrends(
  startAt: Date,
  endAt: Date
): Promise<MongoRow[]> {
  return EstimateModel.aggregate<MongoRow>([
    {
      $lookup: {
        from: LeadModel.collection.name,
        localField: "leadId",
        foreignField: "_id",
        as: "lead"
      }
    },
    { $set: { lead: { $arrayElemAt: ["$lead", 0] } } },
    {
      $set: {
        resolvedProjectId: { $ifNull: ["$projectId", "$lead.projectId"] },
        lineageValid: {
          $or: [
            { $eq: [{ $ifNull: ["$projectId", null] }, null] },
            { $eq: ["$projectId", "$lead.projectId"] }
          ]
        }
      }
    },
    {
      $lookup: {
        from: ProjectModel.collection.name,
        localField: "resolvedProjectId",
        foreignField: "_id",
        as: "project"
      }
    },
    { $match: { lineageValid: true, "project.0": { $exists: true } } },
    {
      $project: {
        events: {
          $concatArrays: [
            {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "client_approved"] },
                    { $gte: ["$clientDecisionAt", startAt] },
                    { $lte: ["$clientDecisionAt", endAt] }
                  ]
                },
                [{ type: "estimate", at: "$clientDecisionAt" }],
                []
              ]
            },
            {
              $cond: [
                {
                  $and: [
                    { $eq: ["$designPlanStatus", "approved"] },
                    { $gte: ["$designPlanApprovedAt", startAt] },
                    { $lte: ["$designPlanApprovedAt", endAt] }
                  ]
                },
                [{ type: "design", at: "$designPlanApprovedAt" }],
                []
              ]
            }
          ]
        }
      }
    },
    { $unwind: "$events" },
    {
      $group: {
        _id: {
          type: "$events.type",
          day: { $dateToString: { format: "%Y-%m-%d", date: "$events.at", timezone: "UTC" } }
        },
        count: { $sum: 1 }
      }
    }
  ] as PipelineStage[]).exec();
}

export async function mongoSuperAdminDashboardOverview(input: {
  observedAt: string;
  startAt: string;
  endAt: string;
  periodDays: 7 | 30 | 90;
  /** Repository-only deterministic failure seam used to prove partial-read isolation. */
  failureInjection?: readonly DashboardOverviewSource[];
}): Promise<SuperAdminDashboardOverview> {
  const observedAt = new Date(input.observedAt);
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  const executionKinds = ["site_execution", "trade_execution"];
  const effortExpression = {
    $cond: [
      { $gt: ["$plannedEffort", 0] },
      "$plannedEffort",
      {
        $switch: {
          branches: [
            { case: { $eq: ["$kind", "site_execution"] }, then: WORKFLOW_TASK_SCHEDULE.site_execution.plannedEffort },
            { case: { $eq: ["$kind", "trade_execution"] }, then: WORKFLOW_TASK_SCHEDULE.trade_execution.plannedEffort }
          ],
          default: 1
        }
      }
    ]
  };
  const dueAtExpression = {
    $ifNull: [
      "$dueAt",
      {
        $dateAdd: {
          startDate: "$openedAt",
          unit: "day",
          amount: {
            $switch: {
              branches: [
                { case: { $eq: ["$kind", "site_execution"] }, then: WORKFLOW_TASK_SCHEDULE.site_execution.dueInDays },
                { case: { $eq: ["$kind", "trade_execution"] }, then: WORKFLOW_TASK_SCHEDULE.trade_execution.dueInDays }
              ],
              default: 0
            }
          }
        }
      }
    ]
  };
  const moduleResults = await Promise.allSettled([
    ProjectModel.aggregate<MongoRow>([{
      $group: {
        _id: null,
        total: { $sum: 1 },
        createdInPeriod: { $sum: { $cond: [{ $and: [{ $gte: ["$createdAt", startAt] }, { $lte: ["$createdAt", endAt] }] }, 1, 0] } },
        planning: { $sum: { $cond: [{ $eq: ["$status", "planning"] }, 1, 0] } },
        active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
        onHold: { $sum: { $cond: [{ $eq: ["$status", "on_hold"] }, 1, 0] } },
        completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        liveOverdue: { $sum: { $cond: [{ $and: [{ $ne: ["$status", "completed"] }, { $lt: ["$plannedEndAt", observedAt] }] }, 1, 0] } },
        completedLate: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "completed"] }, { $gt: ["$actualEndAt", "$plannedEndAt"] }] }, 1, 0] } }
      }
    }]).exec(),
    ProjectWorkflowTaskModel.aggregate<MongoRow>([
      { $match: { kind: { $in: executionKinds } } },
      { $lookup: { from: ProjectModel.collection.name, localField: "projectId", foreignField: "_id", as: "_dashboardProject" } },
      { $match: { "_dashboardProject.0": { $exists: true } } },
      { $group: {
        _id: null,
        total: { $sum: 1 },
        open: { $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } },
        completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        completedInPeriod: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "completed"] }, { $gte: ["$completedAt", startAt] }, { $lte: ["$completedAt", endAt] }] }, 1, 0] } },
        overdue: { $sum: { $cond: [{ $and: [{ $ne: ["$status", "completed"] }, { $lt: [dueAtExpression, observedAt] }] }, 1, 0] } },
        unassigned: { $sum: { $cond: [{ $and: [{ $ne: ["$status", "completed"] }, { $eq: [{ $ifNull: ["$assigneeUserId", null] }, null] }] }, 1, 0] } },
        overdueUnassigned: { $sum: { $cond: [{ $and: [{ $ne: ["$status", "completed"] }, { $eq: [{ $ifNull: ["$assigneeUserId", null] }, null] }, { $lt: [dueAtExpression, observedAt] }] }, 1, 0] } },
        progressNumerator: { $sum: { $multiply: [{ $cond: [{ $eq: ["$status", "completed"] }, 100, "$progress"] }, effortExpression] } },
        progressDenominator: { $sum: { $multiply: [100, effortExpression] } },
        fallbackTaskCount: { $sum: { $cond: [{ $gt: ["$plannedEffort", 0] }, 0, 1] } },
        activeAssignedTaskCount: { $sum: { $cond: [{ $and: [{ $ne: ["$status", "completed"] }, { $ne: [{ $ifNull: ["$assigneeUserId", null] }, null] }] }, 1, 0] } },
        completedInPeriodTaskCount: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "completed"] }, { $gte: ["$completedAt", startAt] }, { $lte: ["$completedAt", endAt] }] }, 1, 0] } }
      } }
    ]).exec(),
    ProjectWorkflowTaskModel.aggregate<MongoRow>([
      { $match: { kind: { $in: executionKinds } } },
      { $lookup: { from: ProjectModel.collection.name, localField: "projectId", foreignField: "_id", as: "_dashboardProject" } },
      { $match: { "_dashboardProject.0": { $exists: true } } },
      { $group: { _id: "$projectId", taskCount: { $sum: 1 } } },
      { $sort: { taskCount: -1, _id: 1 } }, { $limit: 51 }
    ]).exec(),
    ProjectWorkflowTaskModel.aggregate<MongoRow>([
      { $match: { kind: { $in: executionKinds } } },
      { $lookup: { from: ProjectModel.collection.name, localField: "projectId", foreignField: "_id", as: "_dashboardProject" } },
      { $match: { "_dashboardProject.0": { $exists: true } } },
      { $group: { _id: "$assigneeRole", taskCount: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]).exec(),
    UserInvitationModel.aggregate<MongoRow>([{
      $group: {
        _id: null,
        pending: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "pending"] }, { $gte: ["$expiresAt", observedAt] }] }, 1, 0] } },
        expired: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "pending"] }, { $lt: ["$expiresAt", observedAt] }] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ["$deliveryStatus", "failed"] }, 1, 0] } }
      }
    }]).exec(),
    AccessRequestModel.countDocuments({ status: "pending" }).exec(),
    EstimateClientReviewRoundModel.aggregate<MongoRow>([
      { $lookup: { from: ProjectModel.collection.name, localField: "projectId", foreignField: "_id", as: "project" } },
      { $lookup: { from: EstimateModel.collection.name, localField: "estimateId", foreignField: "_id", as: "estimate" } },
      { $set: { estimate: { $arrayElemAt: ["$estimate", 0] } } },
      { $lookup: { from: LeadModel.collection.name, localField: "estimate.leadId", foreignField: "_id", as: "lead" } },
      { $set: { lead: { $arrayElemAt: ["$lead", 0] } } },
      {
        $match: {
          "project.0": { $exists: true },
          "estimate._id": { $exists: true },
          $expr: {
            $and: [
              { $eq: [{ $ifNull: ["$estimate.projectId", "$lead.projectId"] }, "$projectId"] },
              { $lte: ["$estimateVersion", "$estimate.version"] }
            ]
          }
        }
      },
      {
      $group: {
        _id: null,
        pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ["$deliveryStatus", "failed"] }, 1, 0] } },
        disabled: { $sum: { $cond: [{ $eq: ["$deliveryStatus", "disabled"] }, 1, 0] } }
      }
    }]).exec(),
    DesignPlanReviewRoundModel.aggregate<MongoRow>([
      { $lookup: { from: ProjectModel.collection.name, localField: "projectId", foreignField: "_id", as: "project" } },
      { $lookup: { from: EstimateModel.collection.name, localField: "estimateId", foreignField: "_id", as: "estimate" } },
      { $set: { estimate: { $arrayElemAt: ["$estimate", 0] } } },
      { $lookup: { from: LeadModel.collection.name, localField: "estimate.leadId", foreignField: "_id", as: "lead" } },
      { $set: { lead: { $arrayElemAt: ["$lead", 0] } } },
      {
        $match: {
          "project.0": { $exists: true },
          "estimate._id": { $exists: true },
          $expr: {
            $and: [
              { $eq: [{ $ifNull: ["$estimate.projectId", "$lead.projectId"] }, "$projectId"] },
              { $eq: ["$designPlanVersion", "$estimate.designPlanVersion"] }
            ]
          }
        }
      },
      {
      $group: {
        _id: null,
        pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ["$deliveryStatus", "failed"] }, 1, 0] } },
        disabled: { $sum: { $cond: [{ $eq: ["$deliveryStatus", "disabled"] }, 1, 0] } },
        oldestPendingAt: { $min: { $cond: [{ $eq: ["$status", "pending"] }, "$submittedAt", null] } }
      }
    }]).exec(),
    ProjectModel.aggregate<MongoRow>([
      { $match: { $or: [{ createdAt: { $gte: startAt, $lte: endAt } }, { actualEndAt: { $gte: startAt, $lte: endAt } }] } },
      { $project: { createdDay: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } }, completedDay: { $cond: [{ $ne: ["$actualEndAt", null] }, { $dateToString: { format: "%Y-%m-%d", date: "$actualEndAt", timezone: "UTC" } }, null] } } },
      { $group: { _id: null, createdDays: { $push: "$createdDay" }, completedDays: { $push: "$completedDay" } } }
    ]).exec(),
    ProjectWorkflowTaskModel.aggregate<MongoRow>([
      { $match: { status: "completed", completedAt: { $gte: startAt, $lte: endAt } } },
      { $lookup: { from: ProjectModel.collection.name, localField: "projectId", foreignField: "_id", as: "_dashboardProject" } },
      { $match: { "_dashboardProject.0": { $exists: true } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt", timezone: "UTC" } }, count: { $sum: 1 } } }
    ]).exec(),
    FinanceLedgerEntryModel.aggregate<MongoRow>([
      { $match: { status: "posted", incurredAt: { $gte: startAt, $lte: endAt } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$incurredAt", timezone: "UTC" } }, amountPaise: { $sum: "$amountPaise" } } }
    ]).exec()
  ]);
  const baseProjectResult = moduleResults[0];
  if (!baseProjectResult || baseProjectResult.status === "rejected") {
    throw baseProjectResult?.reason ?? new Error("Dashboard Project aggregate failed.");
  }
  const forcedFailures = new Set(input.failureInjection ?? []);
  const moduleFailureQualities: DashboardDataQuality[] = [];
  const moduleValue = <T>(index: number, source: DashboardOverviewSource, metricKeys: readonly string[], fallback: T): T => {
    const result = moduleResults[index];
    if (!forcedFailures.has(source) && result?.status === "fulfilled") return result.value as T;
    moduleFailureQualities.push(sourceFailureDataQuality(source, metricKeys));
    return fallback;
  };
  const projectRows = baseProjectResult.value as MongoRow[];
  const executionRows = moduleValue<MongoRow[]>(1, "execution", DASHBOARD_SOURCE_DEPENDENCIES.execution, []);
  const projectTaskDistributionRows = moduleValue<MongoRow[]>(2, "execution", ["execution.projectDistribution"], []);
  const projectTaskDistribution = projectTaskDistributionRows.slice(0, 50);
  if (projectTaskDistributionRows.length > 50) {
    moduleFailureQualities.push(boundedReadDataQuality(["execution.projectDistribution"]));
  }
  const roleTaskDistribution = moduleValue<MongoRow[]>(3, "execution", ["execution.roleDistribution"], []);
  const invitationRows = moduleValue<MongoRow[]>(4, "governanceInvitations", DASHBOARD_SOURCE_DEPENDENCIES.governanceInvitations, []);
  const pendingAccessRequests = moduleValue<number>(5, "governanceAccess", DASHBOARD_SOURCE_DEPENDENCIES.governanceAccess, 0);
  const clientDeliveryRows = moduleValue<MongoRow[]>(6, "governanceClientResponses", DASHBOARD_SOURCE_DEPENDENCIES.governanceClientResponses, []);
  const designDeliveryRows = moduleValue<MongoRow[]>(7, "governanceDesignResponses", DASHBOARD_SOURCE_DEPENDENCIES.governanceDesignResponses, []);
  const projectTrendRows = moduleValue<MongoRow[]>(8, "projectTrend", DASHBOARD_SOURCE_DEPENDENCIES.projectTrend, []);
  const workflowTrendRows = moduleValue<MongoRow[]>(9, "workflowTrend", DASHBOARD_SOURCE_DEPENDENCIES.workflowTrend, []);
  const ledgerTrendRows = moduleValue<MongoRow[]>(10, "ledgerTrend", DASHBOARD_SOURCE_DEPENDENCIES.ledgerTrend, []);

  const derivedResults = await Promise.allSettled([
    readProjectFinancePortfolioReport(observedAt),
    mongoWorkforceOverview(input),
    mongoProjectRiskOverview(input.observedAt),
    mongoCanonicalModuleMetrics(),
    readProcurementDashboardPortfolioReport(),
    mongoCanonicalApprovalTrends(startAt, endAt),
    mongoDashboardLineageDataQuality()
  ]);
  const derivedValue = <T>(index: number, source: DashboardOverviewSource, metricKeys: readonly string[], fallback: T): T => {
    const result = derivedResults[index];
    if (!forcedFailures.has(source) && result?.status === "fulfilled") return result.value as T;
    moduleFailureQualities.push(sourceFailureDataQuality(source, metricKeys));
    return fallback;
  };
  const finance = derivedValue<DashboardFinanceMetrics>(0, "finance", DASHBOARD_SOURCE_DEPENDENCIES.finance, emptyFinance());
  const workforce = derivedValue<DashboardWorkforceMetrics>(1, "workforce", DASHBOARD_SOURCE_DEPENDENCIES.workforce, emptyWorkforceMetrics());
  const riskOverview = derivedValue(2, "risk", DASHBOARD_SOURCE_DEPENDENCIES.risk, emptyRiskOverview());
  const canonicalModules = derivedValue<MongoRow>(3, "canonicalModules", DASHBOARD_SOURCE_DEPENDENCIES.canonicalModules, {});
  const canonicalProcurement = derivedValue<MongoRow>(4, "procurement", DASHBOARD_SOURCE_DEPENDENCIES.procurement, {});
  const approvalTrendRows = derivedValue<MongoRow[]>(5, "approvalTrend", DASHBOARD_SOURCE_DEPENDENCIES.approvalTrend, []);
  const lineageQuality = derivedValue<DashboardDataQuality>(
    6,
    "lineage",
    DASHBOARD_SOURCE_DEPENDENCIES.lineage,
    unavailableDataQuality(["dataQuality.lineage"])
  );
  const project = projectRows[0] ?? {};
  const estimate = canonicalModules;
  const execution = executionRows[0] ?? {};
  const procurement = canonicalProcurement;
  const trackedDesign = Number(estimate.designTracked ?? 0);
  const designApproved = Number(estimate.designApproved ?? 0);
  const invitation = invitationRows[0] ?? {};
  const clientDelivery = clientDeliveryRows[0] ?? {};
  const designDelivery = designDeliveryRows[0] ?? {};
  const dataQuality = mergeDataQuality(
    unavailableDataQuality([
      "estimation.waitingAge",
      "workforce.capacity"
    ]),
    lineageQuality,
    riskOverview.dataQuality,
    ...moduleFailureQualities
  );
  return {
    observedAt: input.observedAt,
    period: period(input),
    projects: {
      total: Number(project.total ?? 0), createdInPeriod: Number(project.createdInPeriod ?? 0),
      planning: Number(project.planning ?? 0), active: Number(project.active ?? 0),
      onHold: Number(project.onHold ?? 0), completed: Number(project.completed ?? 0),
      liveOverdue: Number(project.liveOverdue ?? 0), completedLate: Number(project.completedLate ?? 0),
      completionRate: dashboardRatio(Number(project.completed ?? 0), Number(project.total ?? 0)),
      atRisk: riskOverview.distribution.red + riskOverview.distribution.yellow
    },
    estimation: {
      eligibleProjects: Number(project.total ?? 0), trackedProjects: Number(estimate.tracked ?? 0),
      unavailableProjects: Math.max(0, Number(project.total ?? 0) - Number(estimate.tracked ?? 0)),
      noEstimate: Math.max(0, Number(project.total ?? 0) - Number(estimate.tracked ?? 0)),
      draftInternal: Number(estimate.draftInternal ?? 0), readyToSend: Number(estimate.readyToSend ?? 0),
      awaitingClient: Number(estimate.awaitingClient ?? 0), changesRequested: Number(estimate.changesRequested ?? 0),
      clientApproved: finance.projectCount, approvedSubtotalPaise: finance.approvedSubtotalPaise,
      approvedGstPaise: finance.approvedGstPaise, approvedContractTotalPaise: finance.approvedContractTotalPaise,
      medianWaitingAgeDays: null, oldestWaitingAgeDays: null
    },
    design: {
      eligibleProjects: Number(estimate.designEligible ?? 0), trackedProjects: trackedDesign,
      unavailableProjects: Math.max(0, Number(estimate.designEligible ?? 0) - trackedDesign),
      pendingAssignment: Number(estimate.pendingAssignment ?? 0), assigned: Number(estimate.assigned ?? 0),
      inProgress: Number(estimate.designInProgress ?? 0), readyForClient: Number(estimate.designReady ?? 0),
      changesRequested: Number(estimate.designChanges ?? 0), approved: designApproved,
      approvalRate: dashboardRatio(designApproved, Number(estimate.designEligible ?? 0)),
      oldestPendingReviewAgeDays: designDelivery.oldestPendingAt ? elapsedDays(new Date(designDelivery.oldestPendingAt).toISOString(), input.observedAt) : null,
      failedDeliveryCount: Number(designDelivery.failed ?? 0), disabledDeliveryCount: Number(designDelivery.disabled ?? 0)
    },
    procurement: {
      eligibleProjects: Number(procurement.eligibleProjects ?? 0),
      trackedProjects: Number(procurement.trackedProjects ?? 0),
      unavailableProjects: 0,
      notStarted: Math.max(0, Number(procurement.eligibleProjects ?? 0) - Number(procurement.trackedProjects ?? 0)),
      open: Number(procurement.open ?? 0), inProgress: Number(procurement.inProgress ?? 0),
      completed: Number(procurement.completed ?? 0),
      plannedAmountPaise: Number(procurement.approvedAmountPaise ?? 0),
      postedSpendPaise: Number(procurement.postedSpendPaise ?? 0),
      variancePaise: Number(procurement.variancePaise ?? 0),
      averageProgress: dashboardRatio(
        Number(procurement.progressNumerator ?? 0),
        Number(procurement.progressDenominator ?? 0)
      )
    },
    finance,
    execution: {
      total: Number(execution.total ?? 0), open: Number(execution.open ?? 0),
      inProgress: Number(execution.inProgress ?? 0), completed: Number(execution.completed ?? 0),
      completedInPeriod: Number(execution.completedInPeriod ?? 0), overdue: Number(execution.overdue ?? 0),
      unassigned: Number(execution.unassigned ?? 0), overdueUnassigned: Number(execution.overdueUnassigned ?? 0),
      weightedProgress: {
        ...dashboardRatio(Number(execution.progressNumerator ?? 0), Number(execution.progressDenominator ?? 0)),
        fallbackTaskCount: Number(execution.fallbackTaskCount ?? 0)
      },
      projectDistribution: projectTaskDistribution.map((row) => ({ projectId: String(row._id), taskCount: Number(row.taskCount) })),
      roleDistribution: roleTaskDistribution.map((row) => ({ role: String(row._id), taskCount: Number(row.taskCount) }))
    },
    workforce: {
      activeWorkers: workforce.activeWorkers,
      assignedWorkers: workforce.assignedWorkers,
      unassignedWorkers: workforce.unassignedWorkers,
      activeAssignedTaskCount: workforce.activeAssignedTaskCount,
      activeUnassignedTaskCount: Number(execution.unassigned ?? 0),
      completedInPeriodTaskCount: workforce.completedInPeriodTaskCount,
      overCapacityWorkers: null, capacityAvailable: false,
      inactiveAssigneeTaskCount: workforce.inactiveAssigneeTaskCount,
      kpiEligibleWorkers: workforce.kpiEligibleWorkers,
      kpiUnavailableWorkers: workforce.kpiUnavailableWorkers,
      averageKpi: workforce.averageKpi,
      roleDistribution: workforce.roleDistribution
    },
    governance: {
      pendingInvitations: Number(invitation.pending ?? 0), expiredInvitations: Number(invitation.expired ?? 0),
      failedInvitationDeliveries: Number(invitation.failed ?? 0), pendingAccessRequests,
      pendingClientResponses: Number(clientDelivery.pending ?? 0), pendingDesignResponses: Number(designDelivery.pending ?? 0),
      failedClientDeliveries: Number(clientDelivery.failed ?? 0), disabledClientDeliveries: Number(clientDelivery.disabled ?? 0),
      failedDesignDeliveries: Number(designDelivery.failed ?? 0), disabledDesignDeliveries: Number(designDelivery.disabled ?? 0)
    },
    risk: {
      projectDistribution: riskOverview.distribution,
      factorDistribution: riskOverview.factorDistribution,
      topProjects: riskOverview.topProjects
    },
    trends: mongoTrendBuckets(
      input.periodDays,
      startAt,
      projectTrendRows[0],
      workflowTrendRows,
      ledgerTrendRows,
      approvalTrendRows
    ),
    dataQuality
  };
}

export async function mongoSuperAdminDashboardProjects(
  observedAt: string,
  filters: DashboardProjectFilters
): Promise<DashboardPageResult<DashboardProjectRow>> {
  const pipeline = mongoSuperAdminDashboardProjectPipeline(observedAt, filters);
  const [facet] = await ProjectModel.aggregate<MongoRow>(pipeline).exec();
  const projectDocuments = facet?.items ?? [];
  const [rowResult, lineageQuality] = await Promise.all([
    mongoProjectRows(projectDocuments, observedAt, filters.riskFactor),
    mongoDashboardLineageDataQuality(projectDocuments.map((project: MongoRow) => String(project._id)))
  ]);
  return {
    items: rowResult.rows,
    total: Number(facet?.total?.[0]?.value ?? 0),
    dataQuality: mergeDataQuality(
      lineageQuality,
      rowResult.dataQuality
    )
  };
}

export function mongoSuperAdminDashboardProjectPipeline(
  observedAt: string,
  filters: DashboardProjectFilters
): PipelineStage[] {
  const match: MongoRow = {};
  if (filters.projectStatus) match.status = filters.projectStatus;
  if (filters.search) {
    const pattern = new RegExp(escapeRegex(filters.search), "i");
    match.$or = [{ name: pattern }, { location: pattern }];
  }
  const sort: Record<string, 1 | -1> = filters.sort === "name_asc" ? { name: 1, _id: 1 }
    : filters.sort === "deadline_asc" ? { plannedEndAt: 1, _id: 1 }
      : filters.sort === "created_desc" ? { createdAt: -1, _id: -1 }
        : { _dashboardRiskRank: -1, _dashboardOverdueMagnitudeMs: -1, _dashboardFactorOccurrenceCount: -1, name: 1, _id: 1 };
  const pipeline: PipelineStage[] = [
    { $match: match },
    ...mongoProjectDerivedFilterStages(filters, new Date(observedAt)),
    { $facet: {
      items: [{ $sort: sort }, { $skip: filters.offset }, { $limit: filters.limit }],
      total: [{ $count: "value" }]
    } }
  ];
  return pipeline;
}

async function mongoProjectRows(
  projectDocuments: readonly MongoRow[],
  observedAt: string,
  preferredRiskFactor?: DashboardRiskFactorKind
): Promise<{ rows: DashboardProjectRow[]; dataQuality: DashboardDataQuality }> {
  const projectIds = projectDocuments.map((item: MongoRow) => String(item._id));
  if (projectIds.length === 0) {
    return {
      rows: [],
      dataQuality: { status: "complete", totalIssueCount: 0, issues: [], unavailableMetricKeys: [] }
    };
  }
  const [leads, estimates, rawWorkflowTasks, rawDesignTasks, managers, buckets, procurementEntryRows,
    estimateRounds, designRounds] = await Promise.all([
    LeadModel.find({ projectId: { $in: projectIds } }).select({ _id: 1, projectId: 1, stage: 1, nextActionAt: 1 }).lean().exec(),
    EstimateModel.aggregate<MongoRow>([
      {
        $lookup: {
          from: LeadModel.collection.name,
          localField: "leadId",
          foreignField: "_id",
          as: "_dashboardLead"
        }
      },
      { $set: { _dashboardLead: { $arrayElemAt: ["$_dashboardLead", 0] } } },
      {
        $set: {
          _dashboardResolvedProjectId: { $ifNull: ["$projectId", "$_dashboardLead.projectId"] },
          _dashboardLineageValid: {
            $and: [
              { $ne: [{ $ifNull: ["$_dashboardLead._id", null] }, null] },
              {
                $or: [
                  { $eq: [{ $ifNull: ["$projectId", null] }, null] },
                  { $eq: ["$projectId", "$_dashboardLead.projectId"] }
                ]
              }
            ]
          }
        }
      },
      {
        $match: {
          _dashboardLineageValid: true,
          _dashboardResolvedProjectId: { $in: projectIds }
        }
      },
      { $set: { _dashboardApprovedRank: { $cond: [{ $eq: ["$status", "client_approved"] }, 1, 0] } } },
      { $sort: { _dashboardResolvedProjectId: 1, _dashboardApprovedRank: -1, clientDecisionAt: -1, updatedAt: -1, _id: 1 } },
      { $group: { _id: "$_dashboardResolvedProjectId", estimate: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$estimate" } }
    ] as PipelineStage[]).exec(),
    ProjectWorkflowTaskModel.find({ projectId: { $in: projectIds } }).sort({ projectId: 1, openedAt: -1, _id: 1 }).limit(5_001).lean().exec(),
    TaskModel.find({ projectId: { $in: projectIds } }).sort({ projectId: 1, order: 1, _id: 1 }).limit(5_001).lean().exec(),
    UserModel.find({ _id: { $in: projectDocuments.map((item: MongoRow) => item.managerId).filter(Boolean) } }).select({ _id: 1, name: 1, active: 1 }).lean().exec(),
    ProjectFinanceBucketModel.find({ projectId: { $in: projectIds } }).lean().exec(),
    FinanceLedgerEntryModel.aggregate<MongoRow>([
      {
        $match: {
          projectId: { $in: projectIds },
          status: "posted",
          type: "direct_spend",
          expenseClass: "procurement"
        }
      },
      {
        $group: {
          _id: {
            projectId: "$projectId",
            bucketId: "$bucketId",
            sourceSectionId: "$sourceSectionId",
            sourceLineItemKey: "$sourceLineItemKey"
          },
          amountPaise: { $sum: "$amountPaise" }
        }
      },
      { $sort: { "_id.projectId": 1, "_id.sourceSectionId": 1, "_id.sourceLineItemKey": 1 } },
      { $limit: 5_001 },
      {
        $project: {
          _id: 0,
          projectId: "$_id.projectId",
          bucketId: "$_id.bucketId",
          sourceSectionId: "$_id.sourceSectionId",
          sourceLineItemKey: "$_id.sourceLineItemKey",
          amountPaise: 1,
          status: { $literal: "posted" },
          type: { $literal: "direct_spend" },
          expenseClass: { $literal: "procurement" }
        }
      }
    ]).exec(),
    EstimateClientReviewRoundModel.find({ projectId: { $in: projectIds } })
      .select({ _id: 1, projectId: 1, estimateId: 1, estimateVersion: 1, sendGeneration: 1, version: 1, status: 1, decision: 1, decisionSource: 1, decidedById: 1, decidedAt: 1, estimateSnapshot: 1, deliveryStatus: 1, createdAt: 1 })
      .sort({ createdAt: -1, _id: 1 }).limit(5_001).lean().exec(),
    DesignPlanReviewRoundModel.find({ projectId: { $in: projectIds } })
      .select({ _id: 1, projectId: 1, estimateId: 1, designPlanVersion: 1, deliveryStatus: 1, createdAt: 1 })
      .sort({ createdAt: -1, _id: 1 }).limit(5_001).lean().exec()
  ]);
  const workflowTasks = rawWorkflowTasks.slice(0, 5_000);
  const designTasks = rawDesignTasks.slice(0, 5_000);
  const boundedEstimateRounds = estimateRounds.slice(0, 5_000);
  const boundedDesignRounds = designRounds.slice(0, 5_000);
  const rawProcurementTasks = await ProjectWorkflowTaskModel.find({
    projectId: { $in: projectIds }, kind: "procurement"
  }).sort({ projectId: 1, openedAt: -1, _id: 1 }).limit(101).lean().exec();
  const managerById = new Map(managers.map((manager) => [String(manager._id), manager]));
  const bucketByProject = new Map(buckets.map((bucket) => [String(bucket.projectId), bucket]));
  const leadProject = new Map(leads.map((lead) => [String(lead._id), String(lead.projectId)]));
  const financeRead = await readProjectFinanceDashboardProjects(
    new Date(observedAt),
    projectIds
  ).then(
    (items) => ({ items, dataQuality: completeDataQuality() }),
    () => ({
      items: [] as ProjectFinanceBucketDto[],
      dataQuality: sourceFailureDataQuality("finance", DASHBOARD_PROJECT_FINANCE_KEYS)
    })
  );
  const financeByProject = new Map(financeRead.items.map((item) => [item.projectId, item]));
  const procurementEligibleEstimates = projectDocuments
    .map((project) => canonicalMongoEstimate(project._id, estimates, leadProject))
    .filter((estimate): estimate is MongoRow =>
      estimate?.status === "client_approved" && estimate.designPlanStatus === "approved"
    );
  const procurementApprovalRead = await readProcurementDashboardApprovalRounds(
    procurementEligibleEstimates.map((estimate) => String(estimate._id))
  ).then(
    (items) => ({ items, dataQuality: completeDataQuality(), available: true as const }),
    () => ({
      items: new Map<string, readonly never[]>(),
      dataQuality: sourceFailureDataQuality("procurement", projectProcurementMetricKeys("")),
      available: false as const
    })
  );
  const procurementByProject = new Map<string, ProcurementDashboardProjection>();
  const procurementQualities: DashboardDataQuality[] = [];
  for (const project of projectDocuments) {
    const projectId = String(project._id);
    const estimate = canonicalMongoEstimate(project._id, estimates, leadProject);
    if (estimate?.status !== "client_approved" || estimate.designPlanStatus !== "approved") continue;
    if (!procurementApprovalRead.available) continue;
    const projectTasks = rawProcurementTasks.filter((task) => String(task.projectId) === projectId);
    if (projectTasks.length > 1) {
      procurementQualities.push(sourceFailureDataQuality("procurement", projectProcurementMetricKeys(projectId)));
      continue;
    }
    try {
      const projection = procurementDashboardProjection({
        project,
        estimate,
        approvedRounds: (procurementApprovalRead.items.get(String(estimate._id)) ?? [])
          .map((round) => ({ ...round, _id: round.id })),
        task: projectTasks[0] ?? null,
        bucket: bucketByProject.get(projectId) ?? null,
        entries: procurementEntryRows.filter((entry) => String(entry.projectId) === projectId)
      });
      procurementByProject.set(projectId, projection);
    } catch {
      procurementQualities.push(sourceFailureDataQuality("procurement", projectProcurementMetricKeys(projectId)));
    }
  }
  const activeAssigneeIds = new Set((await UserModel.find({
    _id: { $in: uniqueBounded(workflowTasks.map((task) => task.assigneeUserId), 5_000) },
    active: true
  }).select({ _id: 1 }).lean().exec()).map((user) => String(user._id)));
  const rowResults = projectDocuments.map((project: MongoRow) => mongoProjectRow({
    project, observedAt,
    estimate: canonicalMongoEstimate(project._id, estimates, leadProject),
    lead: leads.find((lead) => String(lead.projectId) === String(project._id)) ?? null,
    tasks: workflowTasks.filter((task) => String(task.projectId) === String(project._id)),
    designTasks: designTasks.filter((task) => String(task.projectId) === String(project._id)),
    activeAssigneeIds,
    estimateRounds: boundedEstimateRounds.filter((round) => String(round.projectId) === String(project._id)),
    designRounds: boundedDesignRounds.filter((round) => String(round.projectId) === String(project._id)),
    manager: project.managerId ? managerById.get(String(project.managerId)) ?? null : null,
    finance: financeByProject.get(String(project._id)) ?? null,
    procurement: procurementByProject.get(String(project._id)) ?? null,
    preferredRiskFactor
  }));
  const rows = rowResults.map((result) => result.row);
  const truncatedMetricKeys = [
    ...(rawWorkflowTasks.length > 5_000 ? [
      "execution.taskIds", "execution.assigneeWorkerIds",
      "execution.sourceSectionIds", "execution.sourceLineItemKeys",
      "risk.factorDistribution"
    ] : []),
    ...(rawDesignTasks.length > 5_000 ? ["risk.factorDistribution"] : []),
    ...(estimateRounds.length > 5_000 ? ["estimation.reviewRoundId", "risk.factorDistribution"] : []),
    ...(designRounds.length > 5_000 ? ["design.reviewRoundId", "risk.factorDistribution"] : []),
    ...(rawProcurementTasks.length > 100 ? [...projectProcurementMetricKeys("")] : []),
    ...(procurementEntryRows.length > 5_000
      ? ["procurement.postedSpendPaise", "procurement.variancePaise"]
      : []),
    ...(rowResults.some((result) => result.riskFactorTruncated)
      ? ["risk.factorDistribution"]
      : []),
    ...(rowResults.some((result) => result.executionLineageTruncated)
      ? ["execution.lineage"]
      : []),
    ...(rowResults.some((result) => result.procurementLineageTruncated)
      ? ["procurement.lineage"]
      : [])
  ];
  return {
    rows,
    dataQuality: mergeDataQuality(
      financeRead.dataQuality,
      procurementApprovalRead.dataQuality,
      ...procurementQualities,
      truncatedMetricKeys.length === 0
        ? completeDataQuality()
        : boundedReadDataQuality(truncatedMetricKeys)
    )
  };
}

async function mongoProjectRiskOverview(observedAtValue: string): Promise<{
  distribution: Record<"gray" | "green" | "yellow" | "red", number>;
  factorDistribution: DashboardFactorDistributionItem[];
  topProjects: DashboardTopRiskProject[];
  dataQuality: DashboardDataQuality;
}> {
  const observedAt = new Date(observedAtValue);
  const [facet] = await ProjectModel.aggregate<MongoRow>([
    ...mongoProjectDerivedFilterStages({
      sort: "risk_desc",
      limit: 10,
      offset: 0
    }, observedAt),
    {
      $facet: {
        distribution: [
          { $group: { _id: "$_dashboardRiskLevel", count: { $sum: 1 } } }
        ],
        top: [
          { $match: { _dashboardRiskLevel: { $in: ["red", "yellow"] } } },
          { $sort: { _dashboardRiskRank: -1, _dashboardOverdueMagnitudeMs: -1, _dashboardFactorOccurrenceCount: -1, name: 1, _id: 1 } },
          { $limit: 10 }
        ]
      }
    }
  ] as PipelineStage[]).exec();
  const distribution = { gray: 0, green: 0, yellow: 0, red: 0 };
  for (const row of facet?.distribution ?? []) {
    if (row._id === "gray" || row._id === "green" || row._id === "yellow" || row._id === "red") {
      const level = row._id as keyof typeof distribution;
      distribution[level] = Number(row.count);
    }
  }
  const rowResult = await mongoProjectRows(facet?.top ?? [], observedAtValue);
  return {
    distribution,
    factorDistribution: await mongoRiskFactorDistribution(observedAt),
    topProjects: rowResult.rows.map((row) => ({
      projectId: row.projectId,
      projectName: row.projectName,
      projectStatus: row.projectStatus,
      risk: row.risk
    })),
    dataQuality: rowResult.dataQuality
  };
}

export async function mongoSuperAdminDashboardWorkforce(input: {
  observedAt: string;
  startAt: string;
  endAt: string;
  periodDays: 7 | 30 | 90;
  filters: DashboardWorkforceFilters;
}): Promise<DashboardPageResult<DashboardWorkforceRow>> {
  if (input.filters.capacityState && input.filters.capacityState !== "unavailable") {
    return {
      items: [], total: 0,
      dataQuality: unavailableDataQuality(["workforce.capacity"])
    };
  }
  const userMatch: MongoRow = { active: true, role: { $in: [...WORKER_ROLES] } };
  if (input.filters.role) userMatch.role = input.filters.role;
  if (input.filters.search) userMatch.name = new RegExp(escapeRegex(input.filters.search), "i");
  const derivedMatch: MongoRow = {};
  if (input.filters.assignmentState) {
    derivedMatch._dashboardAssignmentState = input.filters.assignmentState;
  }
  if (input.filters.kpiAvailability) {
    derivedMatch._dashboardKpiAvailability = input.filters.kpiAvailability;
  }
  const aggregateSort: Record<string, 1 | -1> = input.filters.sort === "workload_desc"
    ? { _dashboardRemainingWorkloadPercentage: -1, name: 1, _id: 1 }
    : input.filters.sort === "kpi_desc"
      ? { _dashboardKpiScoreBps: -1, name: 1, _id: 1 }
      : { name: 1, _id: 1 };
  const pipeline: PipelineStage[] = [
    { $match: userMatch },
    ...mongoWorkforceDerivedFilterStages(input),
    ...(Object.keys(derivedMatch).length > 0 ? [{ $match: derivedMatch } as PipelineStage.Match] : []),
    { $sort: aggregateSort },
    { $facet: {
      items: [{ $skip: input.filters.offset }, { $limit: input.filters.limit }],
      total: [{ $count: "value" }]
    } }
  ];
  const [facet] = await UserModel.aggregate<MongoRow>(pipeline).exec();
  const users = facet?.items ?? [];
  const rows: DashboardWorkforceRow[] = users.map((user: MongoRow) => {
    const plannedEffort = Number(user._dashboardPlannedEffort ?? 0);
    const completedEffort = Number(user._dashboardCompletedEffort ?? 0);
    const remainingEffort = Math.max(0, plannedEffort - completedEffort);
    const eligibleComponentCount = Number(user._dashboardKpiEligibleComponentCount ?? 0);
    return {
      workerId: String(user._id), workerName: String(user.name), role: user.role as WorkerRole,
      assignmentState: user._dashboardAssignmentState,
      activeTaskCount: Number(user._dashboardActiveTaskCount ?? 0),
      completedInPeriod: Number(user._dashboardCompletedInPeriod ?? 0),
      plannedEffort, completedEffort, remainingEffort,
      remainingWorkloadPercentage: Number(user._dashboardRemainingWorkloadPercentage ?? 0),
      capacityEffort: null, capacityAvailable: false, capacityState: "unavailable",
      kpi: eligibleComponentCount === 0
        ? { availability: "unavailable", scoreBps: null, eligibleComponentCount: 0 }
        : {
            availability: "available",
            scoreBps: Number(user._dashboardKpiScoreBps),
            eligibleComponentCount
          }
    };
  });
  return {
    items: rows,
    total: Number(facet?.total?.[0]?.value ?? 0),
    dataQuality: unavailableDataQuality(["workforce.capacity"])
  };
}

function memoryProjectRows(state: SeedData, observedAt: string): DashboardProjectRow[] {
  const users = new Map(state.users.map((user) => [user.id, user]));
  const estimates = canonicalEstimatesByProject(state);
  return state.projects.map((project) => {
    const estimate = estimates.get(project.id) ?? null;
    const projectTasks = state.tasks.filter((task) => task.projectId === project.id);
    const factors: DashboardRiskFactor[] = [];
    if (project.status !== "completed" && new Date(project.plannedEndAt) < new Date(observedAt)) {
      factors.push(riskFactor({
        kind: "schedule", level: "red", reasonCode: "project_deadline_overdue",
        reason: "Project is past its planned completion date.", entityType: "project",
        entityId: project.id, observedValue: project.plannedEndAt, threshold: observedAt,
        drillDownTarget: `/admin/projects/${encodeURIComponent(project.id)}`
      }));
    }
    if (project.status === "on_hold") {
      factors.push(riskFactor({
        kind: "workflow", level: "yellow", reasonCode: "project_on_hold",
        reason: "Project is currently on hold.", entityType: "project", entityId: project.id,
        observedValue: project.status, threshold: "active", drillDownTarget: `/admin/projects/${encodeURIComponent(project.id)}`
      }));
    }
    if (estimate?.status === "client_changes_requested") {
      factors.push(riskFactor({
        kind: "workflow", level: "yellow", reasonCode: "estimate_changes_requested",
        reason: "The Client requested Estimate changes.", entityType: "estimate", entityId: estimate.id,
        observedValue: estimate.status, threshold: "client_approved", drillDownTarget: `/admin/projects/${encodeURIComponent(project.id)}`
      }));
    }
    if (estimate?.designPlanStatus === "changes_requested") {
      factors.push(riskFactor({
        kind: "workflow", level: "yellow", reasonCode: "design_changes_requested",
        reason: "The Design plan has requested changes.", entityType: "design_plan", entityId: estimate.id,
        observedValue: estimate.designPlanStatus, threshold: "approved", drillDownTarget: `/admin/projects/${encodeURIComponent(project.id)}`
      }));
    }
    for (const task of projectTasks) {
      const factor = dashboardTaskRiskFactor({
        task,
        drillDownTarget: `/admin/projects/${encodeURIComponent(project.id)}`
      }, new Date(observedAt));
      if (factor) factors.push(factor);
    }
    const manager = project.managerId ? users.get(project.managerId) ?? null : null;
    return {
      projectId: project.id,
      projectName: project.name,
      projectStatus: project.status,
      location: project.location,
      plannedStartAt: project.plannedStartAt,
      plannedEndAt: project.plannedEndAt,
      actualEndAt: project.actualEndAt,
      manager: manager ? { id: manager.id, name: manager.name } : null,
      estimate: estimate ? {
        id: estimate.id,
        projectId: estimate.projectId,
        resolvedProjectId: project.id,
        projectLinkSource: estimate.projectId ? "estimate" : "lead",
        version: estimate.version,
        reviewRoundId: resolveEstimateReviewRoundId({
          estimateStatus: estimate.status,
          estimateVersion: estimate.version,
          approvedReviewRoundId: estimate.approvedBaseline?.reviewRoundId ?? null,
          rounds: estimate.clientReview ? [{
            id: estimate.clientReview.id,
            estimateVersion: estimate.clientReview.estimateVersion,
            sendGeneration: estimate.clientReview.sendGeneration,
            status: estimate.clientReview.status,
            decision: estimate.status === "client_changes_requested"
              ? "request_changes"
              : null
          }] : []
        }),
        status: estimate.status
      } : null,
      designPlan: estimate?.designPlanStatus ? {
        estimateId: estimate.id,
        version: estimate.designPlanVersion ?? 0,
        status: estimate.designPlanStatus,
        reviewRoundId: null
      } : null,
      procurement: null,
      execution: {
        taskIds: [], assigneeWorkerIds: [], sourceSectionIds: [], sourceLineItemKeys: [],
        taskCount: 0, overdueTaskCount: 0, unassignedTaskCount: 0,
        progress: dashboardWeightedProgress([])
      },
      finance: null,
      risk: overallDashboardRisk(
        factors,
        project.status !== "completed" || projectTasks.length > 0 || estimate !== null
      )
    };
  });
}

function canonicalEstimatesByProject(state: SeedData): Map<string, EstimateSummaryRecord> {
  const projectByLeadId = new Map(state.leads.flatMap((lead) =>
    lead.projectId ? [[lead.id, lead.projectId] as const] : []
  ));
  const grouped = new Map<string, EstimateSummaryRecord[]>();
  for (const estimate of state.estimateSummaries ?? []) {
    const leadProjectId = projectByLeadId.get(estimate.leadId) ?? null;
    if (estimate.projectId && leadProjectId && estimate.projectId !== leadProjectId) continue;
    const projectId = estimate.projectId ?? leadProjectId;
    if (!projectId) continue;
    const items = grouped.get(projectId) ?? [];
    items.push(estimate);
    grouped.set(projectId, items);
  }
  return new Map([...grouped.entries()].map(([projectId, estimates]) => [
    projectId,
    [...estimates].sort((left, right) =>
      Number(right.status === "client_approved") - Number(left.status === "client_approved") ||
      Date.parse(right.clientDecisionAt ?? right.updatedAt) - Date.parse(left.clientDecisionAt ?? left.updatedAt) ||
      left.id.localeCompare(right.id)
    )[0]!
  ]));
}

function emptyFinance(): DashboardFinanceMetrics {
  return {
    projectCount: 0, approvedContractTotalPaise: 0, approvedGstPaise: 0,
    approvedSubtotalPaise: 0, targetProfitPaise: 0, costBudgetPaise: 0,
    procurementCostPaise: 0, employeePaymentPaise: 0, otherExpensePaise: 0,
    directSpendPaise: 0, overheadPaise: 0, recordedCostPaise: 0,
    remainingBudgetPaise: 0, currentProfitPaise: 0, currentMarginBps: null,
    overBudgetProjectCount: 0, overdueProjectCount: 0, lateCompletedProjectCount: 0,
    overdueTaskCount: 0
  };
}

function emptyWorkforceMetrics(): DashboardWorkforceMetrics {
  return {
    activeWorkers: 0,
    assignedWorkers: 0,
    unassignedWorkers: 0,
    activeAssignedTaskCount: 0,
    activeUnassignedTaskCount: 0,
    completedInPeriodTaskCount: 0,
    overCapacityWorkers: null,
    capacityAvailable: false,
    inactiveAssigneeTaskCount: 0,
    kpiEligibleWorkers: 0,
    kpiUnavailableWorkers: 0,
    averageKpi: dashboardRatio(0, 0),
    roleDistribution: []
  };
}

function emptyRiskOverview(): {
  distribution: Record<"gray" | "green" | "yellow" | "red", number>;
  factorDistribution: DashboardFactorDistributionItem[];
  topProjects: DashboardTopRiskProject[];
  dataQuality: DashboardDataQuality;
} {
  return {
    distribution: { gray: 0, green: 0, yellow: 0, red: 0 },
    factorDistribution: [],
    topProjects: [],
    dataQuality: unavailableDataQuality(["risk.topProjects"])
  };
}

function period(input: { periodDays: 7 | 30 | 90; startAt: string; endAt: string }): DashboardPeriod {
  return { days: input.periodDays, startAt: input.startAt, endAt: input.endAt };
}

function within(value: string, startAt: Date, endAt: Date): boolean {
  const time = new Date(value).getTime();
  return time >= startAt.getTime() && time <= endAt.getTime();
}

function elapsedDays(startAt: string, endAt: string): number {
  return Math.max(0, Math.floor((Date.parse(endAt) - Date.parse(startAt)) / 86_400_000));
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? values[middle]!
    : Math.round((values[middle - 1]! + values[middle]!) / 2);
}

function workerRoleDistribution(users: readonly UserRecord[]): Array<{ role: WorkerRole; workerCount: number }> {
  return WORKER_ROLES.map((role) => ({
    role,
    workerCount: users.filter((user) => user.role === role).length
  }));
}

function memoryRiskFactorsMayBeTruncated(state: SeedData): boolean {
  const taskCountByProject = new Map<string, number>();
  for (const task of state.tasks) {
    const count = (taskCountByProject.get(task.projectId) ?? 0) + 1;
    if (count > 50) return true;
    taskCountByProject.set(task.projectId, count);
  }
  return false;
}

function boundedProjectRisk(risk: DashboardProjectRow["risk"]): DashboardProjectRow["risk"] {
  return { ...risk, factors: risk.factors.slice(0, 50) };
}

function trendBuckets(
  days: number,
  startAt: Date,
  projects: readonly ProjectRecord[],
  estimates: readonly EstimateSummaryRecord[]
): DashboardTrendBucket[] {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(startAt);
    date.setUTCDate(date.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    return {
      date: key,
      projectsCreated: projects.filter((project) => project.createdAt.startsWith(key)).length,
      projectsCompleted: projects.filter((project) => project.actualEndAt?.startsWith(key)).length,
      estimatesApproved: estimates.filter((estimate) =>
        estimate.status === "client_approved" && estimate.clientDecisionAt?.startsWith(key)
      ).length,
      designPlansApproved: 0,
      workflowTasksCompleted: 0,
      ledgerExpensesPostedPaise: 0
    };
  });
}

function compareProjectRows(left: DashboardProjectRow, right: DashboardProjectRow): number {
  const rank = { gray: 0, green: 1, yellow: 2, red: 3 } as const;
  return rank[right.risk.level] - rank[left.risk.level] ||
    projectOverdueMagnitude(right) - projectOverdueMagnitude(left) ||
    right.risk.factors.length - left.risk.factors.length ||
    left.projectName.localeCompare(right.projectName) ||
    left.projectId.localeCompare(right.projectId);
}

function projectOverdueMagnitude(row: DashboardProjectRow): number {
  return row.risk.factors.reduce((maximum, factor) => {
    if (factor.reasonCode !== "project_deadline_overdue" && factor.reasonCode !== "task_overdue") {
      return maximum;
    }
    const deadline = typeof factor.observedValue === "string"
      ? Date.parse(factor.observedValue)
      : Number.NaN;
    const observedAt = typeof factor.threshold === "string"
      ? Date.parse(factor.threshold)
      : Number.NaN;
    return Number.isFinite(deadline) && Number.isFinite(observedAt)
      ? Math.max(maximum, observedAt - deadline)
      : maximum;
  }, 0);
}

function projectHasModuleStatus(
  row: DashboardProjectRow,
  status: DashboardProjectFilters["moduleStatus"],
  module?: DashboardProjectFilters["module"]
): boolean {
  if (!status) return true;
  if (module === "projects") return row.projectStatus === status;
  if (module === "estimation") {
    return row.estimate === null
      ? status === "no_estimate"
      : dashboardEstimateModuleStatus(row.estimate.status) === status;
  }
  if (module === "design") return row.designPlan?.status === status;
  if (module === "procurement") {
    return row.procurement === null ? status === "not_started" : row.procurement.status === status;
  }
  if (module === "finance") {
    const overBudget = row.risk.factors.some((factor) =>
      factor.kind === "finance" && factor.reasonCode === "cost_budget_exceeded"
    );
    return row.finance !== null && (status === (overBudget ? "over_budget" : "within_budget"));
  }
  if (module === "execution") {
    return (status === "unassigned" && row.execution.unassignedTaskCount > 0) ||
      (status === "overdue" && row.execution.overdueTaskCount > 0) ||
      (status === "on_track" && row.execution.taskCount > 0 && row.execution.overdueTaskCount === 0);
  }
  if (module === "risk") return row.risk.level === status;
  return row.projectStatus === status ||
    (row.estimate !== null && dashboardEstimateModuleStatus(row.estimate.status) === status) ||
    row.designPlan?.status === status || row.procurement?.status === status ||
    row.risk.level === status ||
    (status === "unassigned" && row.execution.unassignedTaskCount > 0) ||
    (status === "overdue" && row.execution.overdueTaskCount > 0) ||
    (status === "on_track" && row.execution.taskCount > 0 && row.execution.overdueTaskCount === 0) ||
    (status === "over_budget" && row.risk.factors.some((factor) => factor.reasonCode === "cost_budget_exceeded")) ||
    (status === "within_budget" && row.finance !== null && !row.risk.factors.some((factor) => factor.reasonCode === "cost_budget_exceeded"));
}

function dashboardEstimateModuleStatus(status: string): string {
  return [
    "draft", "pending_manager_assignment", "pending_designer_approval", "designer_changes_requested"
  ].includes(status) ? "draft_internal" : status;
}

function projectMatchesModule(
  row: DashboardProjectRow,
  module: NonNullable<DashboardProjectFilters["module"]>
): boolean {
  switch (module) {
    case "projects": return true;
    case "estimation": return true;
    case "design": return row.estimate?.status === "client_approved";
    case "procurement": return row.designPlan?.status === "approved";
    case "finance": return row.estimate?.status === "client_approved";
    case "execution": return row.execution.taskCount > 0;
    case "risk": return true;
  }
}

function mongoProjectRow(input: {
  project: MongoRow;
  estimate: MongoRow | null;
  lead: MongoRow | null;
  tasks: MongoRow[];
  designTasks: MongoRow[];
  activeAssigneeIds: ReadonlySet<string>;
  estimateRounds: MongoRow[];
  designRounds: MongoRow[];
  manager: MongoRow | null;
  finance: ProjectFinanceBucketDto | null;
  procurement: ProcurementDashboardProjection | null;
  observedAt: string;
  preferredRiskFactor?: DashboardRiskFactorKind;
}): {
  row: DashboardProjectRow;
  riskFactorTruncated: boolean;
  executionLineageTruncated: boolean;
  procurementLineageTruncated: boolean;
} {
  const projectId = String(input.project._id);
  const observedAt = new Date(input.observedAt);
  const workflowFact = input.project._dashboardWorkflowFact ?? {};
  const executionTasks = input.tasks.filter((task) =>
    task.kind === "site_execution" || task.kind === "trade_execution"
  );
  const validEstimateRounds = input.estimate
    ? input.estimateRounds.filter((round) =>
        String(round.estimateId) === String(input.estimate!._id) &&
        Number(round.estimateVersion) <= Number(input.estimate!.version)
      )
    : [];
  const validDesignRounds = input.estimate
    ? input.designRounds.filter((round) =>
        String(round.estimateId) === String(input.estimate!._id) &&
        Number(round.designPlanVersion) === Number(input.estimate!.designPlanVersion ?? 0)
      )
    : [];
  const factors: DashboardRiskFactor[] = [];
  if (input.project.status !== "completed" && new Date(input.project.plannedEndAt) < observedAt) {
    factors.push(riskFactor({
      kind: "schedule", level: "red", reasonCode: "project_deadline_overdue",
      reason: "Project is past its planned completion date.", entityType: "project",
      entityId: projectId, observedValue: new Date(input.project.plannedEndAt).toISOString(),
      threshold: input.observedAt, drillDownTarget: `/admin/projects/${encodeURIComponent(projectId)}`
    }));
  }
  if (input.project.status === "on_hold") {
    factors.push(riskFactor({
      kind: "workflow", level: "yellow", reasonCode: "project_on_hold",
      reason: "Project is currently on hold.", entityType: "project", entityId: projectId,
      observedValue: "on_hold", threshold: "active", drillDownTarget: `/admin/projects/${encodeURIComponent(projectId)}`
    }));
  }
  if (
    input.lead &&
    input.lead.stage !== "won" &&
    input.lead.stage !== "lost" &&
    new Date(input.lead.nextActionAt) < observedAt
  ) {
    factors.push(riskFactor({
      kind: "workflow", level: "red", reasonCode: "lead_next_action_overdue",
      reason: "The Lead next action is overdue.", entityType: "lead",
      entityId: String(input.lead._id),
      observedValue: new Date(input.lead.nextActionAt).toISOString(),
      threshold: input.observedAt,
      drillDownTarget: `/admin/projects/${encodeURIComponent(projectId)}`
    }));
  }
  if (input.estimate?.status === "client_changes_requested") {
    factors.push(riskFactor({
      kind: "workflow", level: "yellow", reasonCode: "estimate_changes_requested",
      reason: "The Client requested Estimate changes.", entityType: "estimate", entityId: String(input.estimate._id),
      observedValue: input.estimate.status, threshold: "client_approved", drillDownTarget: `/admin/projects/${encodeURIComponent(projectId)}`
    }));
  }
  if (input.estimate?.designPlanStatus === "changes_requested") {
    factors.push(riskFactor({
      kind: "workflow", level: "yellow", reasonCode: "design_changes_requested",
      reason: "The Design plan has requested changes.", entityType: "design_plan", entityId: String(input.estimate._id),
      observedValue: input.estimate.designPlanStatus, threshold: "approved", drillDownTarget: `/admin/projects/${encodeURIComponent(projectId)}`
    }));
  }
  for (const task of input.tasks) {
    const dueAt = task.dueAt ? new Date(task.dueAt) : workflowTaskDueAt(task.kind, new Date(task.openedAt));
    const factor = dashboardTaskRiskFactor({
      task: mongoWorkflowKpiTask(task),
      drillDownTarget: `/admin/projects/${encodeURIComponent(projectId)}`
    }, observedAt);
    if (factor) factors.push(factor);
    if (
      executionTasks.includes(task) &&
      task.status !== "completed" &&
      task.assigneeUserId &&
      !input.activeAssigneeIds.has(String(task.assigneeUserId))
    ) {
      factors.push(riskFactor({
        kind: "staffing", level: "red", reasonCode: "inactive_execution_assignee",
        reason: "An active execution task points to an inactive or missing assignee.",
        entityType: "task", entityId: String(task._id),
        observedValue: String(task.assigneeUserId), threshold: "active worker",
        drillDownTarget: `/admin/projects/${encodeURIComponent(projectId)}`
      }));
    }
    if (executionTasks.includes(task) && task.status !== "completed" && !task.assigneeUserId) {
      const overdue = dueAt < observedAt;
      factors.push(riskFactor({
        kind: "staffing", level: overdue ? "red" : "yellow",
        reasonCode: overdue ? "overdue_execution_unassigned" : "active_execution_unassigned",
        reason: overdue ? "An overdue execution task is unassigned." : "An active execution task is unassigned.",
        entityType: "task", entityId: String(task._id), observedValue: null,
        threshold: dueAt.toISOString(), drillDownTarget: `/admin/projects/${encodeURIComponent(projectId)}`
      }));
    }
  }
  for (const task of input.designTasks) {
    const factor = dashboardTaskRiskFactor({
      task: mongoDesignKpiTask(task),
      drillDownTarget: `/admin/projects/${encodeURIComponent(projectId)}`
    }, observedAt);
    if (factor) factors.push(factor);
  }
  for (const round of [...validEstimateRounds, ...validDesignRounds]) {
    if (round.deliveryStatus !== "failed" && round.deliveryStatus !== "disabled") continue;
    const disabled = round.deliveryStatus === "disabled";
    factors.push(riskFactor({
      kind: "workflow",
      level: "yellow",
      reasonCode: disabled ? "delivery_disabled" : "delivery_failed",
      reason: disabled ? "A client delivery is disabled." : "A client delivery failed.",
      entityType: "delivery",
      entityId: String(round._id),
      observedValue: round.deliveryStatus,
      threshold: "sent",
      drillDownTarget: `/admin/projects/${encodeURIComponent(projectId)}`
    }));
  }
  const finance: DashboardProjectRow["finance"] = input.finance ? {
    bucketId: input.finance.id,
    version: input.finance.version,
    estimateId: input.finance.estimateId,
    estimateVersion: input.finance.estimateVersion,
    estimateReviewRoundId: input.finance.estimateReviewRoundId,
    designPlanVersion: input.finance.designPlanVersion,
    approvedSubtotalPaise: input.finance.approvedSubtotalPaise,
    recordedCostPaise: input.finance.recordedCostPaise,
    currentProfitPaise: input.finance.currentProfitPaise,
    currentMarginBps: input.finance.currentMarginBps
  } : null;
  if (input.finance) {
    factors.push(...financeRiskFactors({
      projectId,
      projectCompleted: input.project.status === "completed",
      costBudgetPaise: input.finance.costBudgetPaise,
      recordedCostPaise: input.finance.recordedCostPaise
    }));
  }
  const resolvedProjectId = input.estimate
    ? String(input.estimate.projectId ?? projectId)
    : projectId;
  const projectLinkSource = input.estimate?.projectId
    ? (input.lead ? "estimate_and_lead" : "estimate")
    : "lead";
  const estimateReviewRoundId = input.estimate
    ? resolveEstimateReviewRoundId({
        estimateStatus: String(input.estimate.status),
        estimateVersion: Number(input.estimate.version),
        approvedReviewRoundId: input.finance?.estimateReviewRoundId ?? null,
        rounds: validEstimateRounds.map((round) => ({
          id: String(round._id),
          estimateVersion: Number(round.estimateVersion),
          sendGeneration: Number(round.sendGeneration ?? 0),
          status: round.status,
          decision: round.decision ?? null,
          decidedAt: round.decidedAt ?? null,
          createdAt: round.createdAt ?? null
        }))
      })
    : null;
  const designReviewRound = input.estimate
    ? validDesignRounds.find((round) =>
        String(round.estimateId) === String(input.estimate!._id) &&
        Number(round.designPlanVersion) === Number(input.estimate!.designPlanVersion ?? 0)
      ) ?? null
    : null;
  const risk = overallDashboardRisk(
    factors,
    input.project.status !== "completed" || input.tasks.length > 0 ||
        input.finance !== null || input.estimate !== null || input.designTasks.length > 0 || input.lead !== null
  );
  const completeRiskLevel = input.project._dashboardRiskLevel;
  if (["gray", "green", "yellow", "red"].includes(String(completeRiskLevel))) {
    risk.level = completeRiskLevel;
  }
  const boundedRiskFactors = risk.factors.slice(0, 50);
  if (
    input.preferredRiskFactor &&
    !boundedRiskFactors.some((factor) => factor.kind === input.preferredRiskFactor)
  ) {
    const preferredFactor = risk.factors.find((factor) => factor.kind === input.preferredRiskFactor);
    if (preferredFactor) {
      if (boundedRiskFactors.length === 50) boundedRiskFactors[49] = preferredFactor;
      else boundedRiskFactors.push(preferredFactor);
    }
  }
  const executionLineageValues = [
    executionTasks.map((task) => task._id),
    executionTasks.map((task) => task.assigneeUserId),
    executionTasks.map((task) => task.sourceSectionId),
    executionTasks.map((task) => task.sourceLineItemKey)
  ];
  const procurementLineageValues = input.procurement ? [
    input.procurement.sourceSectionIds,
    input.procurement.sourceLineItemKeys
  ] : [];
  const row: DashboardProjectRow = {
    projectId, projectName: String(input.project.name), projectStatus: input.project.status,
    location: String(input.project.location),
    plannedStartAt: new Date(input.project.plannedStartAt).toISOString(),
    plannedEndAt: new Date(input.project.plannedEndAt).toISOString(),
    actualEndAt: input.project.actualEndAt ? new Date(input.project.actualEndAt).toISOString() : null,
    manager: input.manager ? { id: String(input.manager._id), name: String(input.manager.name) } : null,
    estimate: input.estimate ? {
      id: String(input.estimate._id), projectId: input.estimate.projectId == null ? null : String(input.estimate.projectId),
      resolvedProjectId, projectLinkSource,
      version: Number(input.estimate.version),
      reviewRoundId: estimateReviewRoundId,
      status: String(input.estimate.status)
    } : null,
    designPlan: input.estimate?.designPlanStatus ? {
      estimateId: String(input.estimate._id), version: Number(input.estimate.designPlanVersion ?? 0),
      status: String(input.estimate.designPlanStatus),
      reviewRoundId: designReviewRound ? String(designReviewRound._id) : null
    } : null,
    procurement: input.procurement ? {
      taskId: input.procurement.taskId,
      estimateId: input.procurement.estimateId,
      designPlanVersion: input.procurement.designPlanVersion,
      status: input.procurement.taskStatus,
      progress: input.procurement.taskProgress,
      approvedAmountPaise: input.procurement.approvedAmountPaise,
      postedSpendPaise: input.procurement.postedSpendPaise,
      variancePaise: input.procurement.variancePaise,
      sourceSectionIds: input.procurement.sourceSectionIds.slice(0, 50),
      sourceLineItemKeys: input.procurement.sourceLineItemKeys.slice(0, 50)
    } : null,
    execution: {
      taskIds: uniqueBounded(executionTasks.map((task) => task._id), 50),
      assigneeWorkerIds: uniqueBounded(executionTasks.map((task) => task.assigneeUserId), 50),
      sourceSectionIds: uniqueBounded(executionTasks.map((task) => task.sourceSectionId), 50),
      sourceLineItemKeys: uniqueBounded(executionTasks.map((task) => task.sourceLineItemKey), 50),
      taskCount: Number(workflowFact.executionCount ?? 0),
      overdueTaskCount: Number(workflowFact.executionOverdueCount ?? 0),
      unassignedTaskCount: Number(workflowFact.executionUnassignedCount ?? 0),
      progress: {
        ...dashboardRatio(
          Number(workflowFact.executionProgressNumerator ?? 0),
          Number(workflowFact.executionProgressDenominator ?? 0)
        ),
        fallbackTaskCount: Number(workflowFact.executionFallbackTaskCount ?? 0)
      }
    },
    finance,
    risk: { ...risk, factors: boundedRiskFactors }
  };
  return {
    row,
    riskFactorTruncated: factors.length > 50,
    executionLineageTruncated: executionLineageValues.some((values) =>
      uniqueBounded(values, 51).length > 50
    ),
    procurementLineageTruncated: procurementLineageValues.some((values) =>
      uniqueBounded(values, 51).length > 50
    )
  };
}

function canonicalMongoEstimate(
  projectId: unknown,
  estimates: readonly MongoRow[],
  leadProject: ReadonlyMap<string, string>
): MongoRow | null {
  const candidates = estimates.filter((estimate) => {
    const direct = estimate.projectId == null ? null : String(estimate.projectId);
    const viaLead = leadProject.get(String(estimate.leadId)) ?? null;
    return (direct ?? viaLead) === String(projectId) && !(direct && viaLead && direct !== viaLead);
  });
  return [...candidates].sort((left, right) =>
    Number(right.status === "client_approved") - Number(left.status === "client_approved") ||
    new Date(right.clientDecisionAt ?? right.updatedAt).getTime() - new Date(left.clientDecisionAt ?? left.updatedAt).getTime() ||
    String(left._id).localeCompare(String(right._id))
  )[0] ?? null;
}

function mongoWorkflowKpiTask(task: MongoRow): TaskRecord & { id: string; projectId: string } {
  const openedAt = new Date(task.openedAt);
  const dueAt = task.dueAt ? new Date(task.dueAt) : workflowTaskDueAt(task.kind, openedAt);
  const completedAt = task.completedAt ? new Date(task.completedAt).toISOString() : null;
  const base = {
    id: String(task._id), projectId: String(task.projectId), floorId: "", stageId: "",
    title: String(task.title ?? "Workflow task"), description: String(task.description ?? ""), order: 0,
    ownerId: String(task.assigneeUserId ?? task.assigneeRole),
    plannedStartAt: openedAt.toISOString(), originalDeadlineAt: dueAt.toISOString(),
    currentDeadlineAt: dueAt.toISOString(), plannedEffort: workflowEffort(task),
    progress: Number(task.progress), dependencyTaskIds: [], latestUpdateAt: null,
    version: Number(task.version ?? 1), createdAt: new Date(task.createdAt ?? openedAt).toISOString(),
    updatedAt: new Date(task.updatedAt ?? openedAt).toISOString()
  };
  return task.status === "completed"
    ? { ...base, status: "completed", completedAt: completedAt ?? new Date(task.updatedAt).toISOString() }
    : { ...base, status: task.status === "in_progress" ? "in_progress" : "not_started", completedAt: null };
}

function mongoDesignKpiTask(task: MongoRow): TaskRecord & { id: string; projectId: string } {
  return {
    id: String(task._id),
    projectId: String(task.projectId),
    floorId: String(task.floorId),
    stageId: String(task.stageId),
    title: String(task.title),
    description: String(task.description ?? ""),
    order: Number(task.order),
    ownerId: String(task.ownerId),
    plannedStartAt: new Date(task.plannedStartAt).toISOString(),
    originalDeadlineAt: new Date(task.originalDeadlineAt).toISOString(),
    currentDeadlineAt: new Date(task.currentDeadlineAt).toISOString(),
    plannedEffort: task.plannedEffort == null ? null : Number(task.plannedEffort),
    progress: Number(task.progress),
    status: task.status,
    completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
    dependencyTaskIds: (task.dependencyTaskIds ?? []).map(String),
    latestUpdateAt: task.latestUpdateAt ? new Date(task.latestUpdateAt).toISOString() : null,
    wasYellow: task.wasYellow,
    approvalVersion: task.approvalVersion ?? null,
    approvalStatus: task.approvalStatus ?? null,
    revisionCount: task.revisionCount ?? null,
    hasReview: task.hasReview,
    updateEvents: (task.updateEvents ?? []).map((event: MongoRow) => ({
      occurredAt: new Date(event.occurredAt).toISOString()
    })),
    version: Number(task.__v ?? 0),
    createdAt: new Date(task.createdAt).toISOString(),
    updatedAt: new Date(task.updatedAt).toISOString()
  };
}

function workflowEffort(task: MongoRow): number {
  const stored = Number(task.plannedEffort);
  return Number.isSafeInteger(stored) && stored > 0
    ? stored
    : WORKFLOW_TASK_SCHEDULE[task.kind as ProjectWorkflowTaskKind]?.plannedEffort ?? 1;
}

function mongoTrendBuckets(
  days: number,
  startAt: Date,
  projectRow: MongoRow | undefined,
  workflowRows: MongoRow[],
  ledgerRows: MongoRow[],
  approvalRows: MongoRow[]
): DashboardTrendBucket[] {
  const created = projectRow?.createdDays ?? [];
  const completed = projectRow?.completedDays ?? [];
  const workflow = new Map(workflowRows.map((row) => [String(row._id), Number(row.count)]));
  const ledger = new Map(ledgerRows.map((row) => [String(row._id), Number(row.amountPaise)]));
  const estimatesApproved = new Map(approvalRows
    .filter((row) => row._id?.type === "estimate")
    .map((row) => [String(row._id.day), Number(row.count)]));
  const designPlansApproved = new Map(approvalRows
    .filter((row) => row._id?.type === "design")
    .map((row) => [String(row._id.day), Number(row.count)]));
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(startAt);
    date.setUTCDate(date.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    return {
      date: key,
      projectsCreated: created.filter((value: string) => value === key).length,
      projectsCompleted: completed.filter((value: string | null) => value === key).length,
      estimatesApproved: estimatesApproved.get(key) ?? 0,
      designPlansApproved: designPlansApproved.get(key) ?? 0,
      workflowTasksCompleted: workflow.get(key) ?? 0,
      ledgerExpensesPostedPaise: ledger.get(key) ?? 0
    };
  });
}

function unavailableDataQuality(metricKeys: string[]): DashboardDataQuality {
  const unique = [...new Set(metricKeys)].sort();
  return {
    status: unique.length === 0 ? "complete" : "partial",
    totalIssueCount: unique.length,
    issues: unique.slice(0, 50).map((metricKey) => ({
      code: "module_aggregate_unavailable",
      metricKey,
      message: "This metric is unavailable because its authoritative source is not defined.",
      entityType: null,
      entityId: null
    })),
    unavailableMetricKeys: unique
  };
}

const DASHBOARD_SOURCE_DEPENDENCIES = {
  finance: [
    "finance.projectCount", "finance.approvedContractTotalPaise", "finance.approvedGstPaise",
    "finance.approvedSubtotalPaise", "finance.targetProfitPaise", "finance.costBudgetPaise",
    "finance.procurementCostPaise", "finance.employeePaymentPaise", "finance.otherExpensePaise",
    "finance.directSpendPaise", "finance.overheadPaise", "finance.recordedCostPaise",
    "finance.remainingBudgetPaise", "finance.currentProfitPaise", "finance.currentMarginBps",
    "finance.overBudgetProjectCount", "finance.overdueProjectCount",
    "finance.lateCompletedProjectCount", "finance.overdueTaskCount",
    "estimation.clientApproved", "estimation.approvedSubtotalPaise",
    "estimation.approvedGstPaise", "estimation.approvedContractTotalPaise"
  ],
  canonicalModules: [
    "estimation.trackedProjects", "estimation.unavailableProjects",
    "estimation.noEstimate", "estimation.draftInternal", "estimation.readyToSend",
    "estimation.awaitingClient", "estimation.changesRequested",
    "design.eligibleProjects", "design.trackedProjects", "design.unavailableProjects",
    "design.pendingAssignment", "design.assigned", "design.inProgress", "design.readyForClient",
    "design.changesRequested", "design.approved", "design.approvalRate"
  ],
  procurement: [
    "procurement.eligibleProjects", "procurement.trackedProjects", "procurement.unavailableProjects",
    "procurement.notStarted", "procurement.open", "procurement.inProgress", "procurement.completed",
    "procurement.approvedAmountPaise", "procurement.postedSpendPaise",
    "procurement.variancePaise", "procurement.averageProgress"
  ],
  execution: [
    "execution.total", "execution.open", "execution.inProgress", "execution.completed",
    "execution.completedInPeriod", "execution.overdue", "execution.unassigned",
    "execution.overdueUnassigned", "execution.weightedProgress",
    "execution.projectDistribution", "execution.roleDistribution",
    "workforce.activeUnassignedTaskCount"
  ],
  workforce: [
    "workforce.activeWorkers", "workforce.assignedWorkers", "workforce.unassignedWorkers",
    "workforce.activeAssignedTaskCount", "workforce.completedInPeriodTaskCount",
    "workforce.inactiveAssigneeTaskCount", "workforce.kpiEligibleWorkers",
    "workforce.kpiUnavailableWorkers", "workforce.averageKpi", "workforce.roleDistribution"
  ],
  risk: ["projects.atRisk", "risk.projectDistribution", "risk.factorDistribution", "risk.topProjects"],
  projectTrend: ["trends.projectsCreated", "trends.projectsCompleted"],
  workflowTrend: ["trends.workflowTasksCompleted"],
  ledgerTrend: ["trends.ledgerExpensesPostedPaise"],
  approvalTrend: ["trends.estimatesApproved", "trends.designPlansApproved"],
  lineage: [
    "estimation.trackedProjects", "estimation.unavailableProjects", "estimation.noEstimate",
    "estimation.draftInternal", "estimation.readyToSend", "estimation.awaitingClient",
    "estimation.changesRequested", "estimation.clientApproved",
    "estimation.approvedSubtotalPaise", "estimation.approvedGstPaise",
    "estimation.approvedContractTotalPaise",
    "design.eligibleProjects", "design.trackedProjects", "design.unavailableProjects",
    "design.pendingAssignment", "design.assigned", "design.inProgress", "design.readyForClient",
    "design.changesRequested", "design.approved", "design.approvalRate",
    "design.oldestPendingReviewAgeDays", "design.failedDeliveryCount", "design.disabledDeliveryCount",
    "procurement.eligibleProjects", "procurement.trackedProjects", "procurement.unavailableProjects",
    "procurement.notStarted", "procurement.open", "procurement.inProgress", "procurement.completed",
    "procurement.approvedAmountPaise", "procurement.postedSpendPaise",
    "procurement.variancePaise", "procurement.averageProgress",
    "finance.projectCount", "finance.approvedContractTotalPaise", "finance.approvedGstPaise",
    "finance.approvedSubtotalPaise", "finance.targetProfitPaise", "finance.costBudgetPaise",
    "finance.procurementCostPaise", "finance.employeePaymentPaise", "finance.otherExpensePaise",
    "finance.directSpendPaise", "finance.overheadPaise", "finance.recordedCostPaise",
    "finance.remainingBudgetPaise", "finance.currentProfitPaise", "finance.currentMarginBps",
    "finance.overBudgetProjectCount", "finance.overdueProjectCount",
    "finance.lateCompletedProjectCount", "finance.overdueTaskCount",
    "execution.total", "execution.open", "execution.inProgress", "execution.completed",
    "execution.completedInPeriod", "execution.overdue", "execution.unassigned",
    "execution.overdueUnassigned", "execution.weightedProgress",
    "execution.projectDistribution", "execution.roleDistribution",
    "workforce.activeAssignedTaskCount", "workforce.activeUnassignedTaskCount",
    "workforce.completedInPeriodTaskCount", "workforce.inactiveAssigneeTaskCount",
    "workforce.kpiEligibleWorkers", "workforce.kpiUnavailableWorkers", "workforce.averageKpi",
    "risk.projectDistribution", "risk.factorDistribution", "risk.topProjects", "projects.atRisk",
    "trends.estimatesApproved", "trends.designPlansApproved", "trends.workflowTasksCompleted",
    "trends.ledgerExpensesPostedPaise"
  ],
  governanceInvitations: [
    "governance.pendingInvitations", "governance.expiredInvitations",
    "governance.failedInvitationDeliveries"
  ],
  governanceAccess: ["governance.pendingAccessRequests"],
  governanceClientResponses: [
    "governance.pendingClientResponses", "governance.failedClientDeliveries",
    "governance.disabledClientDeliveries"
  ],
  governanceDesignResponses: [
    "governance.pendingDesignResponses", "governance.failedDesignDeliveries",
    "governance.disabledDesignDeliveries", "design.oldestPendingReviewAgeDays",
    "design.failedDeliveryCount", "design.disabledDeliveryCount"
  ]
} as const;

type DashboardOverviewSource = keyof typeof DASHBOARD_SOURCE_DEPENDENCIES;

const DASHBOARD_PROJECT_FINANCE_KEYS = [
  "finance.rows", "finance.bucketId", "finance.estimateId",
  "finance.estimateVersion", "finance.estimateReviewRoundId",
  "finance.approvedSubtotalPaise", "finance.recordedCostPaise",
  "finance.currentProfitPaise", "finance.currentMarginBps",
  "estimation.reviewRoundId", "risk.projectDistribution", "risk.factorDistribution"
] as const;

const DASHBOARD_PROJECT_LINEAGE_DEPENDENCIES = [
  "estimation.rows", "estimation.reviewRoundId", "design.rows", "design.reviewRoundId",
  ...DASHBOARD_PROJECT_FINANCE_KEYS,
  ...projectProcurementMetricKeys(""),
  "execution.rows", "execution.taskCount", "execution.overdueTaskCount",
  "execution.weightedProgress", "execution.taskIds", "execution.assigneeWorkerIds",
  "execution.sourceSectionIds", "execution.sourceLineItemKeys",
  "risk.projectDistribution", "risk.factorDistribution"
] as const;

function completeDataQuality(): DashboardDataQuality {
  return { status: "complete", totalIssueCount: 0, issues: [], unavailableMetricKeys: [] };
}

function sourceFailureDataQuality(
  source: string,
  metricKeys: readonly string[]
): DashboardDataQuality {
  const unique = [...new Set(metricKeys)].sort();
  return {
    status: "partial",
    totalIssueCount: unique.length,
    issues: unique.slice(0, 50).map((metricKey) => ({
      code: "module_aggregate_unavailable",
      metricKey,
      message: `This metric is unavailable because the ${source} source read or validation failed.`,
      entityType: null,
      entityId: null
    })),
    unavailableMetricKeys: unique
  };
}

function projectProcurementMetricKeys(_projectId: string): readonly string[] {
  return [
    "procurement.rows", "procurement.approvedAmountPaise",
    "procurement.postedSpendPaise", "procurement.variancePaise",
    "procurement.averageProgress", "procurement.sourceSectionIds",
    "procurement.sourceLineItemKeys", "risk.projectDistribution",
    "risk.factorDistribution"
  ];
}

function boundedReadDataQuality(metricKeys: string[]): DashboardDataQuality {
  const unique = [...new Set(metricKeys)].sort();
  return {
    status: "partial",
    totalIssueCount: unique.length,
    issues: unique.slice(0, 50).map((metricKey) => ({
      code: "module_aggregate_unavailable",
      metricKey,
      message: "This metric is partial because its bounded detail read reached the safety limit.",
      entityType: null,
      entityId: null
    })),
    unavailableMetricKeys: unique
  };
}

function mergeDataQuality(...values: DashboardDataQuality[]): DashboardDataQuality {
  const issues = values.flatMap((value) => value.issues).slice(0, 50);
  const unavailableMetricKeys = [...new Set(values.flatMap((value) => value.unavailableMetricKeys))]
    .sort();
  const totalIssueCount = values.reduce((sum, value) => sum + value.totalIssueCount, 0);
  return {
    status: totalIssueCount > 0 || unavailableMetricKeys.length > 0 ? "partial" : "complete",
    totalIssueCount,
    issues,
    unavailableMetricKeys
  };
}

async function mongoDashboardLineageDataQuality(
  scopedProjectIds?: readonly string[]
): Promise<DashboardDataQuality> {
  const scopeMatch = scopedProjectIds
    ? { resolvedProjectId: { $in: [...scopedProjectIds] } }
    : {};
  const [estimateResult, bucketResult, taskResult, reviewResult] = await Promise.all([
    EstimateModel.aggregate<MongoRow>([
      {
        $lookup: {
          from: LeadModel.collection.name,
          localField: "leadId",
          foreignField: "_id",
          as: "lead"
        }
      },
      { $set: { lead: { $arrayElemAt: ["$lead", 0] } } },
      { $set: { resolvedProjectId: { $ifNull: ["$projectId", "$lead.projectId"] } } },
      ...(scopedProjectIds ? [{ $match: scopeMatch }] : []),
      {
        $lookup: {
          from: ProjectModel.collection.name,
          localField: "resolvedProjectId",
          foreignField: "_id",
          as: "project"
        }
      },
      {
        $match: {
          $expr: {
            $or: [
              { $eq: [{ $ifNull: ["$lead._id", null] }, null] },
              { $eq: [{ $ifNull: ["$resolvedProjectId", null] }, null] },
              { $eq: [{ $size: "$project" }, 0] },
              {
                $and: [
                  { $ne: [{ $ifNull: ["$projectId", null] }, null] },
                  { $ne: [{ $ifNull: ["$lead.projectId", null] }, null] },
                  { $ne: ["$projectId", "$lead.projectId"] }
                ]
              }
            ]
          }
        }
      },
      {
        $facet: {
          count: [{ $count: "value" }],
          items: [{ $sort: { _id: 1 } }, { $limit: 50 }, { $project: { _id: 1 } }]
        }
      }
    ] as PipelineStage[]).exec(),
    ProjectFinanceBucketModel.aggregate<MongoRow>([
      {
        $lookup: {
          from: ProjectModel.collection.name,
          localField: "projectId",
          foreignField: "_id",
          as: "project"
        }
      },
      {
        $lookup: {
          from: EstimateModel.collection.name,
          localField: "estimateId",
          foreignField: "_id",
          as: "estimate"
        }
      },
      { $set: { estimate: { $arrayElemAt: ["$estimate", 0] }, resolvedProjectId: "$projectId" } },
      {
        $set: {
          approvedEstimateVersion: {
            $cond: [
              { $gt: ["$estimate.version", 1] },
              { $subtract: ["$estimate.version", 1] },
              1
            ]
          }
        }
      },
      ...(scopedProjectIds ? [{ $match: scopeMatch }] : []),
      {
        $lookup: {
          from: LeadModel.collection.name,
          localField: "estimate.leadId",
          foreignField: "_id",
          as: "lead"
        }
      },
      { $set: { lead: { $arrayElemAt: ["$lead", 0] } } },
      {
        $lookup: {
          from: EstimateClientReviewRoundModel.collection.name,
          localField: "estimateReviewRoundId",
          foreignField: "_id",
          as: "reviewRound"
        }
      },
      {
        $match: {
          $expr: {
            $or: [
              { $eq: [{ $size: "$project" }, 0] },
              { $eq: [{ $ifNull: ["$estimate._id", null] }, null] },
              { $ne: [{ $ifNull: ["$estimate.projectId", "$lead.projectId"] }, "$projectId"] },
              { $ne: ["$estimateVersion", "$approvedEstimateVersion"] },
              {
                $and: [
                  { $ne: [{ $ifNull: ["$estimateReviewRoundId", null] }, null] },
                  {
                    $or: [
                      { $eq: [{ $size: "$reviewRound" }, 0] },
                      { $ne: [{ $arrayElemAt: ["$reviewRound.estimateId", 0] }, "$estimateId"] },
                      { $ne: [{ $arrayElemAt: ["$reviewRound.estimateVersion", 0] }, "$estimateVersion"] }
                    ]
                  }
                ]
              }
            ]
          }
        }
      },
      {
        $facet: {
          count: [{ $count: "value" }],
          items: [{ $sort: { _id: 1 } }, { $limit: 50 }, { $project: { _id: 1 } }]
        }
      }
    ] as PipelineStage[]).exec(),
    ProjectWorkflowTaskModel.aggregate<MongoRow>([
      {
        $lookup: {
          from: ProjectModel.collection.name,
          localField: "projectId",
          foreignField: "_id",
          as: "project"
        }
      },
      {
        $lookup: {
          from: EstimateModel.collection.name,
          localField: "estimateId",
          foreignField: "_id",
          as: "estimate"
        }
      },
      { $set: { estimate: { $arrayElemAt: ["$estimate", 0] }, resolvedProjectId: "$projectId" } },
      ...(scopedProjectIds ? [{ $match: scopeMatch }] : []),
      {
        $lookup: {
          from: LeadModel.collection.name,
          localField: "estimate.leadId",
          foreignField: "_id",
          as: "lead"
        }
      },
      { $set: { lead: { $arrayElemAt: ["$lead", 0] } } },
      {
        $lookup: {
          from: UserModel.collection.name,
          localField: "assigneeUserId",
          foreignField: "_id",
          as: "assignee"
        }
      },
      {
        $project: {
          _id: 1,
          issues: {
            $concatArrays: [
              {
                $cond: [
                  {
                    $or: [
                      { $eq: [{ $size: "$project" }, 0] },
                      { $eq: [{ $ifNull: ["$estimate._id", null] }, null] },
                      { $ne: [{ $ifNull: ["$estimate.projectId", { $arrayElemAt: ["$lead.projectId", 0] }] }, "$projectId"] },
                      { $gt: ["$designPlanVersion", "$estimate.designPlanVersion"] }
                    ]
                  },
                  { $cond: [{ $eq: ["$kind", "procurement"] }, ["procurement"], ["task"]] },
                  []
                ]
              },
              {
                $cond: [
                  {
                    $and: [
                      { $ne: [{ $ifNull: ["$assigneeUserId", null] }, null] },
                      { $eq: [{ $size: "$assignee" }, 0] }
                    ]
                  },
                  ["assignee"],
                  []
                ]
              }
            ]
          }
        }
      },
      { $unwind: "$issues" },
      {
        $facet: {
          count: [{ $group: { _id: "$issues", value: { $sum: 1 } } }],
          items: [{ $sort: { _id: 1 } }, { $limit: 50 }, { $project: { _id: 1, issue: "$issues" } }]
        }
      }
    ] as PipelineStage[]).exec(),
    EstimateClientReviewRoundModel.aggregate<MongoRow>([
      { $set: { reviewKind: "estimate", resolvedProjectId: "$projectId" } },
      {
        $unionWith: {
          coll: DesignPlanReviewRoundModel.collection.name,
          pipeline: [{ $set: { reviewKind: "design", resolvedProjectId: "$projectId" } }]
        }
      },
      ...(scopedProjectIds ? [{ $match: scopeMatch }] : []),
      { $lookup: { from: ProjectModel.collection.name, localField: "projectId", foreignField: "_id", as: "project" } },
      { $lookup: { from: EstimateModel.collection.name, localField: "estimateId", foreignField: "_id", as: "estimate" } },
      { $set: { estimate: { $arrayElemAt: ["$estimate", 0] } } },
      { $lookup: { from: LeadModel.collection.name, localField: "estimate.leadId", foreignField: "_id", as: "lead" } },
      { $set: { lead: { $arrayElemAt: ["$lead", 0] } } },
      {
        $match: {
          $expr: {
            $or: [
              { $eq: [{ $size: "$project" }, 0] },
              { $eq: [{ $ifNull: ["$estimate._id", null] }, null] },
              { $ne: [{ $ifNull: ["$estimate.projectId", "$lead.projectId"] }, "$projectId"] },
              {
                $cond: [
                  { $eq: ["$reviewKind", "estimate"] },
                  { $gt: ["$estimateVersion", "$estimate.version"] },
                  { $gt: ["$designPlanVersion", "$estimate.designPlanVersion"] }
                ]
              }
            ]
          }
        }
      },
      {
        $facet: {
          count: [{ $count: "value" }],
          items: [{ $sort: { _id: 1 } }, { $limit: 50 }, { $project: { _id: 1 } }]
        }
      }
    ] as PipelineStage[]).exec()
  ]);
  const qualities: DashboardDataQuality[] = [];
  const lineageMetricKeys = scopedProjectIds
    ? DASHBOARD_PROJECT_LINEAGE_DEPENDENCIES
    : DASHBOARD_SOURCE_DEPENDENCIES.lineage;
  const append = (
    result: MongoRow[],
    code: "estimate_project_lineage_mismatch" | "finance_project_lineage_mismatch",
    issueMetricKey: string,
    entityType: "estimate" | "finance_bucket",
    message: string
  ) => {
    const facet = result[0] ?? {};
    const total = Number(facet.count?.[0]?.value ?? 0);
    if (total === 0) return;
    qualities.push({
      status: "partial",
      totalIssueCount: total,
      unavailableMetricKeys: [...lineageMetricKeys],
      issues: (facet.items ?? []).map((item: MongoRow) => ({
        code, metricKey: issueMetricKey, message, entityType, entityId: String(item._id)
      }))
    });
  };
  append(
    estimateResult,
    "estimate_project_lineage_mismatch",
    scopedProjectIds ? "estimation.rows" : "estimation.trackedProjects",
    "estimate",
    "Estimate Project/Lead lineage is inconsistent."
  );
  append(
    bucketResult,
    "finance_project_lineage_mismatch",
    scopedProjectIds ? "finance.rows" : "finance.projectCount",
    "finance_bucket",
    "Finance bucket approved-baseline lineage is inconsistent."
  );
  append(
    reviewResult,
    "estimate_project_lineage_mismatch",
    scopedProjectIds ? "estimation.reviewRoundId" : "trends.estimatesApproved",
    "estimate",
    "Immutable review Project/Estimate identity is inconsistent."
  );
  const taskFacet = taskResult[0] ?? {};
  const taskTotal = (taskFacet.count ?? []).reduce(
    (sum: number, row: MongoRow) => sum + Number(row.value ?? 0),
    0
  );
  if (taskTotal > 0) {
    qualities.push({
      status: "partial",
      totalIssueCount: taskTotal,
      unavailableMetricKeys: [...lineageMetricKeys],
      issues: (taskFacet.items ?? []).map((item: MongoRow) => ({
        code: item.issue === "assignee"
          ? "assignee_identity_mismatch" as const
          : "task_project_lineage_mismatch" as const,
        metricKey: item.issue === "assignee"
          ? (scopedProjectIds ? "risk.projectDistribution" : "workforce.inactiveAssigneeTaskCount")
          : item.issue === "procurement"
            ? (scopedProjectIds ? "procurement.rows" : "procurement.eligibleProjects")
            : (scopedProjectIds ? "execution.rows" : "execution.total"),
        message: item.issue === "assignee"
          ? "Task assignee identity cannot be resolved."
          : "Workflow task Project/Estimate lineage is inconsistent.",
        entityType: "task" as const,
        entityId: String(item._id)
      }))
    });
  }
  return qualities.length === 0
    ? { status: "complete", totalIssueCount: 0, issues: [], unavailableMetricKeys: [] }
    : mergeDataQuality(...qualities);
}

function uniqueBounded(values: unknown[], limit: number): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))]
    .sort()
    .slice(0, limit);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mongoWorkflowDueExpression(task: string): MongoRow {
  return {
    $ifNull: [
      `${task}.dueAt`,
      {
        $dateAdd: {
          startDate: `${task}.openedAt`,
          unit: "day",
          amount: {
            $switch: {
              branches: Object.entries(WORKFLOW_TASK_SCHEDULE).map(([kind, schedule]) => ({
                case: { $eq: [`${task}.kind`, kind] },
                then: schedule.dueInDays
              })),
              default: 0
            }
          }
        }
      }
    ]
  };
}

function mongoWorkflowEffortExpression(task: string): MongoRow {
  return {
    $cond: [
      { $gt: [`${task}.plannedEffort`, 0] },
      `${task}.plannedEffort`,
      {
        $switch: {
          branches: Object.entries(WORKFLOW_TASK_SCHEDULE).map(([kind, schedule]) => ({
            case: { $eq: [`${task}.kind`, kind] },
            then: schedule.plannedEffort
          })),
          default: 1
        }
      }
    ]
  };
}

function mongoWorkforceDerivedFilterStages(input: {
  observedAt: string;
  startAt: string;
  endAt: string;
}): PipelineStage[] {
  const observedAt = new Date(input.observedAt);
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  const effectiveCompletionAt = {
    $ifNull: ["$task.completedAt", "$task.updatedAt"]
  };
  const updateWindowStart = { $max: ["$task.openedAt", startAt] };
  const updateWindowEnd = {
    $min: [
      observedAt,
      endAt,
      {
        $cond: [
          { $eq: ["$task.status", "completed"] },
          effectiveCompletionAt,
          observedAt
        ]
      }
    ]
  };
  const twoBusinessDaysAfterStart = {
    $dateAdd: {
      startDate: updateWindowStart,
      unit: "day",
      amount: {
        $switch: {
          branches: [
            { case: { $in: [{ $dayOfWeek: updateWindowStart }, [1, 2, 3, 4]] }, then: 2 },
            { case: { $in: [{ $dayOfWeek: updateWindowStart }, [5, 6]] }, then: 4 },
            { case: { $eq: [{ $dayOfWeek: updateWindowStart }, 7] }, then: 3 }
          ],
          default: 2
        }
      }
    }
  };
  return [
    {
      $lookup: {
        from: ProjectWorkflowTaskModel.collection.name,
        let: { workerId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$assigneeUserId", "$$workerId"] },
                  { $eq: ["$kind", "trade_execution"] }
                ]
              }
            }
          },
          {
            $lookup: {
              from: ProjectModel.collection.name,
              localField: "projectId",
              foreignField: "_id",
              pipeline: [{ $project: { _id: 1 } }],
              as: "_dashboardProject"
            }
          },
          { $match: { "_dashboardProject.0": { $exists: true } } },
          { $set: { task: "$$ROOT" } },
          {
            $set: {
              _dashboardTaskDueAt: mongoWorkflowDueExpression("$task"),
              _dashboardTaskEffort: mongoWorkflowEffortExpression("$task")
            }
          },
          {
            $set: {
              _dashboardKpiOverlap: {
                $or: [
                  {
                    $and: [
                      { $lte: ["$task.openedAt", endAt] },
                      { $gte: ["$_dashboardTaskDueAt", startAt] }
                    ]
                  },
                  {
                    $and: [
                      { $eq: ["$task.status", "completed"] },
                      { $gte: [effectiveCompletionAt, startAt] },
                      { $lte: [effectiveCompletionAt, endAt] }
                    ]
                  }
                ]
              }
            }
          },
          {
            $set: {
              _dashboardOnTimeEligible: {
                $and: [
                  "$_dashboardKpiOverlap",
                  {
                    $or: [
                      { $eq: ["$task.status", "completed"] },
                      { $lt: ["$_dashboardTaskDueAt", observedAt] }
                    ]
                  }
                ]
              },
              _dashboardTimingScore: {
                $cond: [
                  { $eq: ["$task.status", "completed"] },
                  {
                    $cond: [
                      { $lte: [effectiveCompletionAt, "$_dashboardTaskDueAt"] },
                      100,
                      {
                        $let: {
                          vars: {
                            duration: { $subtract: ["$_dashboardTaskDueAt", "$task.openedAt"] },
                            lateness: { $subtract: [effectiveCompletionAt, "$_dashboardTaskDueAt"] }
                          },
                          in: {
                            $cond: [
                              { $gt: ["$$duration", 0] },
                              {
                                $switch: {
                                  branches: [
                                    { case: { $lte: [{ $divide: ["$$lateness", "$$duration"] }, 0.1] }, then: 70 },
                                    { case: { $lte: [{ $divide: ["$$lateness", "$$duration"] }, 0.25] }, then: 40 }
                                  ],
                                  default: 0
                                }
                              },
                              0
                            ]
                          }
                        }
                      }
                    ]
                  },
                  0
                ]
              },
              _dashboardUpdateEligible: {
                $and: [
                  "$_dashboardKpiOverlap",
                  { $lte: [twoBusinessDaysAfterStart, updateWindowEnd] }
                ]
              }
            }
          },
          {
            $group: {
              _id: null,
              activeTaskCount: {
                $sum: { $cond: [{ $ne: ["$task.status", "completed"] }, 1, 0] }
              },
              plannedEffort: {
                $sum: { $cond: ["$_dashboardKpiOverlap", "$_dashboardTaskEffort", 0] }
              },
              completedEffort: {
                $sum: {
                  $cond: [
                    { $and: ["$_dashboardKpiOverlap", { $eq: ["$task.status", "completed"] }] },
                    "$_dashboardTaskEffort",
                    0
                  ]
                }
              },
              kpiEligibleTaskCount: {
                $sum: { $cond: ["$_dashboardKpiOverlap", 1, 0] }
              },
              completedInPeriod: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$task.status", "completed"] },
                        { $gte: [effectiveCompletionAt, startAt] },
                        { $lte: [effectiveCompletionAt, endAt] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              onTimeEffort: {
                $sum: { $cond: ["$_dashboardOnTimeEligible", "$_dashboardTaskEffort", 0] }
              },
              onTimeWeightedScore: {
                $sum: {
                  $cond: [
                    "$_dashboardOnTimeEligible",
                    { $multiply: ["$_dashboardTimingScore", "$_dashboardTaskEffort"] },
                    0
                  ]
                }
              },
              updateEligibleTaskCount: {
                $sum: { $cond: ["$_dashboardUpdateEligible", 1, 0] }
              }
            }
          }
        ],
        as: "_dashboardWorkforceSummary"
      }
    },
    {
      $set: {
        _dashboardActiveTaskCount: {
          $ifNull: [{ $arrayElemAt: ["$_dashboardWorkforceSummary.activeTaskCount", 0] }, 0]
        },
        _dashboardPlannedEffort: {
          $ifNull: [{ $arrayElemAt: ["$_dashboardWorkforceSummary.plannedEffort", 0] }, 0]
        },
        _dashboardCompletedEffort: {
          $ifNull: [{ $arrayElemAt: ["$_dashboardWorkforceSummary.completedEffort", 0] }, 0]
        },
        _dashboardKpiEligibleTaskCount: {
          $ifNull: [{ $arrayElemAt: ["$_dashboardWorkforceSummary.kpiEligibleTaskCount", 0] }, 0]
        },
        _dashboardCompletedInPeriod: {
          $ifNull: [{ $arrayElemAt: ["$_dashboardWorkforceSummary.completedInPeriod", 0] }, 0]
        },
        _dashboardOnTimeEffort: {
          $ifNull: [{ $arrayElemAt: ["$_dashboardWorkforceSummary.onTimeEffort", 0] }, 0]
        },
        _dashboardOnTimeWeightedScore: {
          $ifNull: [{ $arrayElemAt: ["$_dashboardWorkforceSummary.onTimeWeightedScore", 0] }, 0]
        },
        _dashboardUpdateEligibleTaskCount: {
          $ifNull: [{ $arrayElemAt: ["$_dashboardWorkforceSummary.updateEligibleTaskCount", 0] }, 0]
        }
      }
    },
    {
      $set: {
        _dashboardOnTimeScore: {
          $cond: [
            { $gt: ["$_dashboardOnTimeEffort", 0] },
            { $divide: ["$_dashboardOnTimeWeightedScore", "$_dashboardOnTimeEffort"] },
            null
          ]
        },
        _dashboardWorkloadScore: {
          $cond: [
            { $gt: ["$_dashboardPlannedEffort", 0] },
            { $multiply: [{ $divide: ["$_dashboardCompletedEffort", "$_dashboardPlannedEffort"] }, 100] },
            null
          ]
        },
        _dashboardKpiEligibleWeight: {
          $add: [
            { $cond: [{ $gt: ["$_dashboardKpiEligibleTaskCount", 0] }, 10, 0] },
            { $cond: [{ $gt: ["$_dashboardOnTimeEffort", 0] }, 35, 0] },
            { $cond: [{ $gt: ["$_dashboardUpdateEligibleTaskCount", 0] }, 15, 0] }
          ]
        }
      }
    },
    {
      $set: {
        _dashboardAssignmentState: {
          $cond: [{ $gt: ["$_dashboardActiveTaskCount", 0] }, "assigned", "unassigned"]
        },
        _dashboardKpiAvailability: {
          $cond: [{ $gt: ["$_dashboardKpiEligibleTaskCount", 0] }, "available", "unavailable"]
        },
        _dashboardKpiAvailableRank: {
          $cond: [{ $gt: ["$_dashboardKpiEligibleTaskCount", 0] }, 1, 0]
        },
        _dashboardKpiEligibleComponentCount: {
          $add: [
            { $cond: [{ $gt: ["$_dashboardKpiEligibleTaskCount", 0] }, 1, 0] },
            { $cond: [{ $gt: ["$_dashboardOnTimeEffort", 0] }, 1, 0] },
            { $cond: [{ $gt: ["$_dashboardUpdateEligibleTaskCount", 0] }, 1, 0] }
          ]
        },
        _dashboardKpiScoreBps: {
          $cond: [
            { $gt: ["$_dashboardKpiEligibleWeight", 0] },
            {
              $multiply: [
                {
                  $floor: {
                    $add: [
                      {
                        $multiply: [
                          {
                            $divide: [
                              {
                                $add: [
                                  { $multiply: [{ $ifNull: ["$_dashboardOnTimeScore", 0] }, 35] },
                                  { $multiply: [{ $ifNull: ["$_dashboardWorkloadScore", 0] }, 10] }
                                ]
                              },
                              "$_dashboardKpiEligibleWeight"
                            ]
                          },
                          10
                        ]
                      },
                      0.5
                    ]
                  }
                },
                10
              ]
            },
            null
          ]
        },
        _dashboardRemainingWorkloadPercentage: {
          $cond: [
            { $gt: ["$_dashboardPlannedEffort", 0] },
            {
              $floor: {
                $add: [
                  {
                    $multiply: [
                      {
                        $divide: [
                          { $subtract: ["$_dashboardPlannedEffort", "$_dashboardCompletedEffort"] },
                          "$_dashboardPlannedEffort"
                        ]
                      },
                      100
                    ]
                  },
                  0.5
                ]
              }
            },
            0
          ]
        }
      }
    },
    { $unset: "_dashboardWorkforceSummary" }
  ];
}

async function mongoWorkforceOverview(input: {
  observedAt: string;
  startAt: string;
  endAt: string;
}): Promise<DashboardWorkforceMetrics> {
  const [workerFacet, inactiveRows] = await Promise.all([
    UserModel.aggregate<MongoRow>([
      { $match: { active: true, role: { $in: [...WORKER_ROLES] } } },
      ...mongoWorkforceDerivedFilterStages(input),
      {
        $facet: {
          summary: [{
            $group: {
              _id: null,
              activeWorkers: { $sum: 1 },
              assignedWorkers: {
                $sum: { $cond: [{ $eq: ["$_dashboardAssignmentState", "assigned"] }, 1, 0] }
              },
              activeAssignedTaskCount: { $sum: "$_dashboardActiveTaskCount" },
              completedInPeriodTaskCount: { $sum: "$_dashboardCompletedInPeriod" },
              kpiEligibleWorkers: {
                $sum: { $cond: [{ $eq: ["$_dashboardKpiAvailability", "available"] }, 1, 0] }
              },
              kpiScoreBpsSum: { $sum: { $ifNull: ["$_dashboardKpiScoreBps", 0] } }
            }
          }],
          roles: [
            { $group: { _id: "$role", workerCount: { $sum: 1 } } },
            { $sort: { _id: 1 } }
          ]
        }
      }
    ] as PipelineStage[]).exec(),
    ProjectWorkflowTaskModel.aggregate<MongoRow>([
      {
        $match: {
          kind: { $in: ["site_execution", "trade_execution"] },
          status: { $ne: "completed" },
          assigneeUserId: { $ne: null }
        }
      },
      {
        $lookup: {
          from: ProjectModel.collection.name,
          localField: "projectId",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1 } }],
          as: "project"
        }
      },
      { $match: { "project.0": { $exists: true } } },
      {
        $lookup: {
          from: UserModel.collection.name,
          localField: "assigneeUserId",
          foreignField: "_id",
          as: "assignee"
        }
      },
      { $set: { assignee: { $arrayElemAt: ["$assignee", 0] } } },
      {
        $match: {
          $or: [
            { "assignee._id": { $exists: false } },
            { "assignee.active": { $ne: true } }
          ]
        }
      },
      { $count: "value" }
    ]).exec()
  ]);
  const summary = workerFacet[0]?.summary?.[0] ?? {};
  const activeWorkers = Number(summary.activeWorkers ?? 0);
  const assignedWorkers = Number(summary.assignedWorkers ?? 0);
  const kpiEligibleWorkers = Number(summary.kpiEligibleWorkers ?? 0);
  const kpiScoreBpsSum = Number(summary.kpiScoreBpsSum ?? 0);
  const kpiDenominator = kpiEligibleWorkers * 10_000;
  return {
    activeWorkers,
    assignedWorkers,
    unassignedWorkers: Math.max(0, activeWorkers - assignedWorkers),
    activeAssignedTaskCount: Number(summary.activeAssignedTaskCount ?? 0),
    activeUnassignedTaskCount: 0,
    completedInPeriodTaskCount: Number(summary.completedInPeriodTaskCount ?? 0),
    overCapacityWorkers: null,
    capacityAvailable: false,
    inactiveAssigneeTaskCount: Number(inactiveRows[0]?.value ?? 0),
    kpiEligibleWorkers,
    kpiUnavailableWorkers: Math.max(0, activeWorkers - kpiEligibleWorkers),
    averageKpi: {
      numerator: kpiScoreBpsSum,
      denominator: kpiDenominator,
      rateBps: kpiDenominator === 0
        ? null
        : Math.round(kpiScoreBpsSum * 10_000 / kpiDenominator)
    },
    roleDistribution: (workerFacet[0]?.roles ?? []).map((row: MongoRow) => ({
      role: row._id as WorkerRole,
      workerCount: Number(row.workerCount)
    }))
  };
}

function mongoTaskRiskReasonExpression(input: {
  startAt: unknown;
  deadlineAt: unknown;
  status: unknown;
  progress: unknown;
  observedAt: Date;
  blockedStatusAvailable: boolean;
}): MongoRow {
  const progressRatio = {
    $divide: [{ $min: [100, { $max: [0, input.progress] }] }, 100]
  };
  const duration = { $subtract: [input.deadlineAt, input.startAt] };
  const elapsed = { $subtract: [input.observedAt, input.startAt] };
  const elapsedRatio = {
    $min: [
      1,
      { $max: [0, { $cond: [{ $gt: [duration, 0] }, { $divide: [elapsed, duration] }, 0] }] }
    ]
  };
  const forecastLate = {
    $cond: [
      { $and: [{ $gt: [elapsed, 0] }, { $gt: [progressRatio, 0] }] },
      {
        $gt: [
          {
            $add: [
              input.observedAt,
              { $divide: [{ $multiply: [{ $subtract: [1, progressRatio] }, elapsed] }, progressRatio] }
            ]
          },
          input.deadlineAt
        ]
      },
      false
    ]
  };
  const scheduleBuffer = { $subtract: [progressRatio, elapsedRatio] };
  return {
    $switch: {
      branches: [
        {
          case: {
            $and: [
              { $ne: [input.status, "completed"] },
              { $lt: [input.deadlineAt, input.observedAt] }
            ]
          },
          then: "task_overdue"
        },
        ...(input.blockedStatusAvailable ? [{
          case: { $eq: [input.status, "blocked"] },
          then: "task_blocked"
        }] : []),
        {
          case: {
            $and: [
              { $ne: [input.status, "completed"] },
              { $gte: [input.deadlineAt, input.observedAt] },
              forecastLate
            ]
          },
          then: "task_forecast_late"
        },
        {
          case: {
            $and: [
              { $ne: [input.status, "completed"] },
              { $gte: [input.observedAt, input.startAt] },
              { $gte: [input.deadlineAt, input.observedAt] },
              { $lte: [{ $subtract: [input.deadlineAt, input.observedAt] }, TASK_RISK_DUE_SOON_MS] }
            ]
          },
          then: "task_due_soon"
        },
        {
          case: {
            $and: [
              { $ne: [input.status, "completed"] },
              { $gte: [input.observedAt, input.startAt] },
              { $lt: [scheduleBuffer, 0] }
            ]
          },
          then: "task_behind_schedule"
        },
        {
          case: {
            $and: [
              { $ne: [input.status, "completed"] },
              { $gte: [input.observedAt, input.startAt] },
              { $lt: [{ $add: [scheduleBuffer, Number.EPSILON] }, TASK_RISK_MIN_SCHEDULE_BUFFER] }
            ]
          },
          then: "task_low_schedule_buffer"
        }
      ],
      default: null
    }
  };
}

async function mongoRiskFactorDistribution(
  observedAt: Date
): Promise<DashboardFactorDistributionItem[]> {
  const workflowDueAt = mongoWorkflowDueExpression("$task");
  const workflowRiskReason = mongoTaskRiskReasonExpression({
    startAt: "$task.openedAt",
    deadlineAt: workflowDueAt,
    status: "$task.status",
    progress: "$task.progress",
    observedAt,
    blockedStatusAvailable: false
  });
  const designRiskReason = mongoTaskRiskReasonExpression({
    startAt: "$plannedStartAt",
    deadlineAt: "$currentDeadlineAt",
    status: "$status",
    progress: "$progress",
    observedAt,
    blockedStatusAvailable: true
  });
  const eventProjection = {
    projectId: "$_id.projectId",
    kind: "$_id.kind",
    level: "$_id.level",
    reasonCode: "$_id.reasonCode",
    occurrenceCount: "$occurrenceCount"
  };
  const pipeline: PipelineStage[] = [
    {
      $project: {
        projectId: "$_id",
        factors: {
          $concatArrays: [
            {
              $cond: [
                { $and: [{ $ne: ["$status", "completed"] }, { $lt: ["$plannedEndAt", observedAt] }] },
                [{ kind: "schedule", level: "red", reasonCode: "project_deadline_overdue" }],
                []
              ]
            },
            {
              $cond: [
                { $eq: ["$status", "on_hold"] },
                [{ kind: "workflow", level: "yellow", reasonCode: "project_on_hold" }],
                []
              ]
            }
          ]
        }
      }
    },
    { $unwind: "$factors" },
    { $project: { projectId: 1, kind: "$factors.kind", level: "$factors.level", reasonCode: "$factors.reasonCode" } },
    {
      $unionWith: {
        coll: ProjectWorkflowTaskModel.collection.name,
        pipeline: [
          { $set: { task: "$$ROOT" } },
          {
            $lookup: {
              from: ProjectModel.collection.name,
              localField: "projectId",
              foreignField: "_id",
              as: "project"
            }
          },
          { $match: { "project.0": { $exists: true } } },
          {
            $lookup: {
              from: UserModel.collection.name,
              localField: "assigneeUserId",
              foreignField: "_id",
              as: "assignee"
            }
          },
          {
            $set: {
              scheduleReason: workflowRiskReason,
              staffingReason: {
                $switch: {
                  branches: [
                    {
                      case: {
                        $and: [
                          { $in: ["$task.kind", ["site_execution", "trade_execution"]] },
                          { $ne: ["$task.status", "completed"] },
                          { $ne: [{ $ifNull: ["$task.assigneeUserId", null] }, null] },
                          {
                            $or: [
                              { $eq: [{ $size: "$assignee" }, 0] },
                              { $ne: [{ $arrayElemAt: ["$assignee.active", 0] }, true] }
                            ]
                          }
                        ]
                      },
                      then: "inactive_execution_assignee"
                    },
                    {
                      case: {
                        $and: [
                          { $in: ["$task.kind", ["site_execution", "trade_execution"]] },
                          { $ne: ["$task.status", "completed"] },
                          { $eq: [{ $ifNull: ["$task.assigneeUserId", null] }, null] },
                          { $lt: [workflowDueAt, observedAt] }
                        ]
                      },
                      then: "overdue_execution_unassigned"
                    },
                    {
                      case: {
                        $and: [
                          { $in: ["$task.kind", ["site_execution", "trade_execution"]] },
                          { $ne: ["$task.status", "completed"] },
                          { $eq: [{ $ifNull: ["$task.assigneeUserId", null] }, null] }
                        ]
                      },
                      then: "active_execution_unassigned"
                    }
                  ],
                  default: null
                }
              }
            }
          },
          {
            $project: {
              projectId: "$task.projectId",
              factors: {
                $concatArrays: [
                  {
                    $cond: [
                      { $ne: ["$scheduleReason", null] },
                      [{
                        kind: "schedule",
                        level: { $cond: [{ $eq: ["$scheduleReason", "task_overdue"] }, "red", "yellow"] },
                        reasonCode: "$scheduleReason"
                      }],
                      []
                    ]
                  },
                  {
                    $cond: [
                      { $ne: ["$staffingReason", null] },
                      [{
                        kind: "staffing",
                        level: {
                          $cond: [
                            { $eq: ["$staffingReason", "active_execution_unassigned"] },
                            "yellow",
                            "red"
                          ]
                        },
                        reasonCode: "$staffingReason"
                      }],
                      []
                    ]
                  }
                ]
              }
            }
          },
          { $unwind: "$factors" },
          { $project: { projectId: 1, kind: "$factors.kind", level: "$factors.level", reasonCode: "$factors.reasonCode" } }
        ]
      }
    },
    {
      $unionWith: {
        coll: TaskModel.collection.name,
        pipeline: [
          {
            $lookup: {
              from: ProjectModel.collection.name,
              localField: "projectId",
              foreignField: "_id",
              as: "project"
            }
          },
          { $match: { "project.0": { $exists: true } } },
          { $set: { reasonCode: designRiskReason } },
          { $match: { reasonCode: { $ne: null } } },
          {
            $project: {
              projectId: 1,
              kind: { $literal: "schedule" },
              level: { $cond: [{ $eq: ["$reasonCode", "task_overdue"] }, "red", "yellow"] },
              reasonCode: 1
            }
          }
        ]
      }
    },
    {
      $unionWith: {
        coll: ProjectFinanceBucketModel.collection.name,
        pipeline: [
          {
            $lookup: {
              from: ProjectModel.collection.name,
              localField: "projectId",
              foreignField: "_id",
              as: "project"
            }
          },
          {
            $lookup: {
              from: EstimateModel.collection.name,
              localField: "estimateId",
              foreignField: "_id",
              as: "estimate"
            }
          },
          { $set: { project: { $arrayElemAt: ["$project", 0] }, estimate: { $arrayElemAt: ["$estimate", 0] } } },
          {
            $lookup: {
              from: LeadModel.collection.name,
              localField: "estimate.leadId",
              foreignField: "_id",
              as: "lead"
            }
          },
          { $set: { lead: { $arrayElemAt: ["$lead", 0] } } },
          {
            $match: {
              "project._id": { $exists: true },
              "estimate.status": "client_approved",
              $expr: {
                $and: [
                  { $eq: [{ $ifNull: ["$estimate.projectId", "$lead.projectId"] }, "$projectId"] },
                  {
                    $eq: [
                      "$estimateVersion",
                      { $cond: [{ $gt: ["$estimate.version", 1] }, { $subtract: ["$estimate.version", 1] }, 1] }
                    ]
                  }
                ]
              }
            }
          },
          { $set: { recordedCost: { $add: ["$directSpendPaise", "$overheadPaise"] } } },
          {
            $set: {
              reasonCode: {
                $switch: {
                  branches: [
                    { case: { $gt: ["$recordedCost", "$costBudgetPaise"] }, then: "cost_budget_exceeded" },
                    {
                      case: {
                        $and: [
                          { $ne: ["$project.status", "completed"] },
                          { $gt: ["$costBudgetPaise", 0] },
                          { $gte: [{ $multiply: ["$recordedCost", 10] }, { $multiply: ["$costBudgetPaise", 9] }] }
                        ]
                      },
                      then: "cost_budget_headroom_low"
                    }
                  ],
                  default: null
                }
              }
            }
          },
          { $match: { reasonCode: { $ne: null } } },
          {
            $project: {
              projectId: 1,
              kind: { $literal: "finance" },
              level: { $cond: [{ $eq: ["$reasonCode", "cost_budget_exceeded"] }, "red", "yellow"] },
              reasonCode: 1
            }
          }
        ]
      }
    },
    {
      $unionWith: {
        coll: LeadModel.collection.name,
        pipeline: [
          {
            $lookup: {
              from: ProjectModel.collection.name,
              localField: "projectId",
              foreignField: "_id",
              as: "project"
            }
          },
          {
            $match: {
              "project.0": { $exists: true },
              stage: { $nin: ["won", "lost"] },
              nextActionAt: { $lt: observedAt }
            }
          },
          {
            $project: {
              projectId: 1,
              kind: { $literal: "workflow" },
              level: { $literal: "red" },
              reasonCode: { $literal: "lead_next_action_overdue" }
            }
          }
        ]
      }
    },
    {
      $unionWith: {
        coll: EstimateModel.collection.name,
        pipeline: [
          {
            $lookup: {
              from: LeadModel.collection.name,
              localField: "leadId",
              foreignField: "_id",
              as: "lead"
            }
          },
          { $set: { lead: { $arrayElemAt: ["$lead", 0] } } },
          {
            $set: {
              resolvedProjectId: { $ifNull: ["$projectId", "$lead.projectId"] },
              lineageValid: {
                $or: [
                  { $eq: [{ $ifNull: ["$projectId", null] }, null] },
                  { $eq: ["$projectId", "$lead.projectId"] }
                ]
              }
            }
          },
          {
            $lookup: {
              from: ProjectModel.collection.name,
              localField: "resolvedProjectId",
              foreignField: "_id",
              as: "project"
            }
          },
          { $match: { lineageValid: true, "project.0": { $exists: true } } },
          {
            $project: {
              projectId: "$resolvedProjectId",
              factors: {
                $concatArrays: [
                  {
                    $cond: [
                      { $eq: ["$status", "client_changes_requested"] },
                      [{ kind: "workflow", level: "yellow", reasonCode: "estimate_changes_requested" }],
                      []
                    ]
                  },
                  {
                    $cond: [
                      { $eq: ["$designPlanStatus", "changes_requested"] },
                      [{ kind: "workflow", level: "yellow", reasonCode: "design_changes_requested" }],
                      []
                    ]
                  }
                ]
              }
            }
          },
          { $unwind: "$factors" },
          { $project: { projectId: 1, kind: "$factors.kind", level: "$factors.level", reasonCode: "$factors.reasonCode" } }
        ]
      }
    },
    ...[EstimateClientReviewRoundModel, DesignPlanReviewRoundModel].map((model, index) => ({
      $unionWith: {
        coll: model.collection.name,
        pipeline: [
          {
            $lookup: {
              from: ProjectModel.collection.name,
              localField: "projectId",
              foreignField: "_id",
              as: "project"
            }
          },
          { $lookup: { from: EstimateModel.collection.name, localField: "estimateId", foreignField: "_id", as: "estimate" } },
          { $set: { estimate: { $arrayElemAt: ["$estimate", 0] } } },
          { $lookup: { from: LeadModel.collection.name, localField: "estimate.leadId", foreignField: "_id", as: "lead" } },
          { $set: { lead: { $arrayElemAt: ["$lead", 0] } } },
          {
            $match: {
              "project.0": { $exists: true },
              "estimate._id": { $exists: true },
              deliveryStatus: { $in: ["failed", "disabled"] },
              $expr: {
                $and: [
                  { $eq: [{ $ifNull: ["$estimate.projectId", "$lead.projectId"] }, "$projectId"] },
                  index === 0
                    ? { $lte: ["$estimateVersion", "$estimate.version"] }
                    : { $eq: ["$designPlanVersion", "$estimate.designPlanVersion"] }
                ]
              }
            }
          },
          {
            $project: {
              projectId: 1,
              kind: { $literal: "workflow" },
              level: { $literal: "yellow" },
              reasonCode: {
                $cond: [{ $eq: ["$deliveryStatus", "failed"] }, "delivery_failed", "delivery_disabled"]
              }
            }
          }
        ]
      }
    } as PipelineStage)),
    {
      $group: {
        _id: { projectId: "$projectId", kind: "$kind", level: "$level", reasonCode: "$reasonCode" },
        occurrenceCount: { $sum: 1 }
      }
    },
    { $project: eventProjection },
    {
      $group: {
        _id: { kind: "$kind", level: "$level", reasonCode: "$reasonCode" },
        occurrenceCount: { $sum: "$occurrenceCount" },
        projectCount: { $sum: 1 }
      }
    },
    { $sort: { "_id.kind": 1, "_id.level": 1, "_id.reasonCode": 1 } }
  ];
  const rows = await ProjectModel.aggregate<MongoRow>(pipeline).exec();
  return rows.map((row) => ({
    kind: row._id.kind,
    level: row._id.level,
    reasonCode: row._id.reasonCode,
    occurrenceCount: Number(row.occurrenceCount),
    projectCount: Number(row.projectCount)
  }));
}

function mongoProjectDerivedFilterStages(
  filters: DashboardProjectFilters,
  observedAt: Date
): PipelineStage[] {
  const needsDerived = filters.sort === "risk_desc" || filters.module !== undefined ||
    filters.moduleStatus !== undefined || filters.riskLevel !== undefined ||
    filters.riskFactor !== undefined;
  const derivedMatch: MongoRow = {};
  if (filters.riskLevel) derivedMatch._dashboardRiskLevel = filters.riskLevel;
  if (filters.riskFactor) derivedMatch[`_dashboardFactor_${filters.riskFactor}`] = true;
  if (filters.module) derivedMatch._dashboardModuleMatches = filters.module;
  if (filters.moduleStatus) derivedMatch._dashboardModuleStatuses = filters.moduleStatus;
  const workflowDueAt = mongoWorkflowDueExpression("$task");
  const workflowReason = mongoTaskRiskReasonExpression({
    startAt: "$task.openedAt",
    deadlineAt: workflowDueAt,
    status: "$task.status",
    progress: "$task.progress",
    observedAt,
    blockedStatusAvailable: false
  });
  const designReason = mongoTaskRiskReasonExpression({
    startAt: "$plannedStartAt",
    deadlineAt: "$currentDeadlineAt",
    status: "$status",
    progress: "$progress",
    observedAt,
    blockedStatusAvailable: true
  });
  return [
    {
      $lookup: {
        from: LeadModel.collection.name,
        let: { projectId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$projectId", "$$projectId"] } } },
          {
            $group: {
              _id: null,
              leadIds: { $addToSet: "$_id" },
              trackedCount: { $sum: 1 },
              overdueCount: {
                $sum: {
                  $cond: [
                    { $and: [{ $not: [{ $in: ["$stage", ["won", "lost"]] }] }, { $lt: ["$nextActionAt", observedAt] }] },
                    1,
                    0
                  ]
                }
              }
            }
          }
        ],
        as: "_dashboardLeadFacts"
      }
    },
    {
      $lookup: {
        from: EstimateModel.collection.name,
        let: {
          projectId: "$_id",
          leadIds: { $ifNull: [{ $arrayElemAt: ["$_dashboardLeadFacts.leadIds", 0] }, []] }
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $in: ["$leadId", "$$leadIds"] },
                  {
                    $or: [
                      { $eq: [{ $ifNull: ["$projectId", null] }, null] },
                      { $eq: ["$projectId", "$$projectId"] }
                    ]
                  }
                ]
              }
            }
          },
          { $set: { _approvedRank: { $cond: [{ $eq: ["$status", "client_approved"] }, 1, 0] } } },
          { $sort: { _approvedRank: -1, clientDecisionAt: -1, updatedAt: -1, _id: 1 } },
          { $limit: 1 }
        ],
        as: "_dashboardEstimates"
      }
    },
    {
      $lookup: {
        from: ProjectWorkflowTaskModel.collection.name,
        let: {
          projectId: "$_id",
          canonicalEstimateId: { $arrayElemAt: ["$_dashboardEstimates._id", 0] },
          canonicalDesignPlanVersion: { $arrayElemAt: ["$_dashboardEstimates.designPlanVersion", 0] },
          canonicalDesignPlanStatus: { $arrayElemAt: ["$_dashboardEstimates.designPlanStatus", 0] }
        },
        pipeline: [
          { $match: { $expr: { $eq: ["$projectId", "$$projectId"] } } },
          { $set: { task: "$$ROOT" } },
          {
            $lookup: {
              from: UserModel.collection.name,
              localField: "assigneeUserId",
              foreignField: "_id",
              pipeline: [{ $project: { _id: 1, active: 1 } }],
              as: "assignee"
            }
          },
          {
            $set: {
              dueAt: workflowDueAt,
              reasonCode: workflowReason,
              procurementLineageValid: {
                $and: [
                  { $eq: ["$task.kind", "procurement"] },
                  { $eq: ["$$canonicalDesignPlanStatus", "approved"] },
                  { $eq: ["$task.estimateId", "$$canonicalEstimateId"] },
                  { $eq: ["$task.designPlanVersion", "$$canonicalDesignPlanVersion"] }
                ]
              }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              executionCount: { $sum: { $cond: [{ $in: ["$task.kind", ["site_execution", "trade_execution"]] }, 1, 0] } },
              executionOverdueCount: { $sum: { $cond: [{ $and: [{ $in: ["$task.kind", ["site_execution", "trade_execution"]] }, { $ne: ["$task.status", "completed"] }, { $lt: ["$dueAt", observedAt] }] }, 1, 0] } },
              executionUnassignedCount: { $sum: { $cond: [{ $and: [{ $in: ["$task.kind", ["site_execution", "trade_execution"]] }, { $ne: ["$task.status", "completed"] }, { $eq: [{ $ifNull: ["$task.assigneeUserId", null] }, null] }] }, 1, 0] } },
              executionProgressNumerator: {
                $sum: {
                  $cond: [
                    { $in: ["$task.kind", ["site_execution", "trade_execution"]] },
                    {
                      $multiply: [
                        { $cond: [{ $eq: ["$task.status", "completed"] }, 100, "$task.progress"] },
                        mongoWorkflowEffortExpression("$task")
                      ]
                    },
                    0
                  ]
                }
              },
              executionProgressDenominator: {
                $sum: {
                  $cond: [
                    { $in: ["$task.kind", ["site_execution", "trade_execution"]] },
                    { $multiply: [100, mongoWorkflowEffortExpression("$task")] },
                    0
                  ]
                }
              },
              executionFallbackTaskCount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $in: ["$task.kind", ["site_execution", "trade_execution"]] },
                        { $not: [{ $gt: ["$task.plannedEffort", 0] }] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              procurementCount: { $sum: { $cond: ["$procurementLineageValid", 1, 0] } },
              executionStatuses: { $addToSet: { $cond: [{ $in: ["$task.kind", ["site_execution", "trade_execution"]] }, "$task.status", null] } },
              procurementStatuses: { $addToSet: { $cond: ["$procurementLineageValid", "$task.status", null] } },
              scheduleRed: { $max: { $cond: [{ $eq: ["$reasonCode", "task_overdue"] }, 1, 0] } },
              scheduleYellow: { $max: { $cond: [{ $and: [{ $ne: ["$reasonCode", null] }, { $ne: ["$reasonCode", "task_overdue"] }] }, 1, 0] } },
              riskOccurrenceCount: {
                $sum: {
                  $add: [
                    { $cond: [{ $ne: ["$reasonCode", null] }, 1, 0] },
                    { $cond: [{ $and: [{ $in: ["$task.kind", ["site_execution", "trade_execution"]] }, { $ne: ["$task.status", "completed"] }, { $eq: [{ $ifNull: ["$task.assigneeUserId", null] }, null] }] }, 1, 0] }
                  ]
                }
              },
              maxOverdueMs: {
                $max: {
                  $cond: [
                    { $and: [{ $ne: ["$task.status", "completed"] }, { $lt: ["$dueAt", observedAt] }] },
                    { $subtract: [observedAt, "$dueAt"] },
                    0
                  ]
                }
              },
              executionOverdue: { $max: { $cond: [{ $and: [{ $in: ["$task.kind", ["site_execution", "trade_execution"]] }, { $ne: ["$task.status", "completed"] }, { $lt: ["$dueAt", observedAt] }] }, 1, 0] } },
              staffingRed: {
                $max: {
                  $cond: [
                    {
                      $and: [
                        { $in: ["$task.kind", ["site_execution", "trade_execution"]] },
                        { $ne: ["$task.status", "completed"] },
                        {
                          $or: [
                            { $and: [{ $eq: [{ $ifNull: ["$task.assigneeUserId", null] }, null] }, { $lt: ["$dueAt", observedAt] }] },
                            { $and: [{ $ne: [{ $ifNull: ["$task.assigneeUserId", null] }, null] }, { $or: [{ $eq: [{ $size: "$assignee" }, 0] }, { $ne: [{ $arrayElemAt: ["$assignee.active", 0] }, true] }] }] }
                          ]
                        }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              staffingYellow: {
                $max: {
                  $cond: [
                    { $and: [{ $in: ["$task.kind", ["site_execution", "trade_execution"]] }, { $ne: ["$task.status", "completed"] }, { $eq: [{ $ifNull: ["$task.assigneeUserId", null] }, null] }, { $gte: ["$dueAt", observedAt] }] },
                    1,
                    0
                  ]
                }
              }
            }
          }
        ],
        as: "_dashboardWorkflowFacts"
      }
    },
    {
      $lookup: {
        from: TaskModel.collection.name,
        let: { projectId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$projectId", "$$projectId"] } } },
          { $set: { reasonCode: designReason } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              scheduleRed: { $max: { $cond: [{ $eq: ["$reasonCode", "task_overdue"] }, 1, 0] } },
              scheduleYellow: { $max: { $cond: [{ $and: [{ $ne: ["$reasonCode", null] }, { $ne: ["$reasonCode", "task_overdue"] }] }, 1, 0] } },
              riskOccurrenceCount: { $sum: { $cond: [{ $ne: ["$reasonCode", null] }, 1, 0] } },
              maxOverdueMs: { $max: { $cond: [{ $eq: ["$reasonCode", "task_overdue"] }, { $subtract: [observedAt, "$currentDeadlineAt"] }, 0] } }
            }
          }
        ],
        as: "_dashboardDesignFacts"
      }
    },
    {
      $lookup: {
        from: ProjectFinanceBucketModel.collection.name,
        let: { projectId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$projectId", "$$projectId"] } } },
          {
            $project: {
              _id: 1, projectId: 1, estimateId: 1, estimateVersion: 1,
              estimateReviewRoundId: 1, designPlanVersion: 1, currency: 1,
              approvedSubtotalPaise: 1, approvedGstPaise: 1,
              approvedContractTotalPaise: 1, targetMarginBps: 1,
              targetProfitPaise: 1, costBudgetPaise: 1,
              directSpendPaise: 1, overheadPaise: 1, status: 1
            }
          },
          { $limit: 1 }
        ],
        as: "_dashboardFinanceBuckets"
      }
    },
    {
      $lookup: {
        from: EstimateClientReviewRoundModel.collection.name,
        let: {
          estimateId: { $arrayElemAt: ["$_dashboardEstimates._id", 0] },
          approvedVersion: {
            $let: {
              vars: { version: { $arrayElemAt: ["$_dashboardEstimates.version", 0] } },
              in: { $cond: [{ $gt: ["$$version", 1] }, { $subtract: ["$$version", 1] }, 1] }
            }
          }
        },
        pipeline: [
          {
            $match: {
              status: "approved",
              decision: "approve",
              $expr: { $eq: ["$estimateId", "$$estimateId"] }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              matching: {
                $push: {
                  $cond: [
                    { $eq: ["$estimateVersion", "$$approvedVersion"] },
                    {
                      _id: "$_id", projectId: "$projectId", estimateVersion: "$estimateVersion",
                      estimateSnapshot: "$estimateSnapshot", decisionSource: "$decisionSource",
                      decidedById: "$decidedById", decidedAt: "$decidedAt"
                    },
                    null
                  ]
                }
              }
            }
          },
          { $set: { matching: { $setDifference: ["$matching", [null]] } } }
        ],
        as: "_dashboardFinanceApprovalFacts"
      }
    },
    ...[EstimateClientReviewRoundModel, DesignPlanReviewRoundModel].map((model, index) => ({
      $lookup: {
        from: model.collection.name,
        let: {
          projectId: "$_id",
          canonicalEstimateId: { $arrayElemAt: ["$_dashboardEstimates._id", 0] },
          canonicalEstimateVersion: { $arrayElemAt: ["$_dashboardEstimates.version", 0] },
          canonicalDesignPlanVersion: { $arrayElemAt: ["$_dashboardEstimates.designPlanVersion", 0] }
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$projectId", "$$projectId"] },
                  { $eq: ["$estimateId", "$$canonicalEstimateId"] },
                  index === 0
                    ? { $lte: ["$estimateVersion", "$$canonicalEstimateVersion"] }
                    : { $eq: ["$designPlanVersion", "$$canonicalDesignPlanVersion"] },
                  { $in: ["$deliveryStatus", ["failed", "disabled"]] }
                ]
              }
            }
          },
          { $group: { _id: null, failed: { $sum: { $cond: [{ $eq: ["$deliveryStatus", "failed"] }, 1, 0] } }, disabled: { $sum: { $cond: [{ $eq: ["$deliveryStatus", "disabled"] }, 1, 0] } } } }
        ],
        as: index === 0 ? "_dashboardClientDeliveryFacts" : "_dashboardDesignDeliveryFacts"
      }
    } as PipelineStage.Lookup)),
    {
      $set: {
        _dashboardLeadFact: { $arrayElemAt: ["$_dashboardLeadFacts", 0] },
        _dashboardWorkflowFact: { $arrayElemAt: ["$_dashboardWorkflowFacts", 0] },
        _dashboardDesignFact: { $arrayElemAt: ["$_dashboardDesignFacts", 0] },
        _dashboardEstimate: { $arrayElemAt: ["$_dashboardEstimates", 0] },
        _dashboardFinanceBucket: { $arrayElemAt: ["$_dashboardFinanceBuckets", 0] },
        _dashboardFinanceApprovalFact: { $arrayElemAt: ["$_dashboardFinanceApprovalFacts", 0] },
        _dashboardClientDeliveryFact: { $arrayElemAt: ["$_dashboardClientDeliveryFacts", 0] },
        _dashboardDesignDeliveryFact: { $arrayElemAt: ["$_dashboardDesignDeliveryFacts", 0] }
      }
    },
    {
      $set: {
        _dashboardApprovedEstimateVersion: {
          $cond: [{ $gt: ["$_dashboardEstimate.version", 1] }, { $subtract: ["$_dashboardEstimate.version", 1] }, 1]
        },
        _dashboardLegacyApprovalCount: {
          $size: {
            $filter: {
              input: { $ifNull: ["$_dashboardEstimate.reviews", []] },
              as: "review",
              cond: {
                $and: [
                  { $eq: ["$$review.action", "client_approved"] },
                  { $eq: [{ $type: "$$review.actorId" }, "string"] },
                  { $eq: [{ $type: "$$review.occurredAt" }, "date"] }
                ]
              }
            }
          }
        },
        _dashboardFinanceApprovalRound: { $arrayElemAt: ["$_dashboardFinanceApprovalFact.matching", 0] }
      }
    },
    {
      $set: {
        _dashboardFinanceApprovalSourceValid: {
          $and: [
            { $eq: ["$_dashboardEstimate.status", "client_approved"] },
            {
              $cond: [
                { $gt: [{ $ifNull: ["$_dashboardFinanceApprovalFact.total", 0] }, 0] },
                {
                  $and: [
                    { $eq: [{ $size: { $ifNull: ["$_dashboardFinanceApprovalFact.matching", []] } }, 1] },
                    { $in: ["$_dashboardFinanceApprovalRound.decisionSource", ["client_portal", "admin_proof"]] },
                    { $eq: [{ $type: "$_dashboardFinanceApprovalRound.decidedById" }, "string"] },
                    { $eq: [{ $type: "$_dashboardFinanceApprovalRound.decidedAt" }, "date"] },
                    {
                      $or: [
                        { $eq: [{ $ifNull: ["$_dashboardFinanceApprovalRound.projectId", null] }, null] },
                        { $eq: ["$_dashboardFinanceApprovalRound.projectId", "$_id"] }
                      ]
                    }
                  ]
                },
                { $eq: ["$_dashboardLegacyApprovalCount", 1] }
              ]
            }
          ]
        },
        _dashboardFinanceSnapshot: {
          $cond: [
            { $gt: [{ $ifNull: ["$_dashboardFinanceApprovalFact.total", 0] }, 0] },
            "$_dashboardFinanceApprovalRound.estimateSnapshot",
            "$_dashboardEstimate"
          ]
        },
        _dashboardExpectedReviewRoundId: {
          $cond: [
            { $gt: [{ $ifNull: ["$_dashboardFinanceApprovalFact.total", 0] }, 0] },
            "$_dashboardFinanceApprovalRound._id",
            null
          ]
        }
      }
    },
    {
      $set: {
        _dashboardApprovedSubtotalPaise: { $multiply: ["$_dashboardFinanceSnapshot.subtotal", 100] },
        _dashboardApprovedGstPaise: { $multiply: ["$_dashboardFinanceSnapshot.gst", 100] },
        _dashboardApprovedContractTotalPaise: { $multiply: ["$_dashboardFinanceSnapshot.total", 100] }
      }
    },
    {
      $set: {
        _dashboardFinanceMoneyValid: {
          $and: [
            { $isNumber: "$_dashboardApprovedSubtotalPaise" },
            { $isNumber: "$_dashboardApprovedGstPaise" },
            { $isNumber: "$_dashboardApprovedContractTotalPaise" },
            { $gte: ["$_dashboardApprovedSubtotalPaise", 0] },
            { $gte: ["$_dashboardApprovedGstPaise", 0] },
            { $lte: ["$_dashboardApprovedSubtotalPaise", MAX_FINANCE_AMOUNT_PAISE] },
            { $lte: ["$_dashboardApprovedGstPaise", MAX_FINANCE_AMOUNT_PAISE] },
            { $lte: ["$_dashboardApprovedContractTotalPaise", MAX_FINANCE_AMOUNT_PAISE] },
            { $eq: ["$_dashboardApprovedSubtotalPaise", { $trunc: "$_dashboardApprovedSubtotalPaise" }] },
            { $eq: ["$_dashboardApprovedGstPaise", { $trunc: "$_dashboardApprovedGstPaise" }] },
            { $eq: [{ $add: ["$_dashboardApprovedSubtotalPaise", "$_dashboardApprovedGstPaise"] }, "$_dashboardApprovedContractTotalPaise"] }
          ]
        },
        _dashboardFinanceTargetProfitPaise: {
          $floor: {
            $divide: [
              {
                $add: [
                  { $multiply: ["$_dashboardApprovedSubtotalPaise", PROJECT_FINANCE_TARGET_MARGIN_BPS] },
                  5_000
                ]
              },
              10_000
            ]
          }
        },
        _dashboardDesignApprovalValid: {
          $cond: [
            { $eq: ["$_dashboardEstimate.designPlanStatus", "approved"] },
            {
              $and: [
                { $isNumber: "$_dashboardEstimate.designPlanVersion" },
                { $gte: ["$_dashboardEstimate.designPlanVersion", 1] },
                { $eq: ["$_dashboardEstimate.designPlanVersion", { $trunc: "$_dashboardEstimate.designPlanVersion" }] },
                { $eq: [{ $type: "$_dashboardEstimate.designPlanApprovedAt" }, "date"] },
                { $in: ["$_dashboardEstimate.designPlanApprovalSource", ["client_portal", "admin_proof"]] },
                {
                  $gt: [
                    {
                      $strLenCP: {
                        $cond: [
                          { $eq: [{ $type: "$_dashboardEstimate.designPlanApprovedById" }, "string"] },
                          { $trim: { input: "$_dashboardEstimate.designPlanApprovedById" } },
                          ""
                        ]
                      }
                    },
                    0
                  ]
                }
              ]
            },
            true
          ]
        }
      }
    },
    {
      $set: {
        _dashboardFinanceLineageValid: {
          $and: [
            "$_dashboardFinanceApprovalSourceValid",
            "$_dashboardFinanceMoneyValid",
            "$_dashboardDesignApprovalValid",
            {
              $or: [
                { $eq: [{ $ifNull: ["$_dashboardFinanceBucket._id", null] }, null] },
                {
                  $and: [
                    { $eq: ["$_dashboardFinanceBucket.projectId", "$_id"] },
                    { $eq: ["$_dashboardFinanceBucket.estimateId", "$_dashboardEstimate._id"] },
                    { $eq: ["$_dashboardFinanceBucket.estimateVersion", "$_dashboardApprovedEstimateVersion"] },
                    { $eq: [{ $ifNull: ["$_dashboardFinanceBucket.estimateReviewRoundId", null] }, "$_dashboardExpectedReviewRoundId"] },
                    { $eq: ["$_dashboardFinanceBucket.approvedSubtotalPaise", "$_dashboardApprovedSubtotalPaise"] },
                    { $eq: ["$_dashboardFinanceBucket.approvedGstPaise", "$_dashboardApprovedGstPaise"] },
                    { $eq: ["$_dashboardFinanceBucket.approvedContractTotalPaise", "$_dashboardApprovedContractTotalPaise"] },
                    { $eq: ["$_dashboardFinanceBucket.currency", "INR"] },
                    { $eq: ["$_dashboardFinanceBucket.targetMarginBps", PROJECT_FINANCE_TARGET_MARGIN_BPS] },
                    { $eq: ["$_dashboardFinanceBucket.targetProfitPaise", "$_dashboardFinanceTargetProfitPaise"] },
                    {
                      $eq: [
                        "$_dashboardFinanceBucket.costBudgetPaise",
                        { $subtract: ["$_dashboardApprovedSubtotalPaise", "$_dashboardFinanceTargetProfitPaise"] }
                      ]
                    },
                    { $in: ["$_dashboardFinanceBucket.status", ["pending_design", "open", "closed"]] },
                    { $isNumber: "$_dashboardFinanceBucket.directSpendPaise" },
                    { $isNumber: "$_dashboardFinanceBucket.overheadPaise" },
                    { $gte: ["$_dashboardFinanceBucket.directSpendPaise", 0] },
                    { $gte: ["$_dashboardFinanceBucket.overheadPaise", 0] },
                    { $eq: ["$_dashboardFinanceBucket.directSpendPaise", { $trunc: "$_dashboardFinanceBucket.directSpendPaise" }] },
                    { $eq: ["$_dashboardFinanceBucket.overheadPaise", { $trunc: "$_dashboardFinanceBucket.overheadPaise" }] },
                    {
                      $lte: [
                        { $add: ["$_dashboardFinanceBucket.directSpendPaise", "$_dashboardFinanceBucket.overheadPaise"] },
                        MAX_FINANCE_AMOUNT_PAISE
                      ]
                    },
                    {
                      $or: [
                        { $ne: ["$_dashboardEstimate.designPlanStatus", "approved"] },
                        { $eq: ["$_dashboardFinanceBucket.status", "pending_design"] },
                        { $eq: ["$_dashboardFinanceBucket.designPlanVersion", "$_dashboardEstimate.designPlanVersion"] }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    },
    {
      $set: {
        _dashboardScheduleRed: {
          $or: [
            { $and: [{ $ne: ["$status", "completed"] }, { $lt: ["$plannedEndAt", observedAt] }] },
            { $eq: ["$_dashboardWorkflowFact.scheduleRed", 1] },
            { $eq: ["$_dashboardDesignFact.scheduleRed", 1] }
          ]
        },
        _dashboardScheduleYellow: { $or: [{ $eq: ["$_dashboardWorkflowFact.scheduleYellow", 1] }, { $eq: ["$_dashboardDesignFact.scheduleYellow", 1] }] },
        _dashboardFinanceRed: {
          $and: [
            "$_dashboardFinanceLineageValid",
            { $ne: [{ $ifNull: ["$_dashboardFinanceBucket.costBudgetPaise", null] }, null] },
            { $gt: [{ $add: [{ $ifNull: ["$_dashboardFinanceBucket.directSpendPaise", 0] }, { $ifNull: ["$_dashboardFinanceBucket.overheadPaise", 0] }] }, "$_dashboardFinanceBucket.costBudgetPaise"] }
          ]
        },
        _dashboardFinanceYellow: {
          $and: [
            "$_dashboardFinanceLineageValid",
            { $ne: ["$status", "completed"] },
            { $gt: ["$_dashboardFinanceBucket.costBudgetPaise", 0] },
            { $gte: [{ $multiply: [{ $add: [{ $ifNull: ["$_dashboardFinanceBucket.directSpendPaise", 0] }, { $ifNull: ["$_dashboardFinanceBucket.overheadPaise", 0] }] }, 10] }, { $multiply: ["$_dashboardFinanceBucket.costBudgetPaise", 9] }] },
            { $lte: [{ $add: [{ $ifNull: ["$_dashboardFinanceBucket.directSpendPaise", 0] }, { $ifNull: ["$_dashboardFinanceBucket.overheadPaise", 0] }] }, "$_dashboardFinanceBucket.costBudgetPaise"] }
          ]
        },
        _dashboardStaffingRed: { $eq: ["$_dashboardWorkflowFact.staffingRed", 1] },
        _dashboardStaffingYellow: { $eq: ["$_dashboardWorkflowFact.staffingYellow", 1] },
        _dashboardWorkflowRed: { $gt: [{ $ifNull: ["$_dashboardLeadFact.overdueCount", 0] }, 0] },
        _dashboardWorkflowYellow: {
          $or: [
            { $eq: ["$status", "on_hold"] },
            { $eq: [{ $arrayElemAt: ["$_dashboardEstimates.status", 0] }, "client_changes_requested"] },
            { $eq: [{ $arrayElemAt: ["$_dashboardEstimates.designPlanStatus", 0] }, "changes_requested"] },
            { $gt: [{ $add: [{ $ifNull: ["$_dashboardClientDeliveryFact.failed", 0] }, { $ifNull: ["$_dashboardClientDeliveryFact.disabled", 0] }, { $ifNull: ["$_dashboardDesignDeliveryFact.failed", 0] }, { $ifNull: ["$_dashboardDesignDeliveryFact.disabled", 0] }] }, 0] }
          ]
        }
      }
    },
    {
      $set: {
        _dashboardRed: { $or: ["$_dashboardScheduleRed", "$_dashboardFinanceRed", "$_dashboardStaffingRed", "$_dashboardWorkflowRed"] },
        _dashboardYellow: { $or: ["$_dashboardScheduleYellow", "$_dashboardFinanceYellow", "$_dashboardStaffingYellow", "$_dashboardWorkflowYellow"] },
        _dashboardFactor_schedule: { $or: ["$_dashboardScheduleRed", "$_dashboardScheduleYellow"] },
        _dashboardFactor_finance: { $or: ["$_dashboardFinanceRed", "$_dashboardFinanceYellow"] },
        _dashboardFactor_staffing: { $or: ["$_dashboardStaffingRed", "$_dashboardStaffingYellow"] },
        _dashboardFactor_workflow: { $or: ["$_dashboardWorkflowRed", "$_dashboardWorkflowYellow"] }
      }
    },
    {
      $set: {
        _dashboardOverdueMagnitudeMs: {
          $max: [
            { $cond: [{ $and: [{ $ne: ["$status", "completed"] }, { $lt: ["$plannedEndAt", observedAt] }] }, { $subtract: [observedAt, "$plannedEndAt"] }, 0] },
            { $ifNull: ["$_dashboardWorkflowFact.maxOverdueMs", 0] },
            { $ifNull: ["$_dashboardDesignFact.maxOverdueMs", 0] }
          ]
        },
        _dashboardFactorOccurrenceCount: {
          $add: [
            { $cond: [{ $and: [{ $ne: ["$status", "completed"] }, { $lt: ["$plannedEndAt", observedAt] }] }, 1, 0] },
            { $cond: [{ $eq: ["$status", "on_hold"] }, 1, 0] },
            { $ifNull: ["$_dashboardLeadFact.overdueCount", 0] },
            { $ifNull: ["$_dashboardWorkflowFact.riskOccurrenceCount", 0] },
            { $ifNull: ["$_dashboardDesignFact.riskOccurrenceCount", 0] },
            { $cond: [{ $or: ["$_dashboardFinanceRed", "$_dashboardFinanceYellow"] }, 1, 0] },
            { $cond: [{ $eq: [{ $arrayElemAt: ["$_dashboardEstimates.status", 0] }, "client_changes_requested"] }, 1, 0] },
            { $cond: [{ $eq: [{ $arrayElemAt: ["$_dashboardEstimates.designPlanStatus", 0] }, "changes_requested"] }, 1, 0] },
            { $ifNull: ["$_dashboardClientDeliveryFact.failed", 0] },
            { $ifNull: ["$_dashboardClientDeliveryFact.disabled", 0] },
            { $ifNull: ["$_dashboardDesignDeliveryFact.failed", 0] },
            { $ifNull: ["$_dashboardDesignDeliveryFact.disabled", 0] }
          ]
        }
      }
    },
    {
      $set: {
        _dashboardRiskLevel: {
          $switch: {
            branches: [
              { case: "$_dashboardRed", then: "red" },
              { case: "$_dashboardYellow", then: "yellow" },
              {
                case: {
                  $or: [
                    { $ne: ["$status", "completed"] },
                    { $gt: [{ $ifNull: ["$_dashboardWorkflowFact.total", 0] }, 0] },
                    { $gt: [{ $ifNull: ["$_dashboardDesignFact.total", 0] }, 0] },
                    "$_dashboardFinanceLineageValid",
                    { $gt: [{ $ifNull: ["$_dashboardLeadFact.trackedCount", 0] }, 0] },
                    { $gt: [{ $size: "$_dashboardEstimates" }, 0] }
                  ]
                },
                then: "green"
              }
            ],
            default: "gray"
          }
        },
        _dashboardRiskRank: {
          $cond: ["$_dashboardRed", 3, { $cond: ["$_dashboardYellow", 2, 1] }]
        },
        _dashboardModuleMatches: dashboardModuleMatchesExpression(filters.module),
        _dashboardModuleStatuses: dashboardModuleStatusExpressions(filters.module)
      }
    },
    ...(needsDerived && Object.keys(derivedMatch).length > 0 ? [{ $match: derivedMatch }] : []),
    {
      $unset: [
        "_dashboardLeadFacts", "_dashboardEstimates", "_dashboardWorkflowFacts",
        "_dashboardDesignFacts", "_dashboardFinanceBuckets", "_dashboardFinanceApprovalFacts",
        "_dashboardFinanceSnapshot", "_dashboardFinanceApprovalRound", "_dashboardEstimate",
        "_dashboardClientDeliveryFacts", "_dashboardDesignDeliveryFacts"
      ]
    }
  ] as PipelineStage[];
}

function taskRiskRedExpression(input: {
  input: string;
  deadlineExpression: unknown;
  statusPath: string;
  observedAt: Date;
}): MongoRow {
  return {
    $anyElementTrue: {
      $map: {
        input: input.input,
        as: "task",
        in: {
          $and: [
            { $ne: [input.statusPath, "completed"] },
            { $lt: [input.deadlineExpression, input.observedAt] }
          ]
        }
      }
    }
  };
}

function taskRiskYellowExpression(input: {
  input: string;
  startPath: string;
  deadlineExpression: unknown;
  statusPath: string;
  progressPath: string;
  observedAt: Date;
  blockedStatusAvailable: boolean;
}): MongoRow {
  const progressRatio = { $divide: [{ $min: [100, { $max: [0, input.progressPath] }] }, 100] };
  const duration = { $subtract: [input.deadlineExpression, input.startPath] };
  const elapsed = { $subtract: [input.observedAt, input.startPath] };
  const elapsedRatio = {
    $min: [1, { $max: [0, { $cond: [{ $gt: [duration, 0] }, { $divide: [elapsed, duration] }, 0] }] }]
  };
  const forecastLate = {
    $cond: [
      { $and: [{ $gt: [elapsed, 0] }, { $gt: [progressRatio, 0] }] },
      {
        $gt: [
          {
            $add: [
              input.observedAt,
              { $divide: [{ $multiply: [{ $subtract: [1, progressRatio] }, elapsed] }, progressRatio] }
            ]
          },
          input.deadlineExpression
        ]
      },
      false
    ]
  };
  const scheduleBuffer = { $subtract: [progressRatio, elapsedRatio] };
  return {
    $anyElementTrue: {
      $map: {
        input: input.input,
        as: "task",
        in: {
          $and: [
            { $ne: [input.statusPath, "completed"] },
            { $gte: [input.deadlineExpression, input.observedAt] },
            {
              $or: [
                ...(input.blockedStatusAvailable ? [{ $eq: [input.statusPath, "blocked"] }] : []),
                forecastLate,
                {
                  $and: [
                    { $gte: [input.observedAt, input.startPath] },
                    { $lte: [{ $subtract: [input.deadlineExpression, input.observedAt] }, TASK_RISK_DUE_SOON_MS] }
                  ]
                },
                { $and: [{ $gte: [input.observedAt, input.startPath] }, { $lt: [scheduleBuffer, 0] }] },
                {
                  $and: [
                    { $gte: [input.observedAt, input.startPath] },
                    { $lt: [{ $add: [scheduleBuffer, Number.EPSILON] }, TASK_RISK_MIN_SCHEDULE_BUFFER] }
                  ]
                }
              ]
            }
          ]
        }
      }
    }
  };
}

function dashboardModuleMatchesExpression(
  module: DashboardProjectFilters["module"]
): unknown {
  if (!module || module === "projects") return module ?? "projects";
  const expression: Readonly<Record<Exclude<DashboardProjectFilters["module"], undefined | "projects">, unknown>> = {
    estimation: true,
    design: { $and: ["$_dashboardFinanceApprovalSourceValid", "$_dashboardFinanceMoneyValid"] },
    procurement: {
      $and: [
        "$_dashboardFinanceLineageValid",
        { $eq: [{ $arrayElemAt: ["$_dashboardEstimates.designPlanStatus", 0] }, "approved"] }
      ]
    },
    finance: "$_dashboardFinanceLineageValid",
    execution: { $gt: [{ $ifNull: ["$_dashboardWorkflowFact.executionCount", 0] }, 0] },
    risk: true
  };
  return { $cond: [expression[module], module, null] };
}

function dashboardModuleStatusExpressions(
  module: DashboardProjectFilters["module"]
): unknown {
  const projectStatuses = ["$status"];
  const estimationStatuses = {
    $cond: [
      { $eq: [{ $size: "$_dashboardEstimates" }, 0] },
      ["no_estimate"],
      [{
        $cond: [
          { $in: [{ $arrayElemAt: ["$_dashboardEstimates.status", 0] }, ["draft", "pending_manager_assignment", "pending_designer_approval", "designer_changes_requested"]] },
          "draft_internal",
          { $arrayElemAt: ["$_dashboardEstimates.status", 0] }
        ]
      }]
    ]
  };
  const designStatuses = {
    $cond: [
      { $ne: [{ $arrayElemAt: ["$_dashboardEstimates.designPlanStatus", 0] }, null] },
      [{ $arrayElemAt: ["$_dashboardEstimates.designPlanStatus", 0] }],
      []
    ]
  };
  const procurementStatuses = {
    $cond: [
      { $eq: [{ $ifNull: ["$_dashboardWorkflowFact.procurementCount", 0] }, 0] },
      ["not_started"],
      { $setDifference: [{ $ifNull: ["$_dashboardWorkflowFact.procurementStatuses", []] }, [null]] }
    ]
  };
  const financeStatuses = {
    $cond: [
      "$_dashboardFinanceLineageValid",
      [{ $cond: ["$_dashboardFinanceRed", "over_budget", "within_budget"] }],
      []
    ]
  };
  const executionStatuses = {
    $setUnion: [
      { $setDifference: [{ $ifNull: ["$_dashboardWorkflowFact.executionStatuses", []] }, [null]] },
      { $cond: [{ $gt: [{ $ifNull: ["$_dashboardWorkflowFact.executionUnassignedCount", 0] }, 0] }, ["unassigned"], []] },
      { $cond: [{ $eq: ["$_dashboardWorkflowFact.executionOverdue", 1] }, ["overdue"], ["on_track"]] },
    ]
  };
  const statusesByModule: Readonly<Record<NonNullable<DashboardProjectFilters["module"]>, unknown>> = {
    projects: projectStatuses,
    estimation: estimationStatuses,
    design: designStatuses,
    procurement: procurementStatuses,
    finance: financeStatuses,
    execution: executionStatuses,
    risk: ["$_dashboardRiskLevel"]
  };
  if (module) return statusesByModule[module];
  return {
    $setUnion: [
      projectStatuses,
      estimationStatuses,
      designStatuses,
      procurementStatuses,
      financeStatuses,
      executionStatuses,
      ["$_dashboardRiskLevel"]
    ]
  };
}
