import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  backfillApprovedProjectFinanceBuckets
} from "../src/migrations/project-finance-backfill.js";
import { DesignPlanReviewRoundModel } from "../src/models/DesignPlanReviewRound.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectFinanceBucketModel } from "../src/models/ProjectFinanceBucket.js";
import { ensurePendingProjectFinanceBucket } from "../src/services/project-finance.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const ESTIMATE_APPROVED_AT = new Date("2026-08-01T09:00:00.000Z");
const DESIGN_APPROVED_AT = new Date("2026-08-10T09:00:00.000Z");

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("project-finance-backfill-tests");
  await Promise.all([
    DesignPlanReviewRoundModel.syncIndexes(),
    EstimateModel.syncIndexes(),
    EstimateClientReviewRoundModel.syncIndexes(),
    LeadModel.syncIndexes(),
    ProjectModel.syncIndexes(),
    ProjectFinanceBucketModel.syncIndexes()
  ]);
}, 120_000);

beforeEach(async () => {
  await replica.clear();
});

afterAll(async () => {
  await replica.stop();
});

describe("approved project finance backfill migration", () => {
  it("creates and retains a pending bucket for every Estimate-approved project before Design approval", async () => {
    await insertProject("project-pending-design");
    await insertApprovedEstimate({
      estimateId: "estimate-pending-design",
      projectId: "project-pending-design",
      version: 2,
      designPlanVersion: 0,
      designPlanStatus: "pending_assignment",
      subtotal: 1_000,
      gst: 180,
      total: 1_180
    });
    await insertApprovedEstimateRound({
      estimateId: "estimate-pending-design",
      projectId: "project-pending-design",
      estimateVersion: 1,
      subtotal: 1_000,
      gst: 180,
      total: 1_180
    });

    await expect(backfillApprovedProjectFinanceBuckets()).resolves.toMatchObject({
      estimatesScanned: 1,
      projectsSourceResolved: 1,
      createdPending: 1,
      createdAndOpened: 0,
      skippedCount: 0
    });
    await expect(ProjectFinanceBucketModel.findOne({
      projectId: "project-pending-design"
    }).lean()).resolves.toMatchObject({
      status: "pending_design",
      designPlanVersion: 0,
      approvedSubtotalPaise: 100_000,
      approvedGstPaise: 18_000,
      approvedContractTotalPaise: 118_000
    });

    await expect(backfillApprovedProjectFinanceBuckets()).resolves.toMatchObject({
      alreadyPending: 1,
      createdPending: 0,
      skippedCount: 0
    });
  });

  it("backfills a Projects-visible approved Estimate linked only through its Lead", async () => {
    const projectId = "project-legacy-lead-link";
    const estimateId = "estimate-legacy-lead-link";
    await insertProject(projectId);
    await insertLead(`lead-${estimateId}`, projectId);
    await insertApprovedEstimate({
      estimateId,
      projectId: null,
      version: 2,
      designPlanVersion: 0,
      designPlanStatus: "pending_assignment",
      subtotal: 3_000,
      gst: 540,
      total: 3_540
    });
    await insertApprovedEstimateRound({
      estimateId,
      projectId: null,
      estimateVersion: 1,
      subtotal: 3_000,
      gst: 540,
      total: 3_540
    });

    await expect(backfillApprovedProjectFinanceBuckets()).resolves.toMatchObject({
      estimatesScanned: 1,
      projectsSourceResolved: 1,
      createdPending: 1,
      skippedCount: 0
    });
    await expect(ProjectFinanceBucketModel.findOne({ projectId }).lean())
      .resolves.toMatchObject({
        projectId,
        estimateId,
        status: "pending_design",
        approvedContractTotalPaise: 354_000
      });
  });

  it("reports missing and contradictory legacy project links instead of silently omitting them", async () => {
    await insertProject("project-direct-link");
    await insertProject("project-lead-link");
    await insertLead("lead-estimate-link-conflict", "project-lead-link");
    await insertApprovedEstimate({
      estimateId: "estimate-link-conflict",
      projectId: "project-direct-link",
      version: 2,
      designPlanVersion: 0,
      designPlanStatus: "pending_assignment",
      subtotal: 1_000,
      gst: 180,
      total: 1_180
    });
    await insertApprovedEstimate({
      estimateId: "estimate-missing-link",
      projectId: null,
      version: 2,
      designPlanVersion: 0,
      designPlanStatus: "pending_assignment",
      subtotal: 2_000,
      gst: 360,
      total: 2_360
    });

    await expect(backfillApprovedProjectFinanceBuckets()).resolves.toMatchObject({
      estimatesScanned: 2,
      projectsSourceResolved: 0,
      skippedCount: 2,
      skipCounts: {
        estimate_project_link_conflict: 1,
        missing_project_link: 1
      }
    });
    expect(await ProjectFinanceBucketModel.countDocuments()).toBe(0);
  });

  it("opens from the immutable approved Estimate snapshot and is idempotent", async () => {
    await insertProject("project-snapshot");
    await insertApprovedEstimate({
      estimateId: "estimate-snapshot",
      projectId: "project-snapshot",
      version: 6,
      designPlanVersion: 2,
      subtotal: 9_000,
      gst: 1_620,
      total: 10_620
    });
    await insertApprovedEstimateRound({
      estimateId: "estimate-snapshot",
      projectId: null,
      estimateVersion: 5,
      subtotal: 1_000,
      gst: 180,
      total: 1_180
    });
    await insertApprovedDesignRound({
      estimateId: "estimate-snapshot",
      projectId: "project-snapshot",
      designPlanVersion: 2
    });

    await expect(backfillApprovedProjectFinanceBuckets()).resolves.toMatchObject({
      estimatesScanned: 1,
      projectsSourceResolved: 1,
      immutableSnapshotSources: 1,
      legacyFallbackSources: 0,
      createdAndOpened: 1,
      pendingOpened: 0,
      alreadyOpen: 0,
      skippedCount: 0,
      dryRun: false
    });
    await expect(ProjectFinanceBucketModel.findOne({
      projectId: "project-snapshot"
    }).lean()).resolves.toMatchObject({
      estimateId: "estimate-snapshot",
      estimateVersion: 5,
      estimateReviewRoundId: "estimate-review-estimate-snapshot",
      designPlanVersion: 2,
      approvedSubtotalPaise: 100_000,
      approvedGstPaise: 18_000,
      approvedContractTotalPaise: 118_000,
      targetProfitPaise: 20_000,
      costBudgetPaise: 80_000,
      status: "open",
      version: 2,
      createdById: "approving-client",
      openedById: "approving-admin",
      openedAt: DESIGN_APPROVED_AT
    });

    await expect(backfillApprovedProjectFinanceBuckets()).resolves.toMatchObject({
      estimatesScanned: 1,
      immutableSnapshotSources: 1,
      createdAndOpened: 0,
      alreadyOpen: 1,
      skippedCount: 0
    });
    expect(await ProjectFinanceBucketModel.countDocuments()).toBe(1);
  });

  it("uses complete legacy approval evidence and opens an exact pending bucket", async () => {
    await insertProject("project-legacy");
    await insertApprovedEstimate({
      estimateId: "estimate-legacy",
      projectId: "project-legacy",
      version: 4,
      designPlanVersion: 3,
      subtotal: 2_000,
      gst: 360,
      total: 2_360,
      reviews: [{
        actorId: "legacy-client",
        action: "client_approved",
        note: "Approved",
        occurredAt: ESTIMATE_APPROVED_AT
      }]
    });
    await mongoose.connection.transaction(async (session) => {
      await ensurePendingProjectFinanceBucket({
        projectId: "project-legacy",
        estimateId: "estimate-legacy",
        estimateVersion: 3,
        estimateReviewRoundId: null,
        approvedSubtotalRupees: 2_000,
        approvedGstRupees: 360,
        approvedContractTotalRupees: 2_360,
        createdById: "legacy-client",
        occurredAt: ESTIMATE_APPROVED_AT
      }, session);
    });

    await expect(backfillApprovedProjectFinanceBuckets()).resolves.toMatchObject({
      estimatesScanned: 1,
      immutableSnapshotSources: 0,
      legacyFallbackSources: 1,
      createdAndOpened: 0,
      pendingOpened: 1,
      alreadyOpen: 0,
      skippedCount: 0
    });
    await expect(ProjectFinanceBucketModel.findOne({
      projectId: "project-legacy"
    }).lean()).resolves.toMatchObject({
      estimateVersion: 3,
      estimateReviewRoundId: null,
      designPlanVersion: 3,
      status: "open",
      openedById: "approving-admin",
      version: 2
    });
  });

  it("dry-runs without writes and refuses mutable fallback when an immutable snapshot is invalid", async () => {
    await insertProject("project-dry-run");
    await insertApprovedEstimate({
      estimateId: "estimate-dry-run",
      projectId: "project-dry-run",
      version: 2,
      designPlanVersion: 1,
      subtotal: 1_000,
      gst: 180,
      total: 1_180
    });
    await insertApprovedEstimateRound({
      estimateId: "estimate-dry-run",
      projectId: "project-dry-run",
      estimateVersion: 1,
      subtotal: 1_000,
      gst: 180,
      total: 1_180
    });

    await insertProject("project-invalid-snapshot");
    await insertApprovedEstimate({
      estimateId: "estimate-invalid-snapshot",
      projectId: "project-invalid-snapshot",
      version: 2,
      designPlanVersion: 1,
      subtotal: 5_000,
      gst: 900,
      total: 5_900,
      reviews: [{
        actorId: "legacy-client",
        action: "client_approved",
        note: "Approved",
        occurredAt: ESTIMATE_APPROVED_AT
      }]
    });
    await insertApprovedEstimateRound({
      estimateId: "estimate-invalid-snapshot",
      projectId: "project-invalid-snapshot",
      estimateVersion: 1,
      subtotal: 1_000,
      gst: 180,
      total: 9_999
    });

    const report = await backfillApprovedProjectFinanceBuckets({ dryRun: true });
    expect(report).toMatchObject({
      estimatesScanned: 2,
      immutableSnapshotSources: 1,
      legacyFallbackSources: 0,
      createdAndOpened: 1,
      skippedCount: 1,
      skipCounts: { invalid_estimate_money: 1 },
      dryRun: true
    });
    expect(await ProjectFinanceBucketModel.countDocuments()).toBe(0);
  });

  it("reports duplicate approved Estimates and leaves conflicting finance baselines untouched", async () => {
    await insertProject("project-duplicate");
    for (const estimateId of ["estimate-duplicate-a", "estimate-duplicate-b"]) {
      await insertApprovedEstimate({
        estimateId,
        projectId: "project-duplicate",
        version: 2,
        designPlanVersion: 1,
        subtotal: 1_000,
        gst: 180,
        total: 1_180,
        reviews: [{
          actorId: "legacy-client",
          action: "client_approved",
          note: "Approved",
          occurredAt: ESTIMATE_APPROVED_AT
        }]
      });
    }

    await insertProject("project-conflict");
    await insertApprovedEstimate({
      estimateId: "estimate-conflict",
      projectId: "project-conflict",
      version: 2,
      designPlanVersion: 1,
      subtotal: 1_000,
      gst: 180,
      total: 1_180,
      reviews: [{
        actorId: "legacy-client",
        action: "client_approved",
        note: "Approved",
        occurredAt: ESTIMATE_APPROVED_AT
      }]
    });
    await mongoose.connection.transaction(async (session) => {
      await ensurePendingProjectFinanceBucket({
        projectId: "project-conflict",
        estimateId: "estimate-conflict",
        estimateVersion: 1,
        estimateReviewRoundId: null,
        approvedSubtotalRupees: 2_000,
        approvedGstRupees: 360,
        approvedContractTotalRupees: 2_360,
        createdById: "legacy-client",
        occurredAt: ESTIMATE_APPROVED_AT
      }, session);
    });

    const report = await backfillApprovedProjectFinanceBuckets();
    expect(report).toMatchObject({
      estimatesScanned: 3,
      projectsSourceResolved: 1,
      createdAndOpened: 0,
      skippedCount: 3,
      skipCounts: {
        duplicate_project_estimates: 2,
        existing_bucket_conflict: 1
      }
    });
    await expect(ProjectFinanceBucketModel.findOne({
      projectId: "project-conflict"
    }).lean()).resolves.toMatchObject({
      approvedSubtotalPaise: 200_000,
      status: "pending_design",
      version: 1
    });
    expect(await ProjectFinanceBucketModel.countDocuments()).toBe(1);
  });
});

async function insertProject(projectId: string): Promise<void> {
  await ProjectModel.collection.insertOne({
    _id: projectId,
    name: projectId,
    status: "active",
    location: "Bengaluru",
    plannedStartAt: ESTIMATE_APPROVED_AT,
    plannedEndAt: DESIGN_APPROVED_AT,
    createdAt: ESTIMATE_APPROVED_AT,
    updatedAt: DESIGN_APPROVED_AT
  });
}

async function insertLead(leadId: string, projectId: string): Promise<void> {
  await LeadModel.collection.insertOne({
    _id: leadId,
    projectId,
    ownerId: `owner-${leadId}`,
    clientName: "Client",
    clientEmail: "client@example.com",
    clientMobile: "+919999999999",
    projectName: projectId,
    location: "Bengaluru",
    propertyType: "villa",
    source: "legacy",
    stage: "won",
    nextAction: "Assign Designer for design plan",
    nextActionAt: ESTIMATE_APPROVED_AT,
    createdAt: ESTIMATE_APPROVED_AT,
    updatedAt: ESTIMATE_APPROVED_AT
  });
}

async function insertApprovedEstimate(input: {
  estimateId: string;
  projectId: string | null;
  version: number;
  designPlanVersion: number;
  designPlanStatus?: "pending_assignment" | "approved";
  subtotal: number;
  gst: number;
  total: number;
  reviews?: Row[];
}): Promise<void> {
  await EstimateModel.collection.insertOne({
    _id: input.estimateId,
    leadId: `lead-${input.estimateId}`,
    ownerId: `owner-${input.estimateId}`,
    version: input.version,
    status: "client_approved",
    propertyType: "villa",
    rooms: [],
    scopes: [],
    lineItems: [],
    subtotal: input.subtotal,
    gst: input.gst,
    total: input.total,
    projectId: input.projectId,
    reviews: input.reviews ?? [],
    designPlanStatus: input.designPlanStatus ?? "approved",
    designPlanVersion: input.designPlanVersion,
    designPlanApprovedAt: input.designPlanStatus === "pending_assignment"
      ? null
      : DESIGN_APPROVED_AT,
    designPlanApprovedById: input.designPlanStatus === "pending_assignment"
      ? null
      : "approving-admin",
    designPlanApprovalSource: input.designPlanStatus === "pending_assignment"
      ? null
      : "admin_proof",
    designFrozenAt: input.designPlanStatus === "pending_assignment"
      ? null
      : DESIGN_APPROVED_AT,
    createdAt: ESTIMATE_APPROVED_AT,
    updatedAt: DESIGN_APPROVED_AT
  });
}

async function insertApprovedEstimateRound(input: {
  estimateId: string;
  projectId: string | null;
  estimateVersion: number;
  subtotal: number;
  gst: number;
  total: number;
}): Promise<void> {
  await EstimateClientReviewRoundModel.collection.insertOne({
    _id: `estimate-review-${input.estimateId}`,
    estimateId: input.estimateId,
    leadId: `lead-${input.estimateId}`,
    projectId: input.projectId,
    estimateVersion: input.estimateVersion,
    sendGeneration: 1,
    dedupeKey: input.estimateId.padEnd(64, "0").slice(0, 64),
    estimateSnapshot: {
      clientName: "Client",
      projectName: input.projectId ?? "Project",
      location: "Bengaluru",
      propertyType: "villa",
      lineItems: [],
      subtotal: input.subtotal,
      gst: input.gst,
      total: input.total
    },
    status: "approved",
    decision: "approve",
    decisionSource: "client_portal",
    decisionNote: "",
    decidedById: "approving-client",
    decidedAt: ESTIMATE_APPROVED_AT,
    createdAt: ESTIMATE_APPROVED_AT,
    updatedAt: ESTIMATE_APPROVED_AT
  });
}

async function insertApprovedDesignRound(input: {
  estimateId: string;
  projectId: string;
  designPlanVersion: number;
}): Promise<void> {
  await DesignPlanReviewRoundModel.collection.insertOne({
    _id: `design-review-${input.estimateId}`,
    estimateId: input.estimateId,
    projectId: input.projectId,
    designPlanVersion: input.designPlanVersion,
    status: "approved",
    decision: "approve",
    decisionSource: "admin_proof",
    decisionNote: "Approved",
    decidedById: "approving-admin",
    decidedAt: DESIGN_APPROVED_AT,
    createdAt: DESIGN_APPROVED_AT,
    updatedAt: DESIGN_APPROVED_AT
  });
}

type Row = Record<string, unknown>;
