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
  it("lists only existing project budgets when stale approvals and Finance Head tasks reference a deleted project", async () => {
    await createProject("existing-alpha", "Alpha budget", { clientId: "existing-client", clientName: "Existing Client" });
    await createProject("existing-beta", "Beta budget", { approvedMoney: {
      subtotalRupees: 500_000, gstRupees: 90_000, totalRupees: 590_000
    } });
    await createProject("deleted-project", "Deleted budget", { financeLink: "lead", clientId: "deleted-client", clientName: "Deleted Client" });
    await createFinanceWorkflowTask("existing-alpha");
    await createFinanceWorkflowTask("deleted-project");
    await ProjectModel.deleteOne({ _id: "deleted-project" });
    await mongoose.connection.transaction(session => ensurePendingProjectFinanceBucket(approvedBudgetInput("existing-alpha"), session));
    await seedHistoricalProcurementExpense("existing-alpha", 1_000, "existing-alpha-spend");

    const service = createProjectFinanceService({ now: () => NOW });
    const first = await service.listProjects(superAdminActor(), { limit: 1, offset: 0 });
    const second = await service.listProjects(superAdminActor(), { limit: 1, offset: 1 });
    expect(first.total).toBe(2);
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(first.summary).toEqual(second.summary);
    expect(first.summary).toMatchObject({ projectCount: 2, approvedSubtotalPaise: 150_000_000,
      approvedGstPaise: 27_000_000, approvedContractTotalPaise: 177_000_000, targetProfitPaise: 30_000_000,
      costBudgetPaise: 120_000_000, recordedCostPaise: 1_000, remainingBudgetPaise: 119_999_000 });
    expect(first.filterOptions).toEqual({ projects: [
      { id: "existing-alpha", name: "Alpha budget" }, { id: "existing-beta", name: "Beta budget" }
    ], clients: [{ id: "existing-client", name: "Existing Client" }], hasUnlinkedClients: true });
    expect(second.filterOptions).toEqual(first.filterOptions);
    const items = [...first.items, ...second.items];
    expect(items.map(item => item.projectId).sort()).toEqual(["existing-alpha", "existing-beta"]);
    for (const item of items) expect(await service.getBucket(superAdminActor(), item.projectId)).toEqual(item);

    const financeActor = { id: FINANCE_MANAGER_ID, role: "finance_head" as const, name: "Finance", email: "finance-manager@example.test" };
    const scoped = await service.listProjects(financeActor, { limit: 10, offset: 0 });
    expect(scoped.items).toEqual([items.find(item => item.projectId === "existing-alpha")]);
    expect(scoped.summary).toMatchObject({ projectCount: 1, approvedSubtotalPaise: 100_000_000, recordedCostPaise: 1_000 });
    expect(scoped.filterOptions).toEqual({ projects: [{ id: "existing-alpha", name: "Alpha budget" }],
      clients: [{ id: "existing-client", name: "Existing Client" }], hasUnlinkedClients: false });
    expect(await service.listProjects(financeActor, { limit: 10, offset: 0, projectId: "deleted-project" })).toMatchObject({ total: 0, items: [], summary: { projectCount: 0 } });
    expect(await EstimateModel.countDocuments({ _id: "estimate-deleted-project" })).toBe(1);
  });

  it("still rejects inconsistent approval evidence on an existing project even when a different project is selected", async () => {
    await createProject("valid-budget", "Valid budget");
    await createProject("invalid-budget", "Invalid budget");
    await EstimateModel.updateOne({ _id: "estimate-invalid-budget" }, { $set: { reviews: [] } });
    const service = createProjectFinanceService({ now: () => NOW });
    await expect(service.listProjects(superAdminActor(), { limit: 10, offset: 0, projectId: "valid-budget" }))
      .rejects.toMatchObject({ status: 409, code: "FINANCE_APPROVAL_SOURCE_CONFLICT" });
  });

  it("filters unequal budgets before summary and pagination, retaining scoped client and project choices", async () => {
    const service = createProjectFinanceService({ now: () => NOW });
    const rows = [
      { id: "budget-alpha", name: "Aurora Residence", clientId: "client-a", subtotal: 2_500_000, gst: 450_000,
        approvedAt: new Date("2026-08-24T00:00:00.000Z"), direct: 160_000_000, overhead: 20_000_000 },
      { id: "budget-beta", name: "Birch Residence", clientId: "client-b", subtotal: 4_500_000, gst: 810_000,
        approvedAt: new Date("2026-08-24T23:59:59.999Z"), direct: 340_000_000, overhead: 30_000_000 }
    ];
    for (const row of rows) {
      await createProject(row.id, row.name, { clientId: row.clientId, clientName: "Same Client", approvedAt: row.approvedAt,
        approvedMoney: { subtotalRupees: row.subtotal, gstRupees: row.gst, totalRupees: row.subtotal + row.gst } });
      await mongoose.connection.transaction(async session => {
        await ensurePendingProjectFinanceBucket({ ...approvedBudgetInput(row.id), approvedSubtotalRupees: row.subtotal,
          approvedGstRupees: row.gst, approvedContractTotalRupees: row.subtotal + row.gst,
          occurredAt: NOW }, session);
        await openProjectFinanceBucket({ projectId: row.id, designPlanVersion: 1, openedById: SUPER_ADMIN_ID, occurredAt: NOW }, session);
      });
      await seedHistoricalProcurementExpense(row.id, row.direct, `${row.id}-direct`);
      await service.postEntry(superAdminActor(), row.id, { type: "overhead", category: "Site overhead", amountPaise: row.overhead,
        incurredAt: NOW.toISOString(), description: "Recorded overhead included in spending", idempotencyKey: `${row.id}-overhead` });
    }
    await createProject("budget-unlinked", "Cedar Residence", { approvedAt: new Date("2026-08-25T00:00:00.000Z") });
    const query = { limit: 1, offset: 0, search: "rEsIdEnCe", approvedFrom: "2026-08-24", approvedTo: "2026-08-24", financeStage: "open" as const, projectStatus: "active" as const };
    const first = await service.listProjects(superAdminActor(), query);
    const second = await service.listProjects(superAdminActor(), { ...query, offset: 1 });
    expect(first.total).toBe(2);
    expect(first.items).toHaveLength(1);
    expect(second.items[0]!.projectId).not.toBe(first.items[0]!.projectId);
    expect(first.summary).toEqual(second.summary);
    expect(first.summary).toMatchObject({ projectCount: 2, approvedSubtotalPaise: 700_000_000, approvedGstPaise: 126_000_000,
      approvedContractTotalPaise: 826_000_000, targetProfitPaise: 140_000_000, costBudgetPaise: 560_000_000,
      directSpendPaise: 500_000_000, overheadPaise: 50_000_000, recordedCostPaise: 550_000_000, remainingBudgetPaise: 10_000_000 });
    expect(first.observedAt).toBe(NOW.toISOString());
    expect(first.filterOptions).toEqual({ projects: [
      { id: "budget-alpha", name: "Aurora Residence" }, { id: "budget-beta", name: "Birch Residence" }, { id: "budget-unlinked", name: "Cedar Residence" }
    ], clients: [{ id: "client-a", name: "Same Client" }, { id: "client-b", name: "Same Client" }], hasUnlinkedClients: true });
    for (const row of rows) {
      const detail = await service.getBucket(superAdminActor(), row.id);
      expect(detail.budgetApprovedAt).toBe(row.approvedAt.toISOString());
      expect(detail.createdAt).not.toBe(detail.budgetApprovedAt);
      expect(detail).toEqual([...first.items, ...second.items].find(item => item.projectId === row.id));
      const filtered = await service.listProjects(superAdminActor(), { ...query, clientId: row.clientId });
      expect(filtered.items.map(item => item.projectId)).toEqual([row.id]);
      expect(filtered.summary.recordedCostPaise).toBe(detail.recordedCostPaise);
      expect(filtered.filterOptions).toEqual(first.filterOptions);
    }
    const atRisk = await service.listProjects(superAdminActor(), { ...query, budgetStatus: "at_risk" });
    expect(atRisk.items[0]).toMatchObject({ projectId: "budget-alpha", budgetStatus: "at_risk", budgetUtilizationBps: 9_000 });
    const overBudget = await service.listProjects(superAdminActor(), { ...query, budgetStatus: "over_budget" });
    expect(overBudget.items[0]).toMatchObject({ projectId: "budget-beta", budgetStatus: "over_budget", budgetUtilizationBps: 10_278, remainingBudgetPaise: -10_000_000 });
    const unlinked = await service.listProjects(superAdminActor(), { limit: 10, offset: 0, unlinkedClient: true });
    expect(unlinked.items.map(item => item.projectId)).toEqual(["budget-unlinked"]);
    const empty = await service.listProjects(superAdminActor(), { ...query, projectId: "budget-unlinked" });
    expect(empty).toMatchObject({ total: 0, items: [], summary: { projectCount: 0, recordedCostPaise: 0, costBudgetPaise: 0 } });
    expect(empty.filterOptions).toEqual(first.filterOptions);
    expect((await service.listProjects(superAdminActor(), { ...query, offset: 10 })).summary).toEqual(first.summary);
  });

  it("uses per-project reserve rounding and distinguishes zero budgets from completed high utilization", async () => {
    for (const [id, subtotalPaise, gstPaise] of [["rounding-a", 103, 19], ["rounding-b", 108, 19], ["zero-budget", 0, 0]] as const) {
      await createProject(id, id);
      await EstimateClientReviewRoundModel.collection.insertOne({ _id: `round-${id}`, estimateId: `estimate-${id}`,
        dedupeKey: `finance-rounding-${id}`, sendGeneration: 1,
        projectId: id, estimateVersion: 3, status: "approved", decision: "approve", decisionSource: "client_portal",
        decidedById: "synthetic-client", decidedAt: NOW, estimateSnapshot: {
          subtotal: subtotalPaise / 100, gst: gstPaise / 100, total: (subtotalPaise + gstPaise) / 100,
          subtotalPaise, gstPaise, totalPaise: subtotalPaise + gstPaise, lineItems: []
        }
      } as never);
    }
    const service = createProjectFinanceService({ now: () => NOW });
    const rounded = await service.listProjects(superAdminActor(), { limit: 1, offset: 0, search: "rounding" });
    expect(rounded.summary).toMatchObject({ projectCount: 2, approvedSubtotalPaise: 211, approvedGstPaise: 38,
      targetProfitPaise: 43, costBudgetPaise: 168 });
    const zero = await service.listProjects(superAdminActor(), { limit: 10, offset: 0, budgetStatus: "no_budget" });
    expect(zero.items).toEqual([expect.objectContaining({ projectId: "zero-budget", budgetStatus: "no_budget", budgetUtilizationBps: null })]);
    await createProject("completed-high-use", "Completed project", { status: "completed", actualEndAt: NOW });
    await mongoose.connection.transaction(session => ensurePendingProjectFinanceBucket(approvedBudgetInput("completed-high-use"), session));
    await seedHistoricalProcurementExpense("completed-high-use", 72_000_000, "completed-cost");
    expect(await service.getBucket(superAdminActor(), "completed-high-use")).toMatchObject({ budgetStatus: "within_budget", budgetUtilizationBps: 9_000 });
    await seedHistoricalProcurementExpense("completed-high-use", 9_000_000, "completed-extra-cost");
    expect(await service.getBucket(superAdminActor(), "completed-high-use")).toMatchObject({ budgetStatus: "over_budget", budgetUtilizationBps: 10_125 });
  });

  it("does not expose unassigned projects or client choices through Finance Head filters", async () => {
    await createProject("assigned-budget", "Assigned", { clientId: "client-authorized", clientName: "Visible client" });
    await createProject("foreign-budget", "Foreign", { clientId: "client-foreign", clientName: "Hidden client" });
    const service = createProjectFinanceService({ now: () => NOW });
    const actor = { id: FINANCE_MANAGER_ID, role: "finance_head" as const, name: "Finance", email: "finance-manager@example.test" };
    expect(await service.listProjects(actor, { limit: 10, offset: 0 })).toMatchObject({ total: 0,
      filterOptions: { projects: [], clients: [], hasUnlinkedClients: false }, observedAt: NOW.toISOString() });
    await createFinanceWorkflowTask("assigned-budget");
    const visible = await service.listProjects(actor, { limit: 10, offset: 0 });
    expect(visible.filterOptions).toEqual({ projects: [{ id: "assigned-budget", name: "Assigned" }],
      clients: [{ id: "client-authorized", name: "Visible client" }], hasUnlinkedClients: false });
    const hidden = await service.listProjects(actor, { limit: 10, offset: 0, projectId: "foreign-budget", clientId: "client-foreign" });
    expect(hidden).toMatchObject({ total: 0, items: [], summary: { projectCount: 0 }, filterOptions: visible.filterOptions });
  });

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
      createProject(pendingDesignProjectId, "Pending Design Residence", {
        approvedMoney: { subtotalRupees: 500_000, gstRupees: 90_000, totalRupees: 590_000 }
      })
    ]);
    await mongoose.connection.transaction(async (session) => {
      await ensurePendingProjectFinanceBucket(
        approvedBudgetInput(overdueProjectId),
        session
      );
      await ensurePendingProjectFinanceBucket(
        { ...approvedBudgetInput(pendingDesignProjectId), approvedSubtotalRupees: 500_000,
          approvedGstRupees: 90_000, approvedContractTotalRupees: 590_000 },
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
    await seedHistoricalProcurementExpense(
      pendingDesignProjectId,
      21_000,
      "portfolio-second-procurement-entry"
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
      approvedContractTotalPaise: 177_000_000,
      approvedGstPaise: 27_000_000,
      approvedSubtotalPaise: 150_000_000,
      targetProfitPaise: 30_000_000,
      costBudgetPaise: 120_000_000,
      procurementCostPaise: 31_000,
      employeePaymentPaise: 20_000,
      otherExpensePaise: 5_000,
      directSpendPaise: 56_000,
      overheadPaise: 3_000,
      recordedCostPaise: 59_000,
      remainingBudgetPaise: 119_941_000,
      currentProfitPaise: 149_941_000,
      currentMarginBps: 9_996,
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
      .resolves.toMatchObject({ approvedSubtotalPaise: 50_000_000,
        procurementCostPaise: 21_000, recordedCostPaise: 21_000 });
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
    clientId?: string;
    clientName?: string;
    approvedAt?: Date;
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
    clientId: input.clientId ?? null,
    clientName: input.clientName ?? "Client",
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
      occurredAt: input.approvedAt ?? NOW
    }],
    designPlanStatus: "pending_assignment",
    designPlanVersion: 0,
    clientDecisionAt: input.approvedAt ?? NOW
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
