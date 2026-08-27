import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditEventModel } from "../src/models/AuditEvent.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { FinanceLedgerEntryModel } from "../src/models/FinanceLedgerEntry.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectFinanceBucketModel } from "../src/models/ProjectFinanceBucket.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { UserModel } from "../src/models/User.js";
import {
  createProjectFinanceService,
  ensurePendingProjectFinanceBucket,
  openProjectFinanceBucket
} from "../src/services/project-finance.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-08-26T09:00:00.000Z");
const SUPER_ADMIN_ID = "finance-super-admin";
const FINANCE_MANAGER_ID = "finance-manager";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("project-finance-tests");
  await Promise.all([
    AuditEventModel.syncIndexes(),
    EstimateClientReviewRoundModel.syncIndexes(),
    EstimateModel.syncIndexes(),
    FinanceLedgerEntryModel.syncIndexes(),
    LeadModel.syncIndexes(),
    ProjectFinanceBucketModel.syncIndexes(),
    ProjectModel.syncIndexes(),
    ProjectWorkflowTaskModel.syncIndexes(),
    UserModel.syncIndexes()
  ]);
}, 120_000);

beforeEach(async () => {
  vi.restoreAllMocks();
  await replica.clear();
  await Promise.all([
    createUser(SUPER_ADMIN_ID, "super_admin"),
    createUser(FINANCE_MANAGER_ID, "finance_head"),
    createUser("finance-admin", "admin")
  ]);
});

afterAll(async () => {
  await replica.stop();
});

describe("project finance lifecycle and ledger", () => {
  it("derives every portfolio total from a legacy Lead-linked approved Estimate without a finance bucket", async () => {
    const projectId = "legacy-approved-without-finance-bucket";
    await createProject(projectId, "Murthy Residence", {
      financeLink: "lead",
      approvedMoney: {
        subtotalRupees: 236_190,
        gstRupees: 42_514,
        totalRupees: 278_704
      }
    });
    expect(await ProjectFinanceBucketModel.countDocuments({ projectId })).toBe(0);

    const service = createProjectFinanceService({ now: () => NOW });
    const page = await service.listProjects(superAdminActor(), {
      limit: 20,
      offset: 0
    });
    expect(page.total).toBe(1);
    expect(page.items).toEqual([
      expect.objectContaining({
        projectId,
        projectName: "Murthy Residence",
        approvedContractTotalPaise: 27_870_400,
        approvedGstPaise: 4_251_400,
        approvedSubtotalPaise: 23_619_000,
        targetProfitPaise: 4_723_800,
        costBudgetPaise: 18_895_200,
        procurementCostPaise: 0,
        employeePaymentPaise: 0,
        otherExpensePaise: 0,
        directSpendPaise: 0,
        overheadPaise: 0,
        recordedCostPaise: 0,
        remainingBudgetPaise: 18_895_200,
        currentProfitPaise: 23_619_000,
        currentMarginBps: 10_000,
        status: "pending_design"
      })
    ]);
    expect(page.summary).toEqual({
      projectCount: 1,
      approvedContractTotalPaise: 27_870_400,
      approvedGstPaise: 4_251_400,
      approvedSubtotalPaise: 23_619_000,
      targetProfitPaise: 4_723_800,
      costBudgetPaise: 18_895_200,
      procurementCostPaise: 0,
      employeePaymentPaise: 0,
      otherExpensePaise: 0,
      directSpendPaise: 0,
      overheadPaise: 0,
      recordedCostPaise: 0,
      remainingBudgetPaise: 18_895_200,
      currentProfitPaise: 23_619_000,
      currentMarginBps: 10_000,
      overBudgetProjectCount: 0,
      overdueProjectCount: 0,
      lateCompletedProjectCount: 0,
      overdueTaskCount: 0
    });
    await expect(service.getBucket(superAdminActor(), projectId))
      .resolves.toMatchObject({
        projectId,
        approvedContractTotalPaise: 27_870_400,
        remainingBudgetPaise: 18_895_200
      });
    await expect(service.listEntries(superAdminActor(), projectId, {
      limit: 20,
      offset: 0
    })).resolves.toEqual({ items: [], total: 0 });
    await expect(service.postEntry(superAdminActor(), projectId, {
      type: "direct_spend",
      expenseClass: "other",
      category: "Must remain locked",
      amountPaise: 10_000,
      incurredAt: NOW.toISOString(),
      description: "No materialized open bucket exists",
      idempotencyKey: "legacy-locked-expense"
    })).rejects.toMatchObject({
      status: 409,
      code: "FINANCE_BUCKET_NOT_OPEN"
    });
  });

  it("reconciles an approved Design with no bucket from its immutable v1 Estimate snapshot before the first expense", async () => {
    const projectId = "approved-design-without-finance-bucket";
    const estimateId = `estimate-${projectId}`;
    const approvalRoundId = `estimate-review-${projectId}`;
    const estimateApprovedAt = new Date("2026-08-24T09:00:00.000Z");
    const designApprovedAt = new Date("2026-08-25T09:00:00.000Z");
    await createProject(projectId, "Murthy Residence", {
      approvedMoney: {
        subtotalRupees: 236_190,
        gstRupees: 42_514,
        totalRupees: 278_704
      }
    });
    await EstimateModel.updateOne({ _id: estimateId }, {
      $set: {
        version: 2,
        designPlanStatus: "approved",
        designPlanVersion: 1,
        designPlanApprovedAt: designApprovedAt,
        designPlanApprovedById: SUPER_ADMIN_ID,
        designPlanApprovalSource: "admin_proof"
      }
    });
    await EstimateClientReviewRoundModel.create({
      _id: approvalRoundId,
      estimateId,
      leadId: `lead-${projectId}`,
      projectId,
      estimateVersion: 1,
      sendGeneration: 1,
      dedupeKey: "a".repeat(64),
      recipientEmail: "murthy@example.test",
      recipientEmailNormalized: "murthy@example.test",
      estimateSnapshot: {
        clientName: "Murthy",
        projectName: "Murthy Residence",
        location: "Bengaluru",
        propertyType: "villa",
        lineItems: [],
        subtotal: 236_190,
        gst: 42_514,
        total: 278_704
      },
      pdfFilename: "murthy-estimate.pdf",
      pdfMimeType: "application/pdf",
      pdfByteSize: 1,
      pdfSha256: "b".repeat(64),
      pdfStorageReference: "estimate-review/murthy.pdf",
      deliveryStatus: "sent",
      deliveryAttemptGeneration: 1,
      deliveryAttemptCount: 1,
      deliveryAttemptedAt: estimateApprovedAt,
      deliveryLeaseExpiresAt: null,
      deliveredAt: estimateApprovedAt,
      deliveryFailureCode: null,
      assignedAdminId: SUPER_ADMIN_ID,
      status: "approved",
      decision: "approve",
      decisionSource: "admin_proof",
      decisionNote: "Approved for Client",
      decidedById: SUPER_ADMIN_ID,
      decidedAt: estimateApprovedAt,
      version: 2
    });
    await createFinanceWorkflowTask(projectId);
    expect(await ProjectFinanceBucketModel.countDocuments({ projectId })).toBe(0);

    const service = createProjectFinanceService({ now: () => NOW });
    const expected = {
      projectId,
      estimateId,
      estimateVersion: 1,
      estimateReviewRoundId: approvalRoundId,
      designPlanVersion: 1,
      approvedSubtotalPaise: 23_619_000,
      approvedGstPaise: 4_251_400,
      approvedContractTotalPaise: 27_870_400,
      targetProfitPaise: 4_723_800,
      costBudgetPaise: 18_895_200,
      status: "open"
    };
    await expect(service.listProjects(superAdminActor(), { limit: 20, offset: 0 }))
      .resolves.toMatchObject({ total: 1, items: [expected] });
    await expect(service.getBucket(superAdminActor(), projectId))
      .resolves.toMatchObject(expected);
    expect(await ProjectFinanceBucketModel.countDocuments({ projectId })).toBe(0);

    const entryInput = {
      type: "direct_spend" as const,
      expenseClass: "other" as const,
      category: "Carpentry material",
      amountPaise: 100_000,
      incurredAt: NOW.toISOString(),
      description: "First approved material invoice",
      idempotencyKey: "missing-bucket-first-expense"
    };
    const posted = await service.postEntry(superAdminActor(), projectId, entryInput);
    expect(posted).toMatchObject({
      replayed: false,
      bucket: {
        ...expected,
        directSpendPaise: 100_000,
        recordedCostPaise: 100_000,
        remainingBudgetPaise: 18_795_200
      }
    });
    await expect(ProjectFinanceBucketModel.findOne({ projectId }).lean())
      .resolves.toMatchObject({
        estimateId,
        estimateVersion: 1,
        estimateReviewRoundId: approvalRoundId,
        approvedContractTotalPaise: 27_870_400,
        designPlanVersion: 1,
        status: "open",
        directSpendPaise: 100_000
      });
    await expect(service.postEntry(superAdminActor(), projectId, entryInput))
      .resolves.toMatchObject({ replayed: true, entry: { id: posted.entry.id } });
    expect(await FinanceLedgerEntryModel.countDocuments({ projectId })).toBe(1);
  });

  it("opens the exact approved pre-GST budget and posts idempotent expenses", async () => {
    const projectId = "finance-project-one";
    await createProject(projectId, "Finance Residence");

    await mongoose.connection.transaction(async (session) => {
      const input = approvedBudgetInput(projectId);
      await ensurePendingProjectFinanceBucket(input, session);
      await ensurePendingProjectFinanceBucket(input, session);
    });
    expect(await ProjectFinanceBucketModel.countDocuments({ projectId })).toBe(1);
    expect(await ProjectFinanceBucketModel.findOne({ projectId }).lean()).toMatchObject({
      approvedSubtotalPaise: 100_000_000,
      approvedGstPaise: 18_000_000,
      approvedContractTotalPaise: 118_000_000,
      targetMarginBps: 2_000,
      targetProfitPaise: 20_000_000,
      costBudgetPaise: 80_000_000,
      status: "pending_design",
      version: 1
    });

    await mongoose.connection.transaction(async (session) => {
      const input = {
        projectId,
        designPlanVersion: 1,
        openedById: SUPER_ADMIN_ID,
        occurredAt: NOW
      };
      await openProjectFinanceBucket(input, session);
      await openProjectFinanceBucket(input, session);
    });

    const service = createProjectFinanceService({ now: () => NOW });
    const actor = superAdminActor();
    await expect(service.postEntry(actor, projectId, {
      type: "direct_spend",
      expenseClass: "procurement",
      category: "Materials",
      amountPaise: 1_000,
      incurredAt: NOW.toISOString(),
      description: "Must use the receipt-backed Procurement workflow",
      idempotencyKey: "generic-procurement-rejected"
    })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR"
    });
    expect(await FinanceLedgerEntryModel.countDocuments({ projectId })).toBe(0);
    const directInput = {
      type: "direct_spend" as const,
      expenseClass: "employee_payment" as const,
      category: "Materials",
      amountPaise: 55_000_000,
      incurredAt: "2026-08-25T09:00:00.000Z",
      description: "Approved carpentry material invoice",
      vendor: "Timber Works",
      reference: "INV-1001",
      sourceSectionId: "CA",
      idempotencyKey: "finance-entry-request-0001"
    };
    const first = await service.postEntry(actor, projectId, directInput);
    expect(first).toMatchObject({
      replayed: false,
      entry: {
        type: "direct_spend",
        amountPaise: 55_000_000,
        createdById: SUPER_ADMIN_ID,
        status: "posted"
      },
      bucket: {
        directSpendPaise: 55_000_000,
        overheadPaise: 0,
        recordedCostPaise: 55_000_000,
        remainingBudgetPaise: 25_000_000,
        currentProfitPaise: 45_000_000,
        currentMarginBps: 4_500,
        overBudget: false,
        version: 3
      }
    });

    const replay = await service.postEntry(actor, projectId, directInput);
    expect(replay.replayed).toBe(true);
    expect(replay.entry.id).toBe(first.entry.id);
    expect(await FinanceLedgerEntryModel.countDocuments({ projectId })).toBe(1);

    await expect(service.postEntry(actor, projectId, {
      ...directInput,
      expenseClass: "other"
    })).rejects.toMatchObject({
      status: 409,
      code: "FINANCE_IDEMPOTENCY_CONFLICT"
    });

    await expect(service.postEntry(actor, projectId, {
      ...directInput,
      amountPaise: 56_000_000
    })).rejects.toMatchObject({
      status: 409,
      code: "FINANCE_IDEMPOTENCY_CONFLICT"
    });

    const overhead = await service.postEntry(actor, projectId, {
      type: "overhead",
      category: "Site supervision",
      amountPaise: 30_000_000,
      incurredAt: "2026-08-26T08:00:00.000Z",
      description: "Allocated site-management overhead",
      idempotencyKey: "finance-entry-request-0002"
    });
    expect(overhead.bucket).toMatchObject({
      directSpendPaise: 55_000_000,
      overheadPaise: 30_000_000,
      recordedCostPaise: 85_000_000,
      remainingBudgetPaise: -5_000_000,
      currentProfitPaise: 15_000_000,
      currentMarginBps: 1_500,
      overBudget: true,
      version: 4
    });

    const listed = await service.listProjects(actor, { limit: 20, offset: 0 });
    expect(listed).toMatchObject({
      total: 1,
      items: [{
        projectId,
        projectName: "Finance Residence",
        approvedSubtotalPaise: 100_000_000,
        approvedGstPaise: 18_000_000,
        targetMarginBps: 2_000,
        procurementCostPaise: 0,
        employeePaymentPaise: 55_000_000,
        otherExpensePaise: 0,
        recordedCostPaise: 85_000_000,
        overBudget: true
      }],
      summary: {
        projectCount: 1,
        approvedContractTotalPaise: 118_000_000,
        approvedGstPaise: 18_000_000,
        approvedSubtotalPaise: 100_000_000,
        targetProfitPaise: 20_000_000,
        procurementCostPaise: 0,
        employeePaymentPaise: 55_000_000,
        overheadPaise: 30_000_000,
        recordedCostPaise: 85_000_000,
        remainingBudgetPaise: -5_000_000,
        currentProfitPaise: 15_000_000,
        currentMarginBps: 1_500,
        overBudgetProjectCount: 1,
        overdueProjectCount: 0,
        lateCompletedProjectCount: 0
      }
    });
    expect((await service.listEntries(actor, projectId, {
      limit: 20,
      offset: 0
    })).items.map(({ type, sourceLineItemKey, supportingDocument }) => ({
      type,
      sourceLineItemKey,
      supportingDocument
    }))).toEqual([
      { type: "overhead", sourceLineItemKey: null, supportingDocument: null },
      { type: "direct_spend", sourceLineItemKey: null, supportingDocument: null }
    ]);
    expect(await AuditEventModel.countDocuments({})).toBe(0);
  });

  it("summarizes every Estimate-approved project beyond the current page and derives deadline risk", async () => {
    const overdueProjectId = "finance-project-overdue";
    const pendingDesignProjectId = "finance-project-pending-design";
    await Promise.all([
      createProject(overdueProjectId, "Overdue Residence", {
        plannedEndAt: new Date("2026-08-20T09:00:00.000Z")
      }),
      createProject(pendingDesignProjectId, "Pending Design Residence")
    ]);
    await mongoose.connection.transaction(async (session) => {
      await ensurePendingProjectFinanceBucket(
        approvedBudgetInput(overdueProjectId),
        session
      );
      await ensurePendingProjectFinanceBucket(
        approvedBudgetInput(pendingDesignProjectId),
        session
      );
      await openProjectFinanceBucket({
        projectId: overdueProjectId,
        designPlanVersion: 1,
        openedById: SUPER_ADMIN_ID,
        occurredAt: NOW
      }, session);
    });
    await ProjectWorkflowTaskModel.create({
      _id: "overdue-finance-task",
      dedupeKey: "overdue-estimate:finance",
      projectId: overdueProjectId,
      estimateId: `estimate-${overdueProjectId}`,
      designPlanVersion: 1,
      kind: "finance",
      title: "Review overdue project",
      description: "Deadline review",
      assigneeRole: "finance_head",
      assigneeUserId: null,
      sourceSectionId: null,
      sourceLineItemKey: null,
      roomName: null,
      status: "open",
      progress: 0,
      version: 1,
      openedAt: new Date("2026-08-18T09:00:00.000Z"),
      dueAt: new Date("2026-08-19T09:00:00.000Z"),
      plannedEffort: 4,
      completedAt: null
    });

    const service = createProjectFinanceService({ now: () => NOW });
    const common = {
      incurredAt: NOW.toISOString(),
      vendor: null,
      reference: null,
      sourceSectionId: null
    };
    await seedHistoricalProcurementExpense(
      overdueProjectId,
      10_000,
      "portfolio-procurement-entry"
    );
    await service.postEntry(superAdminActor(), overdueProjectId, {
      ...common,
      type: "direct_spend",
      expenseClass: "employee_payment",
      category: "Site team payroll",
      amountPaise: 20_000,
      description: "Employee payment",
      idempotencyKey: "portfolio-employee-entry"
    });
    await service.postEntry(superAdminActor(), overdueProjectId, {
      ...common,
      type: "direct_spend",
      expenseClass: "other",
      category: "Equipment",
      amountPaise: 5_000,
      description: "Other direct project cost",
      idempotencyKey: "portfolio-other-entry"
    });
    await service.postEntry(superAdminActor(), overdueProjectId, {
      ...common,
      type: "overhead",
      category: "Deadline supervision",
      amountPaise: 3_000,
      description: "Explicitly recorded deadline overhead",
      idempotencyKey: "portfolio-overhead-entry"
    });

    const page = await service.listProjects(superAdminActor(), {
      limit: 1,
      offset: 0
    });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);
    expect(page.summary).toEqual({
      projectCount: 2,
      approvedContractTotalPaise: 236_000_000,
      approvedGstPaise: 36_000_000,
      approvedSubtotalPaise: 200_000_000,
      targetProfitPaise: 40_000_000,
      costBudgetPaise: 160_000_000,
      procurementCostPaise: 10_000,
      employeePaymentPaise: 20_000,
      otherExpensePaise: 5_000,
      directSpendPaise: 35_000,
      overheadPaise: 3_000,
      recordedCostPaise: 38_000,
      remainingBudgetPaise: 159_962_000,
      currentProfitPaise: 199_962_000,
      currentMarginBps: 9_998,
      overBudgetProjectCount: 0,
      overdueProjectCount: 1,
      lateCompletedProjectCount: 0,
      overdueTaskCount: 1
    });
    await expect(service.getBucket(superAdminActor(), overdueProjectId))
      .resolves.toMatchObject({
        procurementCostPaise: 10_000,
        employeePaymentPaise: 20_000,
        otherExpensePaise: 5_000,
        overheadPaise: 3_000,
        deadlineAt: "2026-08-20T09:00:00.000Z",
        overdueDays: 6,
        deadlineStatus: "overdue",
        overdueTaskCount: 1
      });
    await expect(service.getBucket(superAdminActor(), pendingDesignProjectId))
      .resolves.toMatchObject({ status: "pending_design" });
  });

  it("keeps list and get snapshots coherent while expenses commit between bucket and ledger reads", async () => {
    const projectId = "finance-project-snapshot-read";
    await createProject(projectId, "Snapshot Residence");
    await mongoose.connection.transaction(async (session) => {
      await ensurePendingProjectFinanceBucket(approvedBudgetInput(projectId), session);
      await openProjectFinanceBucket({
        projectId,
        designPlanVersion: 1,
        openedById: SUPER_ADMIN_ID,
        occurredAt: NOW
      }, session);
    });

    const writer = createProjectFinanceService({ now: () => NOW });
    let concurrentWriteCompleted = false;
    const reader = createProjectFinanceService({
      now: () => NOW,
      afterSnapshotEstablished: async () => {
        if (concurrentWriteCompleted) return;
        await writer.postEntry(superAdminActor(), projectId, {
          type: "direct_spend",
          expenseClass: "other",
          category: "Snapshot material",
          amountPaise: 12_345,
          incurredAt: NOW.toISOString(),
          description: "Committed while the portfolio read is paused",
          idempotencyKey: "snapshot-consistency-entry"
        });
        concurrentWriteCompleted = true;
      }
    });

    const duringWrite = await reader.listProjects(superAdminActor(), {
      limit: 20,
      offset: 0
    });
    expect(concurrentWriteCompleted).toBe(true);
    expect(duringWrite.items[0]).toMatchObject({
      directSpendPaise: 0,
      procurementCostPaise: 0,
      otherExpensePaise: 0,
      recordedCostPaise: 0
    });
    expect(duringWrite.summary).toMatchObject({
      procurementCostPaise: 0,
      directSpendPaise: 0,
      recordedCostPaise: 0
    });

    const afterFirstCommit = await writer.getBucket(superAdminActor(), projectId);
    expect(afterFirstCommit).toMatchObject({
      procurementCostPaise: 0,
      otherExpensePaise: 12_345,
      directSpendPaise: 12_345,
      recordedCostPaise: 12_345
    });

    let secondWriteCompleted = false;
    const getReader = createProjectFinanceService({
      now: () => NOW,
      afterSnapshotEstablished: async () => {
        if (secondWriteCompleted) return;
        await writer.postEntry(superAdminActor(), projectId, {
          type: "direct_spend",
          expenseClass: "employee_payment",
          category: "Snapshot payroll",
          amountPaise: 6_789,
          incurredAt: NOW.toISOString(),
          description: "Committed while the bucket detail read is paused",
          idempotencyKey: "snapshot-get-consistency-entry"
        });
        secondWriteCompleted = true;
      }
    });
    const duringSecondWrite = await getReader.getBucket(
      superAdminActor(),
      projectId
    );
    expect(secondWriteCompleted).toBe(true);
    expect(duringSecondWrite).toMatchObject({
      procurementCostPaise: 0,
      otherExpensePaise: 12_345,
      employeePaymentPaise: 0,
      directSpendPaise: 12_345,
      recordedCostPaise: 12_345
    });
    await expect(writer.getBucket(superAdminActor(), projectId))
      .resolves.toMatchObject({
        procurementCostPaise: 0,
        otherExpensePaise: 12_345,
        employeePaymentPaise: 6_789,
        directSpendPaise: 19_134,
        recordedCostPaise: 19_134
      });
  });

  it("keeps duplicate-key replay recovery coherent while another expense commits", async () => {
    const projectId = "finance-project-replay-snapshot";
    await createProject(projectId, "Replay Snapshot Residence");
    await mongoose.connection.transaction(async (session) => {
      await ensurePendingProjectFinanceBucket(approvedBudgetInput(projectId), session);
      await openProjectFinanceBucket({
        projectId,
        designPlanVersion: 1,
        openedById: SUPER_ADMIN_ID,
        occurredAt: NOW
      }, session);
    });
    const writer = createProjectFinanceService({ now: () => NOW });
    const originalInput = {
      type: "direct_spend" as const,
      expenseClass: "other" as const,
      category: "Replay materials",
      amountPaise: 10_000,
      incurredAt: NOW.toISOString(),
      description: "Original committed request",
      idempotencyKey: "replay-snapshot-original"
    };
    const original = await writer.postEntry(
      superAdminActor(),
      projectId,
      originalInput
    );

    /*
     * Simulate the losing request having read before the winning insert. Its
     * attempted create reaches the unique index, then duplicate recovery runs.
     */
    const missingQuery = {
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null)
    };
    vi.spyOn(FinanceLedgerEntryModel, "findOne")
      .mockReturnValueOnce(missingQuery as never);
    let concurrentWriteCompleted = false;
    const recoveringService = createProjectFinanceService({
      now: () => NOW,
      afterSnapshotEstablished: async () => {
        if (concurrentWriteCompleted) return;
        await writer.postEntry(superAdminActor(), projectId, {
          type: "direct_spend",
          expenseClass: "employee_payment",
          category: "Replay payroll",
          amountPaise: 5_000,
          incurredAt: NOW.toISOString(),
          description: "Committed while replay recovery is paused",
          idempotencyKey: "replay-snapshot-concurrent"
        });
        concurrentWriteCompleted = true;
      }
    });

    const replay = await recoveringService.postEntry(
      superAdminActor(),
      projectId,
      originalInput
    );
    expect(concurrentWriteCompleted).toBe(true);
    expect(replay).toMatchObject({
      replayed: true,
      entry: { id: original.entry.id },
      bucket: {
        procurementCostPaise: 0,
        otherExpensePaise: 10_000,
        employeePaymentPaise: 0,
        directSpendPaise: 10_000,
        recordedCostPaise: 10_000
      }
    });
    await expect(writer.getBucket(superAdminActor(), projectId))
      .resolves.toMatchObject({
        procurementCostPaise: 0,
        otherExpensePaise: 10_000,
        employeePaymentPaise: 5_000,
        directSpendPaise: 15_000,
        recordedCostPaise: 15_000
      });
  });

  it("never infers completion lateness from now when actual completion is missing", async () => {
    const unknownProjectId = "finance-completed-date-unknown";
    const lateProjectId = "finance-completed-late";
    await Promise.all([
      createProject(unknownProjectId, "Unknown Completion", {
        status: "completed",
        plannedEndAt: new Date("2026-08-20T09:00:00.000Z"),
        actualEndAt: null
      }),
      createProject(lateProjectId, "Late Completion", {
        status: "completed",
        plannedEndAt: new Date("2026-08-20T09:00:00.000Z"),
        actualEndAt: new Date("2026-08-22T09:00:00.000Z")
      })
    ]);
    await mongoose.connection.transaction(async (session) => {
      await ensurePendingProjectFinanceBucket(
        approvedBudgetInput(unknownProjectId),
        session
      );
      await ensurePendingProjectFinanceBucket(
        approvedBudgetInput(lateProjectId),
        session
      );
    });

    const service = createProjectFinanceService({ now: () => NOW });
    await expect(service.getBucket(superAdminActor(), unknownProjectId))
      .resolves.toMatchObject({
        deadlineStatus: "completed_date_unknown",
        overdueDays: 0
      });
    await expect(service.getBucket(superAdminActor(), lateProjectId))
      .resolves.toMatchObject({
        deadlineStatus: "completed_late",
        overdueDays: 2
      });
    await expect(service.listProjects(superAdminActor(), {
      limit: 20,
      offset: 0
    })).resolves.toMatchObject({
      summary: {
        projectCount: 2,
        overdueProjectCount: 0,
        lateCompletedProjectCount: 1
      }
    });
  });

  it("opens Finance Manager access from the role-wide Finance workflow task while Super Admin remains global", async () => {
    const assignedProjectId = "finance-project-with-task";
    const foreignProjectId = "finance-project-foreign";
    await Promise.all([
      createProject(assignedProjectId, "Assigned Project"),
      createProject(foreignProjectId, "Foreign Project")
    ]);
    await mongoose.connection.transaction(async (session) => {
      for (const projectId of [assignedProjectId, foreignProjectId]) {
        await ensurePendingProjectFinanceBucket(approvedBudgetInput(projectId), session);
        await openProjectFinanceBucket({
          projectId,
          designPlanVersion: 1,
          openedById: SUPER_ADMIN_ID,
          occurredAt: NOW
        }, session);
      }
    });
    await createFinanceWorkflowTask(assignedProjectId);

    const service = createProjectFinanceService({ now: () => NOW });
    const financeActor = {
      id: FINANCE_MANAGER_ID,
      name: "Finance Manager",
      email: "finance-manager@example.test",
      role: "finance_head" as const
    };
    expect(await service.listProjects(financeActor, {
      limit: 20,
      offset: 0
    })).toMatchObject({
      total: 1,
      items: [{ projectId: assignedProjectId }]
    });
    await expect(service.getBucket(financeActor, assignedProjectId)).resolves.toMatchObject({
      projectId: assignedProjectId,
      status: "open"
    });
    await expect(service.postEntry(financeActor, assignedProjectId, {
      type: "direct_spend",
      expenseClass: "employee_payment",
      category: "Materials",
      amountPaise: 10_000,
      incurredAt: NOW.toISOString(),
      description: "Finance queue project spend",
      idempotencyKey: "finance-task-project-request"
    })).resolves.toMatchObject({
      replayed: false,
      entry: { createdById: FINANCE_MANAGER_ID, amountPaise: 10_000 }
    });
    await expect(service.getBucket(financeActor, foreignProjectId)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND"
    });
    await expect(service.postEntry(financeActor, foreignProjectId, {
      type: "direct_spend",
      expenseClass: "other",
      category: "Materials",
      amountPaise: 10_000,
      incurredAt: NOW.toISOString(),
      description: "Must remain hidden",
      idempotencyKey: "finance-foreign-request"
    })).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });

    expect((await service.listProjects(superAdminActor(), {
      limit: 20,
      offset: 0
    })).total).toBe(2);
    await expect(service.getBucket({
      id: "finance-admin",
      name: "Admin",
      email: "finance-admin@example.test",
      role: "admin"
    }, assignedProjectId)).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN"
    });
  });
});

function approvedBudgetInput(projectId: string) {
  return {
    projectId,
    estimateId: `estimate-${projectId}`,
    estimateVersion: 3,
    estimateReviewRoundId: null,
    approvedSubtotalRupees: 1_000_000,
    approvedGstRupees: 180_000,
    approvedContractTotalRupees: 1_180_000,
    createdById: SUPER_ADMIN_ID,
    occurredAt: NOW
  };
}

function superAdminActor() {
  return {
    id: SUPER_ADMIN_ID,
    name: "Super Admin",
    email: "finance-super-admin@example.test",
    role: "super_admin" as const
  };
}

async function createUser(id: string, role: "super_admin" | "finance_head" | "admin") {
  await UserModel.create({
    _id: id,
    name: id,
    email: `${id}@example.test`,
    emailNormalized: `${id}@example.test`,
    passwordHash: "$2b$10$7EqJtq98hPqEX7fNZaFWoOhqP8D5iEyOH6v9mJEkjEBlrptHw28.O",
    role,
    active: true,
    accountKind: "standard",
    version: 1,
    managerId: null,
    authorizedClientIds: []
  });
}

async function createProject(
  id: string,
  name: string,
  input: {
    plannedEndAt?: Date;
    status?: "active" | "completed";
    actualEndAt?: Date | null;
    financeLink?: "direct" | "lead";
    approvedMoney?: {
      subtotalRupees: number;
      gstRupees: number;
      totalRupees: number;
    };
  } = {}
) {
  await ProjectModel.create({
    _id: id,
    name,
    clientId: null,
    clientName: "Client",
    clientEmail: `${id}@client.example.test`,
    clientEmailNormalized: `${id}@client.example.test`,
    clientMobile: "9000000000",
    clientAddress: "Bengaluru",
    initiatingDesignerId: null,
    assignedEstimatorId: null,
    assignedDesignerIds: [],
    managerId: null,
    status: input.status ?? "active",
    location: "Bengaluru",
    plannedStartAt: NOW,
    plannedEndAt: input.plannedEndAt ?? new Date("2026-11-26T09:00:00.000Z"),
    actualStartAt: NOW,
    actualEndAt: input.actualEndAt ?? null
  });
  const leadId = `lead-${id}`;
  if (input.financeLink === "lead") {
    await LeadModel.create({
      _id: leadId,
      projectId: id,
      ownerId: SUPER_ADMIN_ID,
      clientName: "Client",
      clientEmail: `${id}@client.example.test`,
      clientMobile: "9000000000",
      projectName: name,
      location: "Bengaluru",
      propertyType: "villa",
      budgetMin: null,
      budgetMax: null,
      source: "legacy",
      stage: "won",
      nextAction: "Design",
      nextActionAt: NOW,
      builder: null,
      areaSqft: null,
      targetHandoverAt: null,
      notes: null,
      latestActivityAt: null
    });
  }
  const money = input.approvedMoney ?? {
    subtotalRupees: 1_000_000,
    gstRupees: 180_000,
    totalRupees: 1_180_000
  };
  await EstimateModel.create({
    _id: `estimate-${id}`,
    leadId,
    ownerId: SUPER_ADMIN_ID,
    version: 4,
    status: "client_approved",
    propertyType: "villa",
    rooms: [],
    scopes: [],
    lineItems: [],
    subtotal: money.subtotalRupees,
    gst: money.gstRupees,
    total: money.totalRupees,
    approvalRequired: false,
    projectId: input.financeLink === "lead" ? null : id,
    reviews: [{
      actorId: SUPER_ADMIN_ID,
      action: "client_approved",
      note: "Approved",
      occurredAt: NOW
    }],
    designPlanStatus: "pending_assignment",
    designPlanVersion: 0,
    clientDecisionAt: NOW
  });
}

async function seedHistoricalProcurementExpense(
  projectId: string,
  amountPaise: number,
  idempotencyKey: string
) {
  const bucket = await ProjectFinanceBucketModel.findOne({ projectId }).lean();
  if (!bucket) throw new Error("Historical Procurement fixture needs a bucket.");
  await FinanceLedgerEntryModel.create({
    _id: `finance-entry-${idempotencyKey}`,
    bucketId: String(bucket._id),
    projectId,
    type: "direct_spend",
    expenseClass: "procurement",
    category: "Materials",
    amountPaise,
    incurredAt: NOW,
    description: "Historical receipt-backed Procurement expense",
    vendor: null,
    reference: null,
    sourceSectionId: "CA",
    sourceLineItemKey: `legacy-estimate-line:estimate-${projectId}:3:0`,
    idempotencyKey,
    status: "posted",
    version: 1,
    createdById: SUPER_ADMIN_ID,
    voidedAt: null,
    voidedById: null,
    voidReason: null,
    createdAt: NOW,
    updatedAt: NOW
  });
  await ProjectFinanceBucketModel.updateOne(
    { _id: bucket._id, projectId },
    {
      $inc: { directSpendPaise: amountPaise, version: 1 },
      $set: { updatedAt: NOW }
    },
    { timestamps: false }
  );
}

async function createFinanceWorkflowTask(projectId: string) {
  await ProjectWorkflowTaskModel.create({
    _id: `finance-task-${projectId}`,
    dedupeKey: `estimate-${projectId}:finance`,
    projectId,
    estimateId: `estimate-${projectId}`,
    designPlanVersion: 1,
    kind: "finance",
    title: "Open approved project budget",
    description: "Review the approved estimate and establish financial controls.",
    assigneeRole: "finance_head",
    assigneeUserId: null,
    sourceSectionId: null,
    sourceLineItemKey: null,
    roomName: null,
    status: "open",
    progress: 0,
    version: 1,
    openedAt: NOW,
    dueAt: new Date("2026-08-29T09:00:00.000Z"),
    plannedEffort: 4,
    completedAt: null
  });
}
