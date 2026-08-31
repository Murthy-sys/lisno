import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FinanceLedgerEntryModel } from "../src/models/FinanceLedgerEntry.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectFinanceBucketModel } from "../src/models/ProjectFinanceBucket.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { UserModel } from "../src/models/User.js";
import {
  memorySuperAdminDashboardOverview,
  memorySuperAdminDashboardProjects,
  memorySuperAdminDashboardWorkforce,
  mongoSuperAdminDashboardProjects,
  mongoSuperAdminDashboardOverview,
  mongoSuperAdminDashboardProjectPipeline,
  mongoSuperAdminDashboardWorkforce
} from "../src/repositories/super-admin-dashboard.js";
import { demoSeedData } from "../src/seed/data.js";
import type {
  DashboardProjectFilters,
  DashboardWorkforceFilters
} from "../src/contracts/super-admin-dashboard.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { calculateKpi } from "../src/domain/kpi.js";
import type { KpiTask } from "../src/contracts/domain.js";

const OBSERVED_AT = "2026-08-30T12:00:00.000Z";
const PERIOD_START_AT = "2026-08-24T00:00:00.000Z";
const PERIOD_END_AT = "2026-08-30T23:59:59.999Z";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("super-admin-dashboard-filter-tests");
}, 120_000);

beforeEach(async () => {
  await replica.clear();
});

afterAll(async () => {
  await replica.stop();
});

function project(id: string, name: string, plannedEndAt: string) {
  return {
    _id: id,
    name,
    clientId: null,
    clientName: "Dashboard Client",
    clientEmail: `${id}@example.test`,
    clientEmailNormalized: `${id}@example.test`,
    clientMobile: "9000000000",
    clientAddress: "Pune",
    initiatingDesignerId: null,
    assignedEstimatorId: null,
    assignedDesignerIds: [],
    managerId: null,
    status: "active" as const,
    location: "Pune",
    plannedStartAt: new Date("2026-08-01T00:00:00.000Z"),
    plannedEndAt: new Date(plannedEndAt),
    actualStartAt: new Date("2026-08-01T00:00:00.000Z"),
    actualEndAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z")
  };
}

function memoryProject(id: string, name: string, plannedEndAt: string) {
  return {
    id,
    name,
    clientId: null,
    clientName: "Dashboard Client",
    clientEmail: `${id}@example.test`,
    clientEmailNormalized: `${id}@example.test`,
    clientMobile: "9000000000",
    clientAddress: "Pune",
    initiatingDesignerId: null,
    assignedEstimatorId: null,
    assignedDesignerIds: [],
    managerId: null,
    status: "active" as const,
    location: "Pune",
    plannedStartAt: "2026-08-01T00:00:00.000Z",
    plannedEndAt,
    actualStartAt: "2026-08-01T00:00:00.000Z",
    actualEndAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z"
  };
}

function worker(id: string, name: string) {
  return {
    _id: id,
    name,
    email: `${id}@example.test`,
    emailNormalized: `${id}@example.test`,
    passwordHash: "unused-by-dashboard-test",
    role: "worker_electrician" as const,
    active: true,
    accountKind: "standard" as const,
    version: 1,
    sessionVersion: 1,
    managerId: null,
    authorizedClientIds: [],
    createdAt: new Date(OBSERVED_AT),
    updatedAt: new Date(OBSERVED_AT)
  };
}

function executionTask(id: string, projectId: string, assigneeUserId: string | null) {
  return {
    _id: id,
    dedupeKey: `${id}:dedupe`,
    projectId,
    estimateId: `${projectId}:estimate`,
    designPlanVersion: 1,
    kind: "trade_execution" as const,
    title: "Electrical execution",
    description: "",
    assigneeRole: "worker_electrician" as const,
    assigneeUserId,
    sourceSectionId: `${projectId}:section`,
    sourceLineItemKey: `${projectId}:line`,
    roomName: "Kitchen",
    status: "in_progress" as const,
    progress: 25,
    version: 1,
    openedAt: new Date("2026-08-29T00:00:00.000Z"),
    dueAt: new Date("2026-09-08T00:00:00.000Z"),
    plannedEffort: 8,
    completedAt: null,
    createdAt: new Date("2026-08-29T00:00:00.000Z"),
    updatedAt: new Date("2026-08-29T00:00:00.000Z")
  };
}

async function approvedFinanceProject(input: {
  id: string;
  subtotalRupees: number;
  directSpendPaise: number;
  withBucket?: boolean;
}) {
  const estimateId = `${input.id}:estimate`;
  const leadId = `${input.id}:lead`;
  const approvedSubtotalPaise = input.subtotalRupees * 100;
  const gstRupees = Math.round(input.subtotalRupees * 18 / 100);
  const approvedGstPaise = gstRupees * 100;
  await ProjectModel.create(project(input.id, input.id, "2026-09-30T00:00:00.000Z"));
  await LeadModel.create({
    _id: leadId,
    projectId: input.id,
    ownerId: "dashboard-owner",
    clientName: "Dashboard Client",
    clientEmail: `${input.id}@example.test`,
    clientMobile: "9000000000",
    projectName: input.id,
    location: "Pune",
    propertyType: "apartment",
    source: "dashboard-test",
    stage: "won",
    nextAction: "None",
    nextActionAt: new Date("2026-09-30T00:00:00.000Z")
  });
  await EstimateModel.create({
    _id: estimateId,
    leadId,
    projectId: input.id,
    ownerId: "dashboard-owner",
    version: 2,
    status: "client_approved",
    propertyType: "apartment",
    rooms: [],
    scopes: [],
    lineItems: [],
    subtotal: input.subtotalRupees,
    gst: gstRupees,
    total: input.subtotalRupees + gstRupees,
    approvalRequired: false,
    designPlanStatus: null,
    designPlanVersion: 0,
    clientDecisionAt: new Date("2026-08-25T00:00:00.000Z"),
    reviews: [{
      actorId: "dashboard-client",
      action: "client_approved",
      note: "Approved",
      occurredAt: new Date("2026-08-25T00:00:00.000Z")
    }]
  });
  if (input.withBucket === false) return;
  await ProjectFinanceBucketModel.create({
    _id: `${input.id}:bucket`,
    projectId: input.id,
    estimateId,
    estimateVersion: 1,
    estimateReviewRoundId: null,
    designPlanVersion: 0,
    currency: "INR",
    approvedSubtotalPaise,
    approvedGstPaise,
    approvedContractTotalPaise: approvedSubtotalPaise + approvedGstPaise,
    targetMarginBps: 2_000,
    targetProfitPaise: approvedSubtotalPaise / 5,
    costBudgetPaise: approvedSubtotalPaise * 4 / 5,
    directSpendPaise: input.directSpendPaise,
    overheadPaise: 0,
    status: "pending_design",
    version: 1,
    createdById: "dashboard-owner"
  });
}

async function approvedProcurementProject(input: {
  id: string;
  lineAmountRupees: number;
  postedSpendPaise: number;
  taskProgress: number;
}) {
  const estimateId = `${input.id}:estimate`;
  const leadId = `${input.id}:lead`;
  const bucketId = `${input.id}:bucket`;
  const lineId = `${input.id}:line`;
  const subtotalRupees = input.lineAmountRupees;
  const gstRupees = Math.round(subtotalRupees * 18 / 100);
  const subtotalPaise = subtotalRupees * 100;
  const gstPaise = gstRupees * 100;
  await ProjectModel.create(project(input.id, input.id, "2026-09-30T00:00:00.000Z"));
  await LeadModel.create({
    _id: leadId,
    projectId: input.id,
    ownerId: "dashboard-owner",
    clientName: "Dashboard Client",
    clientEmail: `${input.id}@example.test`,
    clientMobile: "9000000000",
    projectName: input.id,
    location: "Pune",
    propertyType: "apartment",
    source: "dashboard-test",
    stage: "won",
    nextAction: "None",
    nextActionAt: new Date("2026-09-30T00:00:00.000Z")
  });
  await EstimateModel.create({
    _id: estimateId,
    leadId,
    projectId: input.id,
    ownerId: "dashboard-owner",
    version: 2,
    status: "client_approved",
    propertyType: "apartment",
    rooms: [],
    scopes: [],
    lineItems: [{
      id: lineId,
      catalogueId: "EL-001",
      roomName: "Kitchen",
      specification: "Wiring",
      unit: "lot",
      rate: input.lineAmountRupees,
      quantity: 1,
      included: true,
      amount: input.lineAmountRupees
    }],
    subtotal: subtotalRupees,
    gst: gstRupees,
    total: subtotalRupees + gstRupees,
    approvalRequired: false,
    designPlanStatus: "approved",
    designPlanVersion: 1,
    designPlanApprovedAt: new Date("2026-08-26T00:00:00.000Z"),
    designPlanApprovedById: "dashboard-client",
    designPlanApprovalSource: "client_portal",
    clientDecisionAt: new Date("2026-08-25T00:00:00.000Z"),
    reviews: [{
      actorId: "dashboard-client",
      action: "client_approved",
      note: "Approved",
      occurredAt: new Date("2026-08-25T00:00:00.000Z")
    }]
  });
  await ProjectFinanceBucketModel.create({
    _id: bucketId,
    projectId: input.id,
    estimateId,
    estimateVersion: 1,
    estimateReviewRoundId: null,
    designPlanVersion: 1,
    currency: "INR",
    approvedSubtotalPaise: subtotalPaise,
    approvedGstPaise: gstPaise,
    approvedContractTotalPaise: subtotalPaise + gstPaise,
    targetMarginBps: 2_000,
    targetProfitPaise: subtotalPaise / 5,
    costBudgetPaise: subtotalPaise * 4 / 5,
    directSpendPaise: input.postedSpendPaise,
    overheadPaise: 0,
    status: "open",
    version: 1,
    createdById: "dashboard-owner",
    openedAt: new Date("2026-08-26T00:00:00.000Z"),
    openedById: "dashboard-client"
  });
  await ProjectWorkflowTaskModel.create({
    ...executionTask(`${input.id}:procurement-task`, input.id, null),
    estimateId,
    designPlanVersion: 1,
    kind: "procurement",
    title: "Procurement",
    assigneeRole: "procurement",
    sourceSectionId: null,
    sourceLineItemKey: null,
    progress: input.taskProgress
  });
  if (input.postedSpendPaise > 0) {
    await FinanceLedgerEntryModel.create({
      _id: `${input.id}:entry`,
      bucketId,
      projectId: input.id,
      type: "direct_spend",
      expenseClass: "procurement",
      category: "Procurement",
      amountPaise: input.postedSpendPaise,
      incurredAt: new Date("2026-08-29T00:00:00.000Z"),
      description: "Approved line purchase",
      vendor: null,
      reference: null,
      sourceSectionId: "EL",
      sourceLineItemKey: lineId,
      idempotencyKey: `${input.id}:procurement-entry`,
      status: "posted",
      version: 1,
      createdById: "dashboard-owner"
    });
  }
}

async function workflowEstimateProject(input: {
  id: string;
  status: "draft" | "sent_to_client";
  version: number;
}) {
  const estimateId = `${input.id}:estimate`;
  const leadId = `${input.id}:lead`;
  await ProjectModel.create(project(input.id, input.id, "2026-09-30T00:00:00.000Z"));
  await LeadModel.create({
    _id: leadId,
    projectId: input.id,
    ownerId: "dashboard-owner",
    clientName: "Dashboard Client",
    clientEmail: `${input.id}@example.test`,
    clientMobile: "9000000000",
    projectName: input.id,
    location: "Pune",
    propertyType: "apartment",
    source: "dashboard-test",
    stage: "won",
    nextAction: "None",
    nextActionAt: new Date("2026-09-30T00:00:00.000Z")
  });
  await EstimateModel.create({
    _id: estimateId,
    leadId,
    projectId: input.id,
    ownerId: "dashboard-owner",
    version: input.version,
    status: input.status,
    propertyType: "apartment",
    rooms: [],
    scopes: [],
    lineItems: [],
    subtotal: 1_000,
    gst: 180,
    total: 1_180,
    approvalRequired: false,
    designPlanStatus: null,
    designPlanVersion: 0,
    reviews: []
  });
}

function reviewRound(input: {
  id: string;
  projectId: string;
  estimateVersion: number;
  sendGeneration: number;
  status: "pending" | "changes_requested" | "approved";
  decision: null | "request_changes" | "approve";
}) {
  const decided = input.decision !== null;
  return {
    _id: input.id,
    estimateId: `${input.projectId}:estimate`,
    leadId: `${input.projectId}:lead`,
    projectId: input.projectId,
    estimateVersion: input.estimateVersion,
    sendGeneration: input.sendGeneration,
    dedupeKey: `${input.id}:dedupe`,
    recipientEmail: `${input.projectId}@example.test`,
    recipientEmailNormalized: `${input.projectId}@example.test`,
    estimateSnapshot: {
      clientName: "Dashboard Client",
      projectName: input.projectId,
      location: "Pune",
      propertyType: "apartment",
      lineItems: [],
      subtotal: 1_000,
      gst: 180,
      total: 1_180
    },
    pdfFilename: `${input.id}.pdf`,
    pdfMimeType: "application/pdf",
    pdfByteSize: 1,
    pdfSha256: `${input.id}:pdf`,
    pdfStorageReference: `${input.id}:storage`,
    deliveryStatus: "sent",
    deliveryAttemptGeneration: 1,
    deliveryAttemptCount: 1,
    deliveredAt: new Date("2026-08-24T00:00:00.000Z"),
    assignedAdminId: "dashboard-owner",
    status: input.status,
    decision: input.decision,
    decisionSource: decided ? "client_portal" : null,
    decisionNote: decided ? "Reviewed" : null,
    decidedById: decided ? "dashboard-client" : null,
    decidedAt: decided ? new Date("2026-08-25T00:00:00.000Z") : null,
    version: decided ? 2 : 1,
    createdAt: new Date(`2026-08-${20 + input.sendGeneration}T00:00:00.000Z`),
    updatedAt: new Date(`2026-08-${20 + input.sendGeneration}T00:00:00.000Z`)
  };
}

describe("Super Admin dashboard Mongo pre-pagination filters", () => {
  it("uses scalar lookup summaries before the project facet and produces execution stats", async () => {
    await Promise.all([
      LeadModel.createIndexes(),
      EstimateModel.createIndexes(),
      ProjectWorkflowTaskModel.createIndexes(),
      ProjectFinanceBucketModel.createIndexes(),
      EstimateClientReviewRoundModel.createIndexes()
    ]);
    const projectCount = 12;
    await ProjectModel.create(Array.from({ length: projectCount }, (_, index) =>
      project(
        `project-query-plan-${index}`,
        `Query plan project ${index}`,
        "2026-09-30T00:00:00.000Z"
      )
    ));
    await ProjectWorkflowTaskModel.create(Array.from({ length: projectCount }, (_, index) =>
      executionTask(
        `project-query-plan-task-${index}`,
        `project-query-plan-${index}`,
        null
      )
    ));
    const pipeline = mongoSuperAdminDashboardProjectPipeline(OBSERVED_AT, {
      sort: "risk_desc",
      limit: 20,
      offset: 0
    });
    const facetIndex = pipeline.findIndex((stage) => "$facet" in stage);
    const lookupStages = pipeline.slice(0, facetIndex).filter((stage) => "$lookup" in stage);

    expect(facetIndex).toBeGreaterThan(0);
    expect(lookupStages.length).toBeGreaterThanOrEqual(6);
    expect(JSON.stringify(lookupStages)).toContain("$group");
    expect(JSON.stringify(lookupStages)).not.toContain("_dashboardWorkflowTasks");

    const explain = await ProjectModel.aggregate(pipeline).explain("executionStats") as {
      stages: Array<Record<string, any>>;
    };
    const cursor = explain.stages.find((stage) => stage.$cursor)?.$cursor;
    expect(cursor?.queryPlanner.winningPlan).toMatchObject({ stage: "COLLSCAN" });
    expect(cursor?.executionStats).toMatchObject({
      nReturned: projectCount,
      totalDocsExamined: projectCount,
      totalKeysExamined: 0
    });
    const lookupStats = explain.stages.filter((stage) => stage.$lookup);
    const lookupUsing = (collectionName: string, indexName: string) =>
      lookupStats.some((stage) =>
        stage.$lookup.from === collectionName &&
        (stage.indexesUsed ?? []).includes(indexName)
      );
    expect(lookupUsing(
      ProjectWorkflowTaskModel.collection.name,
      "projectId_1_kind_1_openedAt_-1"
    )).toBe(true);
    expect(lookupUsing(
      ProjectFinanceBucketModel.collection.name,
      "projectId_1"
    )).toBe(true);
    expect(lookupUsing(
      EstimateClientReviewRoundModel.collection.name,
      "projectId_1_deliveryStatus_1"
    )).toBe(true);
    for (const stage of lookupStats) {
      expect(Number(stage.nReturned ?? 0)).toBeLessThanOrEqual(projectCount);
      expect(Number(stage.totalDocsExamined ?? 0)).toBeLessThanOrEqual(projectCount * 2);
    }
    const facet = explain.stages.find((stage) => stage.$facet);
    expect(facet?.nReturned).toBe(1);
  });

  it("keeps memory and Mongo base Project/risk DTO behavior in parity", async () => {
    await ProjectModel.create([
      project("project-a-clear", "A clear project", "2026-09-30T00:00:00.000Z"),
      project("project-z-risk", "Z risk project", "2026-08-20T00:00:00.000Z")
    ]);
    const memorySeed = {
      ...structuredClone(demoSeedData),
      projects: [
        {
          id: "project-a-clear", name: "A clear project", clientId: null,
          clientName: "Dashboard Client", clientEmail: "clear@example.test",
          clientEmailNormalized: "clear@example.test", clientMobile: "9000000000",
          clientAddress: "Pune", initiatingDesignerId: null, assignedEstimatorId: null,
          assignedDesignerIds: [], managerId: null, status: "active" as const,
          location: "Pune", plannedStartAt: "2026-08-01T00:00:00.000Z",
          plannedEndAt: "2026-09-30T00:00:00.000Z", actualStartAt: null,
          actualEndAt: null, createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z"
        },
        {
          id: "project-z-risk", name: "Z risk project", clientId: null,
          clientName: "Dashboard Client", clientEmail: "risk@example.test",
          clientEmailNormalized: "risk@example.test", clientMobile: "9000000000",
          clientAddress: "Pune", initiatingDesignerId: null, assignedEstimatorId: null,
          assignedDesignerIds: [], managerId: null, status: "active" as const,
          location: "Pune", plannedStartAt: "2026-08-01T00:00:00.000Z",
          plannedEndAt: "2026-08-20T00:00:00.000Z", actualStartAt: null,
          actualEndAt: null, createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z"
        }
      ],
      leads: [],
      tasks: [],
      estimateSummaries: []
    };
    const filters = { sort: "name_asc" as const, limit: 20, offset: 0 };
    const [mongoPage, mongoOverview] = await Promise.all([
      mongoSuperAdminDashboardProjects(OBSERVED_AT, filters),
      mongoSuperAdminDashboardOverview({
        observedAt: OBSERVED_AT, startAt: PERIOD_START_AT,
        endAt: PERIOD_END_AT, periodDays: 7
      })
    ]);
    const memoryPage = memorySuperAdminDashboardProjects(memorySeed, OBSERVED_AT, filters);
    const memoryOverview = memorySuperAdminDashboardOverview(memorySeed, {
      observedAt: OBSERVED_AT, startAt: PERIOD_START_AT,
      endAt: PERIOD_END_AT, periodDays: 7
    });

    expect(mongoPage.items.map(({ projectId, risk }) => ({ projectId, level: risk.level })))
      .toEqual(memoryPage.items.map(({ projectId, risk }) => ({ projectId, level: risk.level })));
    expect(mongoOverview.risk.projectDistribution).toEqual(memoryOverview.risk.projectDistribution);
    expect(mongoOverview.projects.atRisk).toBe(memoryOverview.projects.atRisk);
  });

  it("resolves Estimate review IDs for republished, approved, and internal workflow states", async () => {
    await Promise.all([
      workflowEstimateProject({ id: "workflow-republished", status: "sent_to_client", version: 2 }),
      workflowEstimateProject({ id: "workflow-internal", status: "draft", version: 2 }),
      approvedFinanceProject({
        id: "workflow-approved", subtotalRupees: 1_000,
        directSpendPaise: 0, withBucket: false
      })
    ]);
    await EstimateClientReviewRoundModel.collection.insertMany([
      reviewRound({
        id: "workflow-republished:v1-changes", projectId: "workflow-republished",
        estimateVersion: 1, sendGeneration: 1,
        status: "changes_requested", decision: "request_changes"
      }),
      reviewRound({
        id: "workflow-republished:v2-pending", projectId: "workflow-republished",
        estimateVersion: 2, sendGeneration: 2,
        status: "pending", decision: null
      }),
      reviewRound({
        id: "workflow-internal:stale-pending", projectId: "workflow-internal",
        estimateVersion: 2, sendGeneration: 1,
        status: "pending", decision: null
      }),
      reviewRound({
        id: "workflow-approved:v1-approved", projectId: "workflow-approved",
        estimateVersion: 1, sendGeneration: 1,
        status: "approved", decision: "approve"
      })
    ]);

    const result = await mongoSuperAdminDashboardProjects(OBSERVED_AT, {
      sort: "name_asc", limit: 20, offset: 0
    });
    const rows = new Map(result.items.map((row) => [row.projectId, row]));

    expect(rows.get("workflow-republished")?.estimate?.reviewRoundId)
      .toBe("workflow-republished:v2-pending");
    expect(rows.get("workflow-approved")?.estimate?.reviewRoundId)
      .toBe("workflow-approved:v1-approved");
    expect(rows.get("workflow-internal")?.estimate?.reviewRoundId).toBeNull();
  });

  it("keeps supported memory/Mongo metrics in parity and marks unsupported memory facts unavailable", async () => {
    await approvedProcurementProject({
      id: "parity-asymmetric", lineAmountRupees: 1_000,
      postedSpendPaise: 25_000, taskProgress: 40
    });
    await UserModel.create(worker("parity-worker", "Parity Worker"));
    await ProjectWorkflowTaskModel.create(
      executionTask("parity-asymmetric:execution-task", "parity-asymmetric", "parity-worker")
    );
    const seedLead = structuredClone(demoSeedData.leads[0]!);
    const seedTask = structuredClone(demoSeedData.tasks[0]!);
    const seedWorker = structuredClone(
      demoSeedData.users.find((user) => user.role.startsWith("worker_"))!
    );
    const memorySeed = {
      ...structuredClone(demoSeedData),
      projects: [memoryProject("parity-asymmetric", "parity-asymmetric", "2026-09-30T00:00:00.000Z")],
      leads: [{ ...seedLead, id: "parity-asymmetric:lead", projectId: "parity-asymmetric" }],
      estimateSummaries: [{
        id: "parity-asymmetric:estimate",
        leadId: "parity-asymmetric:lead",
        projectId: "parity-asymmetric",
        version: 2,
        status: "client_approved",
        subtotal: 1_000,
        gst: 180,
        total: 1_180,
        clientDecisionAt: "2026-08-25T00:00:00.000Z",
        clientDecisionSource: "client_portal" as const,
        approvedBaseline: {
          estimateVersion: 1,
          reviewRoundId: null,
          subtotal: 1_000,
          gst: 180,
          total: 1_180,
          decisionAt: "2026-08-25T00:00:00.000Z",
          decisionSource: "client_portal" as const
        },
        clientReview: null,
        assignedAdminId: null,
        designPlanStatus: "approved",
        designPlanVersion: 1,
        designPlanDesignerId: null,
        createdAt: "2026-08-20T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z"
      }],
      users: [{
        ...seedWorker,
        id: "parity-worker",
        name: "Parity Worker",
        role: "worker_electrician" as const,
        active: true
      }],
      tasks: [{
        ...seedTask,
        id: "parity-memory-task",
        projectId: "parity-asymmetric",
        ownerId: "parity-worker",
        status: "in_progress" as const,
        completedAt: null,
        progress: 40,
        plannedEffort: 10
      }]
    };
    const overviewInput = {
      observedAt: OBSERVED_AT,
      startAt: PERIOD_START_AT,
      endAt: PERIOD_END_AT,
      periodDays: 7 as const
    };
    const projectFilters = { sort: "name_asc" as const, limit: 20, offset: 0 };
    const workforceFilters = { sort: "name_asc" as const, limit: 20, offset: 0 };

    const [mongoOverview, mongoProjects, mongoWorkforce] = await Promise.all([
      mongoSuperAdminDashboardOverview(overviewInput),
      mongoSuperAdminDashboardProjects(OBSERVED_AT, projectFilters),
      mongoSuperAdminDashboardWorkforce({ ...overviewInput, filters: workforceFilters })
    ]);
    const memoryOverview = memorySuperAdminDashboardOverview(memorySeed, overviewInput);
    const memoryProjects = memorySuperAdminDashboardProjects(memorySeed, OBSERVED_AT, projectFilters);
    const memoryWorkforce = memorySuperAdminDashboardWorkforce(memorySeed, {
      filters: workforceFilters
    });

    expect(memoryOverview.projects.total).toBe(mongoOverview.projects.total);
    expect(memoryOverview.estimation.clientApproved).toBe(mongoOverview.estimation.clientApproved);
    expect(memoryOverview.finance.approvedSubtotalPaise)
      .toBe(mongoOverview.finance.approvedSubtotalPaise);
    expect(memoryOverview.workforce.activeWorkers).toBe(mongoOverview.workforce.activeWorkers);
    expect(memoryOverview.dataQuality.unavailableMetricKeys).toEqual(expect.arrayContaining([
      "finance.recordedCostPaise", "procurement.postedSpendPaise",
      "execution.total", "workforce.assignedWorkers", "risk.projectDistribution"
    ]));
    expect(mongoOverview.dataQuality.unavailableMetricKeys).not.toEqual(expect.arrayContaining([
      "finance.recordedCostPaise", "procurement.postedSpendPaise", "execution.total"
    ]));
    expect(memoryProjects.items[0]?.finance).toBeNull();
    expect(memoryProjects.dataQuality.unavailableMetricKeys).toContain("finance.rows");
    expect(mongoProjects.items[0]?.finance).not.toBeNull();
    expect(memoryWorkforce.items[0]).toMatchObject({
      assignmentState: "unassigned", activeTaskCount: 0
    });
    expect(memoryWorkforce.dataQuality.unavailableMetricKeys).toEqual(expect.arrayContaining([
      "workforce.assignmentState", "workforce.activeTaskCount", "workforce.workload",
      "workforce.kpi"
    ]));
    expect(mongoWorkforce.items[0]).toMatchObject({
      assignmentState: "assigned", activeTaskCount: 1
    });
  });

  it("aggregates full-population risk and workforce facts while bounding top risk rows", async () => {
    await Promise.all([
      ProjectModel.create([
        project("project-a-clear", "A clear project", "2026-09-30T00:00:00.000Z"),
        project("project-z-risk", "Z risk project", "2026-08-20T00:00:00.000Z")
      ]),
      UserModel.create([
        worker("worker-a-unassigned", "A Unassigned"),
        worker("worker-z-assigned", "Z Assigned")
      ])
    ]);
    await ProjectWorkflowTaskModel.create([
      executionTask("task-worker-z", "project-z-risk", "worker-z-assigned"),
      executionTask("task-orphan", "missing-project", "worker-z-assigned")
    ]);

    const overview = await mongoSuperAdminDashboardOverview({
      observedAt: OBSERVED_AT,
      startAt: PERIOD_START_AT,
      endAt: PERIOD_END_AT,
      periodDays: 7
    });

    expect(overview.risk.projectDistribution).toEqual({
      gray: 0,
      green: 1,
      yellow: 0,
      red: 1
    });
    expect(overview.projects.atRisk).toBe(1);
    expect(overview.risk.factorDistribution).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reasonCode: "project_deadline_overdue",
        occurrenceCount: 1,
        projectCount: 1
      })
    ]));
    expect(overview.risk.topProjects.map((row) => row.projectId)).toEqual([
      "project-z-risk"
    ]);
    expect(overview.workforce).toMatchObject({
      activeWorkers: 2,
      assignedWorkers: 1,
      unassignedWorkers: 1,
      activeAssignedTaskCount: 1,
      kpiEligibleWorkers: 1,
      kpiUnavailableWorkers: 1
    });
    expect(overview.execution.total).toBe(1);
    expect(overview.workforce.averageKpi.denominator).toBe(10_000);
    expect(overview.workforce.averageKpi.rateBps).not.toBeNull();
  });

  it("reconciles two unequal approved finance baselines and preserves immutable v1 bucket identity", async () => {
    await approvedFinanceProject({
      id: "finance-small", subtotalRupees: 10_000, directSpendPaise: 100_000
    });
    await approvedFinanceProject({
      id: "finance-large", subtotalRupees: 30_000, directSpendPaise: 500_000
    });

    const [overview, page] = await Promise.all([
      mongoSuperAdminDashboardOverview({
        observedAt: OBSERVED_AT,
        startAt: PERIOD_START_AT,
        endAt: PERIOD_END_AT,
        periodDays: 7
      }),
      mongoSuperAdminDashboardProjects(OBSERVED_AT, {
        module: "finance", sort: "name_asc", limit: 20, offset: 0
      })
    ]);

    expect(overview.finance).toMatchObject({
      projectCount: 2,
      approvedSubtotalPaise: 4_000_000,
      approvedGstPaise: 720_000,
      approvedContractTotalPaise: 4_720_000,
      directSpendPaise: 600_000,
      recordedCostPaise: 600_000,
      currentProfitPaise: 3_400_000
    });
    expect(page.items).toHaveLength(2);
    expect(page.items.map((row) => row.finance)).toEqual([
      expect.objectContaining({ estimateVersion: 1, estimateId: "finance-large:estimate" }),
      expect.objectContaining({ estimateVersion: 1, estimateId: "finance-small:estimate" })
    ]);
    expect(page.dataQuality.unavailableMetricKeys).not.toContain("finance");
  });

  it("uses the canonical synthetic Finance bucket when the approved baseline has no materialized bucket", async () => {
    await approvedFinanceProject({
      id: "finance-synthetic", subtotalRupees: 12_000,
      directSpendPaise: 0, withBucket: false
    });

    const result = await mongoSuperAdminDashboardProjects(OBSERVED_AT, {
      module: "finance", moduleStatus: "within_budget", sort: "name_asc", limit: 20, offset: 0
    });

    expect(result.items[0]?.finance).toMatchObject({
      bucketId: "finance-bucket-finance-synthetic",
      estimateId: "finance-synthetic:estimate",
      estimateVersion: 1,
      approvedSubtotalPaise: 1_200_000,
      recordedCostPaise: 0,
      currentProfitPaise: 1_200_000
    });
    expect(result.dataQuality.unavailableMetricKeys).not.toContain("finance.rows");
  });

  it("fails project Finance closed when materialized money differs from the approved baseline", async () => {
    await approvedFinanceProject({
      id: "finance-corrupt", subtotalRupees: 10_000, directSpendPaise: 0
    });
    await ProjectFinanceBucketModel.collection.updateOne(
      { _id: "finance-corrupt:bucket" },
      { $set: { approvedSubtotalPaise: 1_000_001 } }
    );

    const [result, financeModule, financeRisk] = await Promise.all([
      mongoSuperAdminDashboardProjects(OBSERVED_AT, {
        sort: "name_asc", limit: 20, offset: 0
      }),
      mongoSuperAdminDashboardProjects(OBSERVED_AT, {
        module: "finance", sort: "name_asc", limit: 20, offset: 0
      }),
      mongoSuperAdminDashboardProjects(OBSERVED_AT, {
        riskFactor: "finance", sort: "risk_desc", limit: 20, offset: 0
      })
    ]);

    expect(result.items[0]?.finance).toBeNull();
    expect(result.dataQuality.unavailableMetricKeys).toEqual(expect.arrayContaining([
      "finance.approvedSubtotalPaise", "risk.projectDistribution"
    ]));
    expect(financeModule.total).toBe(0);
    expect(financeRisk.total).toBe(0);
  });

  it("selects the one approved immutable version across multiple send generations", async () => {
    await approvedFinanceProject({
      id: "finance-generations", subtotalRupees: 14_000,
      directSpendPaise: 0, withBucket: false
    });
    await EstimateClientReviewRoundModel.collection.insertMany([
      {
        _id: "finance-generations:round-v1",
        dedupeKey: "finance-generations:round-v1",
        estimateId: "finance-generations:estimate",
        leadId: "finance-generations:lead",
        projectId: "finance-generations",
        estimateVersion: 1,
        sendGeneration: 1,
        status: "approved",
        decision: "approve",
        decisionSource: "client_portal",
        decidedById: "dashboard-client",
        decidedAt: new Date("2026-08-25T00:00:00.000Z"),
        estimateSnapshot: { subtotal: 14_000, gst: 2_520, total: 16_520, lineItems: [] },
        deliveryStatus: "sent",
        createdAt: new Date("2026-08-24T00:00:00.000Z")
      },
      {
        _id: "finance-generations:round-v2",
        dedupeKey: "finance-generations:round-v2",
        estimateId: "finance-generations:estimate",
        leadId: "finance-generations:lead",
        projectId: "finance-generations",
        estimateVersion: 2,
        sendGeneration: 2,
        status: "approved",
        decision: "approve",
        decisionSource: "client_portal",
        decidedById: "dashboard-client",
        decidedAt: new Date("2026-08-26T00:00:00.000Z"),
        estimateSnapshot: { subtotal: 99_000, gst: 17_820, total: 116_820, lineItems: [] },
        deliveryStatus: "sent",
        createdAt: new Date("2026-08-26T00:00:00.000Z")
      }
    ]);

    const result = await mongoSuperAdminDashboardProjects(OBSERVED_AT, {
      module: "finance", sort: "name_asc", limit: 20, offset: 0
    });
    expect(result.items[0]?.finance).toMatchObject({
      estimateVersion: 1,
      estimateReviewRoundId: "finance-generations:round-v1",
      approvedSubtotalPaise: 1_400_000
    });
  });

  it("reconciles canonical Procurement line estimates, posted spend, and persisted task progress", async () => {
    await approvedProcurementProject({
      id: "procurement-small", lineAmountRupees: 1_000,
      postedSpendPaise: 25_000, taskProgress: 20
    });
    await approvedProcurementProject({
      id: "procurement-large", lineAmountRupees: 3_000,
      postedSpendPaise: 80_000, taskProgress: 80
    });

    const [overview, page] = await Promise.all([
      mongoSuperAdminDashboardOverview({
        observedAt: OBSERVED_AT,
        startAt: PERIOD_START_AT,
        endAt: PERIOD_END_AT,
        periodDays: 7
      }),
      mongoSuperAdminDashboardProjects(OBSERVED_AT, {
        module: "procurement", sort: "name_asc", limit: 20, offset: 0
      })
    ]);

    expect(overview.procurement).toMatchObject({
      eligibleProjects: 2,
      trackedProjects: 2,
      unavailableProjects: 0,
      notStarted: 0,
      open: 0,
      inProgress: 2,
      completed: 0,
      plannedAmountPaise: 400_000,
      postedSpendPaise: 105_000,
      variancePaise: 295_000,
      averageProgress: { numerator: 100, denominator: 200, rateBps: 5_000 }
    });
    expect(page.items.map((row) => row.procurement)).toEqual([
      expect.objectContaining({
        taskId: "procurement-large:procurement-task",
        approvedAmountPaise: 300_000,
        postedSpendPaise: 80_000,
        variancePaise: 220_000,
        sourceSectionIds: ["EL"],
        sourceLineItemKeys: ["procurement-large:line"]
      }),
      expect.objectContaining({
        taskId: "procurement-small:procurement-task",
        approvedAmountPaise: 100_000,
        postedSpendPaise: 25_000,
        variancePaise: 75_000,
        sourceSectionIds: ["EL"],
        sourceLineItemKeys: ["procurement-small:line"]
      })
    ]);
    expect(overview.dataQuality.unavailableMetricKeys).not.toContain(
      "procurement.approvedAmountPaise"
    );
    expect(page.dataQuality.unavailableMetricKeys).not.toContain(
      "procurement.approvedAmountPaise"
    );
  });

  it("fails Procurement closed when a posted entry has mismatched approved-line lineage", async () => {
    await approvedProcurementProject({
      id: "procurement-corrupt", lineAmountRupees: 1_000,
      postedSpendPaise: 25_000, taskProgress: 20
    });
    await FinanceLedgerEntryModel.collection.updateOne(
      { _id: "procurement-corrupt:entry" },
      { $set: { sourceLineItemKey: "not-approved" } }
    );

    const [overview, page] = await Promise.all([
      mongoSuperAdminDashboardOverview({
        observedAt: OBSERVED_AT,
        startAt: PERIOD_START_AT,
        endAt: PERIOD_END_AT,
        periodDays: 7
      }),
      mongoSuperAdminDashboardProjects(OBSERVED_AT, {
        module: "procurement", sort: "name_asc", limit: 20, offset: 0
      })
    ]);

    expect(overview.procurement.plannedAmountPaise).toBe(0);
    expect(overview.dataQuality).toMatchObject({ status: "partial" });
    expect(overview.dataQuality.unavailableMetricKeys).toEqual(expect.arrayContaining([
      "procurement.approvedAmountPaise",
      "procurement.postedSpendPaise",
      "procurement.variancePaise"
    ]));
    expect(page.items[0]?.procurement).toBeNull();
    expect(page.dataQuality.unavailableMetricKeys).toEqual(expect.arrayContaining([
      "procurement.approvedAmountPaise",
      "procurement.postedSpendPaise",
      "procurement.variancePaise"
    ]));
  });

  it("isolates an independent trend aggregate failure while preserving base Project metrics", async () => {
    await ProjectModel.create(
      project("project-partial", "Partial overview", "2026-09-30T00:00:00.000Z")
    );
    const aggregate = vi.spyOn(FinanceLedgerEntryModel, "aggregate");
    aggregate.mockReturnValueOnce({
      exec: () => Promise.reject(new Error("simulated ledger trend read failure"))
    } as never);
    try {
      const overview = await mongoSuperAdminDashboardOverview({
        observedAt: OBSERVED_AT,
        startAt: PERIOD_START_AT,
        endAt: PERIOD_END_AT,
        periodDays: 7
      });

      expect(overview.projects.total).toBe(1);
      expect(overview.dataQuality).toMatchObject({ status: "partial" });
      expect(overview.dataQuality.unavailableMetricKeys).toContain(
        "trends.ledgerExpensesPostedPaise"
      );
    } finally {
      aggregate.mockRestore();
    }
  });

  it.each<{
    source: NonNullable<Parameters<typeof mongoSuperAdminDashboardOverview>[0]["failureInjection"]>[number];
    expectedMetricKeys: readonly string[];
  }>([
    {
      source: "finance",
      expectedMetricKeys: [
        "finance.currentProfitPaise", "finance.recordedCostPaise",
        "estimation.approvedSubtotalPaise", "estimation.approvedContractTotalPaise"
      ]
    },
    {
      source: "canonicalModules",
      expectedMetricKeys: [
        "estimation.draftInternal", "estimation.awaitingClient",
        "design.eligibleProjects", "design.approvalRate"
      ]
    },
    {
      source: "procurement",
      expectedMetricKeys: [
        "procurement.eligibleProjects", "procurement.approvedAmountPaise",
        "procurement.postedSpendPaise", "procurement.averageProgress"
      ]
    },
    {
      source: "execution",
      expectedMetricKeys: [
        "execution.total", "execution.completedInPeriod",
        "execution.weightedProgress", "workforce.activeUnassignedTaskCount"
      ]
    },
    {
      source: "workforce",
      expectedMetricKeys: [
        "workforce.activeWorkers", "workforce.activeAssignedTaskCount",
        "workforce.completedInPeriodTaskCount", "workforce.averageKpi"
      ]
    },
    {
      source: "risk",
      expectedMetricKeys: [
        "projects.atRisk", "risk.projectDistribution",
        "risk.factorDistribution", "risk.topProjects"
      ]
    },
    {
      source: "projectTrend",
      expectedMetricKeys: ["trends.projectsCreated", "trends.projectsCompleted"]
    },
    {
      source: "approvalTrend",
      expectedMetricKeys: ["trends.estimatesApproved", "trends.designPlansApproved"]
    },
    {
      source: "lineage",
      expectedMetricKeys: [
        "estimation.clientApproved", "design.eligibleProjects",
        "procurement.eligibleProjects", "finance.approvedSubtotalPaise",
        "execution.total", "workforce.inactiveAssigneeTaskCount",
        "risk.factorDistribution", "trends.designPlansApproved"
      ]
    }
  ])("maps a failed $source read to every tested dependent frontend metric", async ({
    source,
    expectedMetricKeys
  }) => {
    await ProjectModel.create(
      project(`failure-${source}`, `Failure ${source}`, "2026-09-30T00:00:00.000Z")
    );

    const overview = await mongoSuperAdminDashboardOverview({
      observedAt: OBSERVED_AT,
      startAt: PERIOD_START_AT,
      endAt: PERIOD_END_AT,
      periodDays: 7,
      failureInjection: [source]
    });

    expect(overview.projects.total).toBe(1);
    expect(overview.dataQuality).toMatchObject({ status: "partial" });
    expect(overview.dataQuality.unavailableMetricKeys).toEqual(
      expect.arrayContaining(expectedMetricKeys)
    );
  });

  it.each<{
    label: string;
    filter: Pick<DashboardProjectFilters, "module" | "moduleStatus" | "riskLevel" | "riskFactor">;
  }>([
    { label: "module", filter: { module: "execution" } },
    { label: "module status", filter: { moduleStatus: "in_progress" } },
    { label: "risk level", filter: { riskLevel: "red" } },
    { label: "risk factor", filter: { riskFactor: "schedule" } }
  ])("applies the project $label filter before page selection and total", async ({ filter }) => {
    await ProjectModel.create([
      project("project-a-clear", "A clear project", "2026-09-30T00:00:00.000Z"),
      project("project-z-match", "Z matching project", "2026-08-20T00:00:00.000Z")
    ]);
    await ProjectWorkflowTaskModel.create(
      executionTask("task-z-match", "project-z-match", null)
    );

    const result = await mongoSuperAdminDashboardProjects(OBSERVED_AT, {
      ...filter,
      sort: "name_asc",
      limit: 1,
      offset: 0
    });

    expect(result.total).toBe(1);
    expect(result.items.map((row) => row.projectId)).toEqual(["project-z-match"]);
  });

  it("maps raw internal Estimate states to the closed draft_internal module status", async () => {
    await ProjectModel.create(
      project("project-draft", "Draft estimate project", "2026-09-30T00:00:00.000Z")
    );
    await LeadModel.create({
      _id: "project-draft:lead",
      projectId: "project-draft",
      ownerId: "dashboard-owner",
      clientName: "Dashboard Client",
      clientEmail: "draft@example.test",
      clientMobile: "9000000000",
      projectName: "Draft estimate project",
      location: "Pune",
      propertyType: "apartment",
      source: "dashboard-test",
      stage: "qualified",
      nextAction: "Prepare estimate",
      nextActionAt: new Date("2026-09-01T00:00:00.000Z")
    });
    await EstimateModel.create({
      _id: "project-draft:estimate",
      leadId: "project-draft:lead",
      projectId: "project-draft",
      ownerId: "dashboard-owner",
      version: 1,
      status: "pending_designer_approval",
      propertyType: "apartment",
      rooms: [], scopes: [], lineItems: [],
      subtotal: 0, gst: 0, total: 0,
      approvalRequired: true
    });

    const result = await mongoSuperAdminDashboardProjects(OBSERVED_AT, {
      module: "estimation", moduleStatus: "draft_internal",
      sort: "name_asc", limit: 20, offset: 0
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.estimate?.status).toBe("pending_designer_approval");
  });

  it("includes overdue unassigned execution tasks in the unassigned module status", async () => {
    await ProjectModel.create(
      project("project-overdue-unassigned", "Overdue unassigned", "2026-09-30T00:00:00.000Z")
    );
    await ProjectWorkflowTaskModel.create({
      ...executionTask("task-overdue-unassigned", "project-overdue-unassigned", null),
      dueAt: new Date("2026-08-20T00:00:00.000Z")
    });

    const result = await mongoSuperAdminDashboardProjects(OBSERVED_AT, {
      module: "execution", moduleStatus: "unassigned",
      sort: "risk_desc", limit: 20, offset: 0
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      projectId: "project-overdue-unassigned",
      execution: { unassignedTaskCount: 1, overdueTaskCount: 1 },
      risk: { level: "red" }
    });
  });

  it("sorts equal-severity risk by overdue magnitude then factor occurrence in memory and Mongo", async () => {
    const projects = [
      memoryProject("risk-old", "Z Oldest deadline", "2026-08-10T00:00:00.000Z"),
      memoryProject("risk-occurrence", "Z More factors", "2026-08-20T00:00:00.000Z"),
      memoryProject("risk-single", "A Single factor", "2026-08-20T00:00:00.000Z")
    ];
    await ProjectModel.create(projects.map((item) =>
      project(item.id, item.name, item.plannedEndAt)
    ));
    await ProjectWorkflowTaskModel.create({
      ...executionTask("risk-occurrence-task", "risk-occurrence", null),
      dueAt: new Date("2026-08-25T00:00:00.000Z")
    });
    const seedTask = demoSeedData.tasks[0]!;
    const memorySeed = {
      ...structuredClone(demoSeedData),
      projects,
      leads: [],
      estimateSummaries: [],
      tasks: [{
        ...structuredClone(seedTask),
        id: "risk-occurrence-task",
        projectId: "risk-occurrence",
        status: "in_progress" as const,
        progress: 25,
        currentDeadlineAt: "2026-08-25T00:00:00.000Z",
        originalDeadlineAt: "2026-08-25T00:00:00.000Z",
        completedAt: null,
        plannedStartAt: "2026-08-01T00:00:00.000Z"
      }]
    };
    const filters = { module: "risk" as const, sort: "risk_desc" as const, limit: 20, offset: 0 };

    const [mongoResult, memoryResult] = await Promise.all([
      mongoSuperAdminDashboardProjects(OBSERVED_AT, filters),
      Promise.resolve(memorySuperAdminDashboardProjects(memorySeed, OBSERVED_AT, filters))
    ]);
    const expectedOrder = ["risk-old", "risk-occurrence", "risk-single"];

    expect(mongoResult.items.map((row) => row.projectId)).toEqual(expectedOrder);
    expect(memoryResult.items.map((row) => row.projectId)).toEqual(expectedOrder);
  });

  it("keeps Risk inclusive and scopes module status to the selected module", async () => {
    await ProjectModel.create([
      project("project-a-clear", "A clear project", "2026-09-30T00:00:00.000Z"),
      project("project-z-execution", "Z execution project", "2026-09-30T00:00:00.000Z")
    ]);
    await ProjectWorkflowTaskModel.create(
      executionTask("task-z-execution", "project-z-execution", null)
    );

    const allRisk = await mongoSuperAdminDashboardProjects(OBSERVED_AT, {
      module: "risk", sort: "name_asc", limit: 20, offset: 0
    });
    const projectStatusMismatch = await mongoSuperAdminDashboardProjects(OBSERVED_AT, {
      module: "projects", moduleStatus: "in_progress", sort: "name_asc", limit: 20, offset: 0
    });
    const executionStatus = await mongoSuperAdminDashboardProjects(OBSERVED_AT, {
      module: "execution", moduleStatus: "in_progress", sort: "name_asc", limit: 20, offset: 0
    });

    expect(allRisk.total).toBe(2);
    expect(allRisk.items.map((row) => row.risk.level)).toEqual(["green", "yellow"]);
    expect(projectStatusMismatch.total).toBe(0);
    expect(executionStatus.items.map((row) => row.projectId)).toEqual(["project-z-execution"]);
  });

  it("returns explainable inactive-assignee risk and bounded lineage data quality", async () => {
    await ProjectModel.create(
      project("project-lineage", "Lineage project", "2026-09-30T00:00:00.000Z")
    );
    await ProjectWorkflowTaskModel.create(
      executionTask("task-lineage", "project-lineage", "missing-worker")
    );

    const result = await mongoSuperAdminDashboardProjects(OBSERVED_AT, {
      riskFactor: "staffing", sort: "risk_desc", limit: 20, offset: 0
    });

    expect(result.items[0]?.risk.factors).toEqual(expect.arrayContaining([
      expect.objectContaining({ reasonCode: "inactive_execution_assignee" })
    ]));
    expect(result.dataQuality).toMatchObject({ status: "partial" });
    expect(result.dataQuality.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "assignee_identity_mismatch", entityId: "task-lineage" }),
      expect.objectContaining({ code: "task_project_lineage_mismatch", entityId: "task-lineage" })
    ]));
    expect(result.dataQuality.issues.length).toBeLessThanOrEqual(50);
  });

  it("marks project detail metrics partial when a bounded task read reaches its cap", async () => {
    await ProjectModel.create(
      project("project-bounded", "Bounded project", "2026-09-30T00:00:00.000Z")
    );
    await ProjectWorkflowTaskModel.collection.insertMany(Array.from({ length: 5_001 }, (_, index) => ({
      ...executionTask(`bounded-task-${index}`, "project-bounded", null),
      openedAt: new Date(1_700_000_000_000 + index),
      createdAt: new Date(1_700_000_000_000 + index),
      updatedAt: new Date(1_700_000_000_000 + index)
    })));

    const result = await mongoSuperAdminDashboardProjects(OBSERVED_AT, {
      sort: "name_asc", limit: 20, offset: 0
    });

    expect(result.items[0]?.execution.taskCount).toBe(5_001);
    expect(result.dataQuality).toMatchObject({ status: "partial" });
    expect(result.dataQuality.unavailableMetricKeys).toContain("execution.taskIds");
    expect(result.dataQuality.issues.length).toBeLessThanOrEqual(50);
  });

  it("fails Procurement spend and variance closed when ledger lineage reaches its cap", async () => {
    await approvedProcurementProject({
      id: "procurement-ledger-cap", lineAmountRupees: 1_000,
      postedSpendPaise: 0, taskProgress: 20
    });
    await FinanceLedgerEntryModel.collection.insertMany(
      Array.from({ length: 5_001 }, (_, index) => ({
        _id: `procurement-ledger-cap:entry:${index}`,
        bucketId: "procurement-ledger-cap:bucket",
        projectId: "procurement-ledger-cap",
        type: "direct_spend",
        expenseClass: "procurement",
        category: "Procurement",
        amountPaise: 1,
        incurredAt: new Date(1_700_000_000_000 + index),
        description: "Bounded dashboard lineage",
        vendor: null,
        reference: null,
        sourceSectionId: "EL",
        sourceLineItemKey: `procurement-ledger-cap:line:${index}`,
        idempotencyKey: `procurement-ledger-cap:key:${index}`,
        status: "posted",
        version: 1,
        createdById: "dashboard-owner",
        createdAt: new Date(1_700_000_000_000 + index),
        updatedAt: new Date(1_700_000_000_000 + index)
      }))
    );

    const result = await mongoSuperAdminDashboardProjects(OBSERVED_AT, {
      module: "procurement", sort: "name_asc", limit: 20, offset: 0
    });

    expect(result.items[0]?.procurement).toBeNull();
    expect(result.dataQuality.unavailableMetricKeys).toEqual(expect.arrayContaining([
      "procurement.postedSpendPaise",
      "procurement.variancePaise"
    ]));
  });

  it("does not fall back to mutable Estimate money when review snapshots reach their cap", async () => {
    await approvedProcurementProject({
      id: "procurement-review-cap", lineAmountRupees: 1_000,
      postedSpendPaise: 0, taskProgress: 20
    });
    await EstimateClientReviewRoundModel.collection.insertMany(
      Array.from({ length: 5_001 }, (_, index) => ({
        _id: `procurement-review-cap:round:${index}`,
        estimateId: "procurement-review-cap:estimate",
        leadId: "procurement-review-cap:lead",
        projectId: "procurement-review-cap",
        estimateVersion: 1,
        sendGeneration: index + 1,
        dedupeKey: `procurement-review-cap:dedupe:${index}`,
        status: "pending",
        decision: null,
        deliveryStatus: "sent",
        createdAt: new Date(1_700_000_000_000 + index),
        updatedAt: new Date(1_700_000_000_000 + index)
      }))
    );

    const result = await mongoSuperAdminDashboardProjects(OBSERVED_AT, {
      module: "procurement", sort: "name_asc", limit: 20, offset: 0
    });

    expect(result.items[0]?.procurement).toBeNull();
    expect(result.dataQuality.unavailableMetricKeys).toEqual(expect.arrayContaining([
      "procurement.approvedAmountPaise",
      "procurement.postedSpendPaise",
      "procurement.variancePaise"
    ]));
  });

  it.each<{
    label: string;
    filter: Pick<DashboardWorkforceFilters, "assignmentState" | "kpiAvailability">;
  }>([
    { label: "assignment", filter: { assignmentState: "assigned" } },
    { label: "KPI availability", filter: { kpiAvailability: "available" } }
  ])("applies the workforce $label filter before page selection and total", async ({ filter }) => {
    await Promise.all([
      ProjectModel.create(project("worker-filter-project", "Worker filter project", "2026-09-30T00:00:00.000Z")),
      UserModel.create([
        worker("worker-a-unassigned", "A Unassigned"),
        worker("worker-z-match", "Z Assigned")
      ])
    ]);
    await ProjectWorkflowTaskModel.create(
      executionTask("task-worker-z", "worker-filter-project", "worker-z-match")
    );

    const result = await mongoSuperAdminDashboardWorkforce({
      observedAt: OBSERVED_AT,
      startAt: PERIOD_START_AT,
      endAt: PERIOD_END_AT,
      periodDays: 7,
      filters: {
        ...filter,
        sort: "name_asc",
        limit: 1,
        offset: 0
      }
    });

    expect(result.total).toBe(1);
    expect(result.items.map((row) => row.workerId)).toEqual(["worker-z-match"]);
  });

  it("treats capacity as unavailable for the full workforce population", async () => {
    await UserModel.create([
      worker("worker-a", "A Worker"),
      worker("worker-z", "Z Worker")
    ]);

    const unavailable = await mongoSuperAdminDashboardWorkforce({
      observedAt: OBSERVED_AT,
      startAt: PERIOD_START_AT,
      endAt: PERIOD_END_AT,
      periodDays: 7,
      filters: { capacityState: "unavailable", sort: "name_asc", limit: 1, offset: 0 }
    });
    const overCapacity = await mongoSuperAdminDashboardWorkforce({
      observedAt: OBSERVED_AT,
      startAt: PERIOD_START_AT,
      endAt: PERIOD_END_AT,
      periodDays: 7,
      filters: { capacityState: "over_capacity", sort: "name_asc", limit: 1, offset: 0 }
    });

    expect(unavailable).toMatchObject({ total: 2 });
    expect(unavailable.items).toHaveLength(1);
    expect(overCapacity).toMatchObject({
      items: [],
      total: 0,
      dataQuality: {
        unavailableMetricKeys: ["workforce.capacity"]
      }
    });
  });

  it("sorts exact period KPI scores before workforce pagination", async () => {
    await Promise.all([
      ProjectModel.create(project("kpi-project", "KPI project", "2026-09-30T00:00:00.000Z")),
      UserModel.create([
        worker("worker-a-low", "A Low KPI"),
        worker("worker-z-high", "Z High KPI")
      ])
    ]);
    await ProjectWorkflowTaskModel.create([
      {
        ...executionTask("task-a-low", "kpi-project", "worker-a-low"),
        openedAt: new Date("2026-08-20T00:00:00.000Z"),
        dueAt: new Date("2026-08-25T00:00:00.000Z"),
        progress: 10
      },
      {
        ...executionTask("task-z-high", "kpi-project", "worker-z-high"),
        status: "completed",
        progress: 100,
        openedAt: new Date("2026-08-24T00:00:00.000Z"),
        dueAt: new Date("2026-08-29T00:00:00.000Z"),
        completedAt: new Date("2026-08-25T00:00:00.000Z")
      }
    ]);

    const result = await mongoSuperAdminDashboardWorkforce({
      observedAt: OBSERVED_AT,
      startAt: PERIOD_START_AT,
      endAt: PERIOD_END_AT,
      periodDays: 7,
      filters: { sort: "kpi_desc", limit: 1, offset: 0 }
    });

    expect(result.total).toBe(2);
    expect(result.items[0]).toMatchObject({
      workerId: "worker-z-high",
      kpi: { availability: "available", scoreBps: 10000 }
    });
  });

  it("matches canonical KPI scoring for legacy, late, weekend, unavailable, and unequal-effort work", async () => {
    await Promise.all([
      ProjectModel.create(project("kpi-matrix-project", "KPI matrix", "2026-09-30T00:00:00.000Z")),
      UserModel.create([
        worker("kpi-legacy", "Legacy completion"),
        worker("kpi-late", "Late completion"),
        worker("kpi-weekend", "Weekend completion"),
        worker("kpi-unavailable", "Unavailable KPI"),
        worker("kpi-unequal", "Unequal effort")
      ])
    ]);
    const taskRows = [
      {
        ...executionTask("kpi-legacy-task", "kpi-matrix-project", "kpi-legacy"),
        status: "completed", progress: 100, plannedEffort: 1,
        openedAt: new Date("2026-08-24T00:00:00.000Z"),
        dueAt: new Date("2026-08-26T00:00:00.000Z"),
        completedAt: null,
        updatedAt: new Date("2026-08-25T00:00:00.000Z")
      },
      {
        ...executionTask("kpi-late-task", "kpi-matrix-project", "kpi-late"),
        status: "completed", progress: 100, plannedEffort: 1,
        openedAt: new Date("2026-08-24T00:00:00.000Z"),
        dueAt: new Date("2026-08-25T00:00:00.000Z"),
        completedAt: null,
        updatedAt: new Date("2026-08-27T00:00:00.000Z")
      },
      {
        ...executionTask("kpi-weekend-task", "kpi-matrix-project", "kpi-weekend"),
        status: "completed", progress: 100, plannedEffort: 1,
        openedAt: new Date("2026-08-28T00:00:00.000Z"),
        dueAt: new Date("2026-08-30T00:00:00.000Z"),
        completedAt: null,
        updatedAt: new Date("2026-08-30T00:00:00.000Z")
      },
      {
        ...executionTask("kpi-unequal-high", "kpi-matrix-project", "kpi-unequal"),
        status: "completed", progress: 100, plannedEffort: 9,
        openedAt: new Date("2026-08-24T00:00:00.000Z"),
        dueAt: new Date("2026-08-26T00:00:00.000Z"),
        completedAt: null,
        updatedAt: new Date("2026-08-25T00:00:00.000Z")
      },
      {
        ...executionTask("kpi-unequal-low", "kpi-matrix-project", "kpi-unequal"),
        status: "completed", progress: 100, plannedEffort: 1,
        openedAt: new Date("2026-08-24T00:00:00.000Z"),
        dueAt: new Date("2026-08-25T00:00:00.000Z"),
        completedAt: null,
        updatedAt: new Date("2026-08-27T00:00:00.000Z")
      }
    ];
    await ProjectWorkflowTaskModel.collection.insertMany(taskRows);
    const canonicalTask = (task: (typeof taskRows)[number]): KpiTask => ({
      id: task._id,
      plannedStartAt: task.openedAt.toISOString(),
      currentDeadlineAt: task.dueAt.toISOString(),
      plannedEffort: task.plannedEffort,
      progress: task.progress,
      status: "completed",
      completedAt: (task.completedAt ?? task.updatedAt).toISOString()
    });
    const canonicalScore = (workerId: string) => {
      const result = calculateKpi({
        tasks: taskRows.filter((task) => task.assigneeUserId === workerId).map(canonicalTask),
        periodStartAt: PERIOD_START_AT,
        periodEndAt: PERIOD_END_AT,
        now: new Date(OBSERVED_AT)
      });
      return {
        scoreBps: Math.round(result.score * 100),
        eligibleComponentCount: result.components.filter((component) => component.score !== null).length
      };
    };

    const result = await mongoSuperAdminDashboardWorkforce({
      observedAt: OBSERVED_AT,
      startAt: PERIOD_START_AT,
      endAt: PERIOD_END_AT,
      periodDays: 7,
      filters: { sort: "name_asc", limit: 20, offset: 0 }
    });
    const rowById = new Map(result.items.map((row) => [row.workerId, row]));

    for (const workerId of ["kpi-legacy", "kpi-late", "kpi-weekend", "kpi-unequal"]) {
      expect(rowById.get(workerId)?.kpi).toEqual({
        availability: "available",
        ...canonicalScore(workerId)
      });
    }
    expect(rowById.get("kpi-legacy")?.completedInPeriod).toBe(1);
    expect(rowById.get("kpi-late")?.completedInPeriod).toBe(1);
    expect(rowById.get("kpi-weekend")?.completedInPeriod).toBe(1);
    expect(rowById.get("kpi-unequal")?.completedInPeriod).toBe(2);
    expect(rowById.get("kpi-unavailable")?.kpi).toEqual({
      availability: "unavailable", scoreBps: null, eligibleComponentCount: 0
    });
  });
});
