import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EstimateModel } from "../src/models/Estimate.js";
import { FinanceLedgerEntryModel } from "../src/models/FinanceLedgerEntry.js";
import { ProjectFinanceBucketModel } from "../src/models/ProjectFinanceBucket.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { UserModel } from "../src/models/User.js";
import { createProjectFinanceService, ensurePendingProjectFinanceBucket, openProjectFinanceBucket, readProjectFinancePortfolioReport } from "../src/services/project-finance.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-11-16T09:00:00Z");
const actor = { id: "commitment-super-admin", role: "super_admin" as const, name: "Synthetic Admin", email: "admin@example.test" };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { replica = await startMongoReplicaSet("finance-commitment-tests"); }, 120_000);
beforeEach(async () => {
  await replica.clear();
  await UserModel.collection.insertOne({ _id: actor.id, role: actor.role, active: true } as never);
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await replica?.stop(); });

async function project(id: string, subtotalPaise = 9_000, materialized = false) {
  const gstPaise = 0;
  await ProjectModel.collection.insertOne({ _id: id, name: "Synthetic project", status: "active", plannedEndAt: new Date("2026-12-30T00:00:00Z") } as never);
  await EstimateModel.collection.insertOne({ _id: `estimate-${id}`, leadId: `lead-${id}`, projectId: id, version: 1,
    status: "client_approved", subtotal: subtotalPaise / 100, gst: 0, total: subtotalPaise / 100,
    subtotalPaise, gstPaise, totalPaise: subtotalPaise, lineItems: [], propertyType: "villa", rooms: [], scopes: [],
    reviews: [{ actorId: actor.id, action: "client_approved", occurredAt: NOW }],
    designPlanStatus: "pending_assignment", designPlanVersion: 0, clientDecisionAt: NOW, createdAt: NOW, updatedAt: NOW } as never);
  if (materialized) await mongoose.connection.transaction(session => ensurePendingProjectFinanceBucket({ projectId: id,
    estimateId: `estimate-${id}`, estimateVersion: 1, estimateReviewRoundId: null,
    approvedSubtotalRupees: subtotalPaise / 100, approvedGstRupees: 0, approvedContractTotalRupees: subtotalPaise / 100,
    approvedSubtotalPaise: subtotalPaise, approvedGstPaise: 0, approvedContractTotalPaise: subtotalPaise,
    createdById: actor.id, occurredAt: NOW }, session));
}

async function order(projectId: string, id = "order-one", netPaise = 5_000, overrides: Record<string, unknown> = {}) {
  const revisionId = `revision-${id}`;
  const source = { projectId, vendorId: `vendor-${id}`, estimateId: `estimate-${projectId}`, estimateVersion: 1, estimateReviewRoundId: null, tenderAwardId: `award-${id}` };
  await ProjectPurchaseOrderRevisionModel.collection.insertOne({ _id: revisionId, orderId: id, ...source, revision: 1,
    netPaise, gstPaise: netPaise / 2, totalPaise: netPaise * 1.5,
    lines: [{ id: `line-${id}`, netPaise, gstPaise: netPaise / 2, totalPaise: netPaise * 1.5 }] } as never);
  await ProjectPurchaseOrderModel.collection.insertOne({ _id: id, ...source, status: "approved", approvedRevisionId: revisionId,
    approvedRevision: 1, approvedNetPaise: netPaise, approvedGstPaise: netPaise / 2, approvedTotalPaise: netPaise * 1.5,
    cancelledAt: null, ...overrides } as never);
}

async function recordedExpense(projectId: string, amountPaise: number, overrides: Record<string, unknown> = {}, session?: mongoose.ClientSession) {
  const bucket = await ProjectFinanceBucketModel.findOne({ projectId }).session(session ?? null).lean();
  if (!bucket) throw new Error("Expense fixture requires a materialized finance bucket.");
  const entry = { _id: `expense-${projectId}`, bucketId: bucket._id, projectId, type: "direct_spend", expenseClass: "procurement",
    status: "posted", amountPaise, purchaseOrderId: "order-one", paymentMilestoneId: "milestone-one", ...overrides };
  await FinanceLedgerEntryModel.collection.insertOne(entry as never, { session });
  if (entry.status === "posted") await ProjectFinanceBucketModel.collection.updateOne({ _id: bucket._id },
    { $inc: { [entry.type === "overhead" ? "overheadPaise" : "directSpendPaise"]: amountPaise, version: 1 } }, { session });
}

describe("finance approved vendor commitments", () => {
  it("deducts the approved vendor commitment before an expense is recorded", async () => {
    await project("project-one");
    await order("project-one");
    const service = createProjectFinanceService({ now: () => NOW });
    const bucket = await service.getBucket(actor, "project-one");
    expect(bucket).toMatchObject({ approvedSubtotalPaise: 9_000, targetProfitPaise: 1_800, costBudgetPaise: 7_200,
      recordedCostPaise: 0, remainingBudgetPaise: 7_200,
      commitmentBudget: { status: "ready", reasonCodes: [], approvedVendorNetPaise: 5_000,
        outstandingVendorCommitmentPaise: 5_000, budgetUsedPaise: 5_000, availableBudgetPaise: 2_200,
        utilizationBps: 6_944, budgetStatus: "within_budget", overBudget: false } });
    expect(await ProjectFinanceBucketModel.countDocuments()).toBe(0);
    expect(await FinanceLedgerEntryModel.countDocuments()).toBe(0);
  });

  it("reconciles two unequal projects across detail, paginated list and matching portfolio", async () => {
    await project("project-one", 9_000, true);
    await project("project-two", 20_000, true);
    await order("project-one");
    await order("project-two", "order-two", 15_000);
    await recordedExpense("project-one", 3_000);
    await recordedExpense("project-two", 4_000, { purchaseOrderId: "order-two" });
    const service = createProjectFinanceService({ now: () => NOW });
    const result = await service.listProjects(actor, { limit: 1, offset: 0, budgetBasis: "including_commitments" });
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.summary).toMatchObject({ approvedSubtotalPaise: 29_000, costBudgetPaise: 23_200, recordedCostPaise: 7_000,
      remainingBudgetPaise: 16_200, commitmentBudget: { status: "ready", approvedVendorNetPaise: 20_000,
        outstandingVendorCommitmentPaise: 13_000, budgetUsedPaise: 20_000, availableBudgetPaise: 3_200,
        unresolvedProjectCount: 0, overBudgetProjectCount: 0 } });
    const pageTwo = await service.listProjects(actor, { limit: 1, offset: 1, budgetBasis: "including_commitments" });
    expect(pageTwo.summary).toEqual(result.summary);
    for (const item of [...result.items, ...pageTwo.items]) expect(await service.getBucket(actor, item.projectId)).toEqual(item);
    const filtered = await service.listProjects(actor, { limit: 20, offset: 0, budgetBasis: "including_commitments", budgetStatus: "at_risk" });
    expect(filtered.items.map(item => item.projectId)).toEqual(["project-two"]);
    expect(filtered.summary).toMatchObject({ projectCount: 1, costBudgetPaise: 16_000,
      commitmentBudget: { approvedVendorNetPaise: 15_000, budgetUsedPaise: 15_000, availableBudgetPaise: 1_000 } });
    for (const basis of [undefined, "recorded"] as const) {
      const legacy = await service.listProjects(actor, { limit: 20, offset: 0, budgetBasis: basis, budgetStatus: "within_budget" });
      expect(legacy.total).toBe(2);
    }
  });

  it("batches queries only for the Finance Head's authorized projects and does not disclose another project's commitment", async () => {
    await project("project-one");
    await project("project-two", 50_000);
    await order("project-one");
    await order("project-two", "order-two", 40_000);
    const finance = { ...actor, id: "scoped-finance", role: "finance_head" as const };
    await UserModel.collection.insertOne({ _id: finance.id, role: finance.role, active: true } as never);
    await ProjectWorkflowTaskModel.collection.insertOne({ _id: "finance-task-one", projectId: "project-one", kind: "finance",
      assigneeRole: "finance_head", status: "completed" } as never);
    const orders = vi.spyOn(ProjectPurchaseOrderModel, "find");
    const revisions = vi.spyOn(ProjectPurchaseOrderRevisionModel, "find");
    const service = createProjectFinanceService({ now: () => NOW });
    const result = await service.listProjects(finance, { limit: 20, offset: 0 });
    expect(result.items.map(item => item.projectId)).toEqual(["project-one"]);
    expect(result.summary.commitmentBudget).toMatchObject({ approvedVendorNetPaise: 5_000, budgetUsedPaise: 5_000 });
    expect(orders).toHaveBeenCalledExactlyOnceWith({ projectId: { $in: ["project-one"] } });
    expect(revisions).toHaveBeenCalledExactlyOnceWith({ projectId: { $in: ["project-one"] }, _id: { $in: ["revision-order-one"] } });
    await expect(service.getBucket(finance, "project-two")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(orders).toHaveBeenCalledTimes(1);
    const foreignFilter = await service.listProjects(finance, { limit: 20, offset: 0, projectId: "project-two" });
    expect(foreignFilter).toMatchObject({ total: 0, items: [], summary: { commitmentBudget: { status: "ready", approvedVendorNetPaise: 0,
      outstandingVendorCommitmentPaise: 0, budgetUsedPaise: 0, availableBudgetPaise: 0, unresolvedProjectCount: 0, overBudgetProjectCount: 0 } } });
    expect(foreignFilter.filterOptions.projects.map(item => item.id)).toEqual(["project-one"]);
  });

  it("keeps pending amendments and historical estimate lineage on the previous immutable approved amounts", async () => {
    await project("project-one");
    await EstimateModel.collection.updateOne({ _id: "estimate-project-one" }, { $set: { version: 7 } });
    await order("project-one", "order-one", 5_000, { status: "pending_approval", submittedRevisionId: "pending-revision",
      estimateVersion: 6, draftNetPaise: 8_000 });
    await ProjectPurchaseOrderRevisionModel.collection.insertOne({ _id: "pending-revision", projectId: "project-one",
      orderId: "order-one", revision: 2, netPaise: 8_000 } as never);
    const result = await createProjectFinanceService({ now: () => NOW }).getBucket(actor, "project-one");
    expect(result).toMatchObject({ estimateVersion: 6, commitmentBudget: { status: "ready", approvedVendorNetPaise: 5_000,
      budgetUsedPaise: 5_000, availableBudgetPaise: 2_200 } });
  });

  it("excludes voided entries, cancelled and unapproved orders while preserving per-order excess spending", async () => {
    await project("project-one", 20_000, true);
    await order("project-one");
    await order("project-one", "second-order", 2_000);
    await order("project-one", "cancelled-order", 100_000, { status: "cancelled", cancelledAt: NOW });
    await ProjectPurchaseOrderModel.collection.insertOne({ _id: "unapproved-order", projectId: "project-one", status: "pending_approval",
      draftNetPaise: 200_000 } as never);
    await recordedExpense("project-one", 6_500);
    await recordedExpense("project-one", 20_000, { _id: "voided-expense", purchaseOrderId: "second-order", status: "voided" });
    const result = await createProjectFinanceService({ now: () => NOW }).getBucket(actor, "project-one");
    expect(result).toMatchObject({ procurementCostPaise: 6_500, recordedCostPaise: 6_500,
      commitmentBudget: { status: "ready", approvedVendorNetPaise: 7_000, outstandingVendorCommitmentPaise: 2_000,
        budgetUsedPaise: 8_500, availableBudgetPaise: 7_500 } });
  });

  it("exposes unresolved historical links and null combined portfolio totals without hiding known recorded costs", async () => {
    await project("project-one", 9_000, true);
    await project("project-two", 20_000);
    await order("project-one");
    await order("project-two", "order-two", 10_000);
    await recordedExpense("project-one", 2_000, { purchaseOrderId: null, paymentMilestoneId: null });
    const service = createProjectFinanceService({ now: () => NOW });
    const result = await service.listProjects(actor, { limit: 20, offset: 0, budgetBasis: "including_commitments" });
    expect(result.total).toBe(2);
    expect(result.items.find(item => item.projectId === "project-one")).toMatchObject({ recordedCostPaise: 2_000,
      commitmentBudget: { status: "needs_reconciliation", reasonCodes: ["unlinked_procurement_expense"], approvedVendorNetPaise: 5_000,
        outstandingVendorCommitmentPaise: null, budgetUsedPaise: null, availableBudgetPaise: null, budgetStatus: null, utilizationBps: null } });
    expect(result.summary).toMatchObject({ recordedCostPaise: 2_000, commitmentBudget: { status: "needs_reconciliation",
      approvedVendorNetPaise: 15_000, outstandingVendorCommitmentPaise: null, budgetUsedPaise: null, availableBudgetPaise: null,
      unresolvedProjectCount: 1, overBudgetProjectCount: null } });
    const filtered = await service.listProjects(actor, { limit: 20, offset: 0, budgetBasis: "including_commitments", budgetStatus: "within_budget" });
    expect(filtered.items.map(item => item.projectId)).toEqual(["project-two"]);
    expect(filtered.summary.commitmentBudget).toMatchObject({ status: "ready", budgetUsedPaise: 10_000, unresolvedProjectCount: 0 });
  });

  it.each(["missing_revision", "mismatched_header", "foreign_revision", "duplicate_award"])("fails closed for invalid approved source %s", async scenario => {
    await project("project-one");
    await order("project-one");
    if (scenario === "missing_revision") await ProjectPurchaseOrderRevisionModel.collection.deleteOne({ _id: "revision-order-one" });
    if (scenario === "mismatched_header") await ProjectPurchaseOrderModel.collection.updateOne({ _id: "order-one" }, { $set: { approvedNetPaise: 6_000 } });
    if (scenario === "foreign_revision") await ProjectPurchaseOrderRevisionModel.collection.updateOne({ _id: "revision-order-one" }, { $set: { projectId: "foreign-project" } });
    if (scenario === "duplicate_award") {
      await order("project-one", "duplicate-order", 5_000, { tenderAwardId: "award-order-one" });
      await ProjectPurchaseOrderRevisionModel.collection.updateOne({ _id: "revision-duplicate-order" }, { $set: { tenderAwardId: "award-order-one" } });
    }
    const result = await createProjectFinanceService({ now: () => NOW }).getBucket(actor, "project-one");
    expect(result.commitmentBudget).toMatchObject({ status: "needs_reconciliation", reasonCodes: ["invalid_order_source"],
      approvedVendorNetPaise: null, budgetUsedPaise: null, availableBudgetPaise: null });
  });

  it("does not offset a same-named vendor's foreign project order or a missing explicit order", async () => {
    await project("project-one", 9_000, true);
    await project("project-two", 50_000);
    await order("project-one");
    await order("project-two", "order-two", 30_000);
    await recordedExpense("project-one", 2_000, { purchaseOrderId: "order-two" });
    const service = createProjectFinanceService({ now: () => NOW });
    expect((await service.getBucket(actor, "project-one")).commitmentBudget).toMatchObject({ status: "needs_reconciliation",
      reasonCodes: ["invalid_expense_linkage"], approvedVendorNetPaise: 5_000, budgetUsedPaise: null });
    await FinanceLedgerEntryModel.collection.updateOne({ _id: "expense-project-one" }, { $set: { purchaseOrderId: "missing-order" } });
    expect((await service.getBucket(actor, "project-one")).commitmentBudget.status).toBe("needs_reconciliation");
    expect((await service.getBucket(actor, "project-two")).commitmentBudget).toMatchObject({ status: "ready", budgetUsedPaise: 30_000 });
  });

  it("adds the projection to posting and replay responses without changing ledger semantics", async () => {
    await project("project-one", 9_000, true);
    await order("project-one");
    await mongoose.connection.transaction(session => openProjectFinanceBucket({ projectId: "project-one", designPlanVersion: 1,
      openedById: actor.id, occurredAt: NOW }, session));
    const service = createProjectFinanceService({ now: () => NOW });
    const input = { type: "direct_spend" as const, expenseClass: "other" as const, category: "Other cost", amountPaise: 300,
      incurredAt: NOW.toISOString(), description: "Synthetic expense", idempotencyKey: "commitment-posting-test" };
    const first = await service.postEntry(actor, "project-one", input);
    expect(first).toMatchObject({ replayed: false, bucket: { recordedCostPaise: 300, remainingBudgetPaise: 6_900,
      commitmentBudget: { status: "ready", outstandingVendorCommitmentPaise: 5_000, budgetUsedPaise: 5_300, availableBudgetPaise: 1_900 } } });
    const replay = await service.postEntry(actor, "project-one", input);
    expect(replay.replayed).toBe(true);
    expect(replay.bucket.commitmentBudget).toEqual(first.bucket.commitmentBudget);
    expect(await FinanceLedgerEntryModel.countDocuments()).toBe(1);
  });

  it("preserves the recorded-only organization dashboard contract, including its empty summary", async () => {
    expect(await readProjectFinancePortfolioReport(NOW)).not.toHaveProperty("commitmentBudget");
    await project("project-one");
    await order("project-one");
    const report = await readProjectFinancePortfolioReport(NOW);
    expect(report).not.toHaveProperty("commitmentBudget");
    expect(report).toMatchObject({ projectCount: 1, recordedCostPaise: 0, remainingBudgetPaise: 7_200 });
  });

  it.each(["detail", "list"])("reads a coherent %s snapshot while linked expense posting and order approval commit", async readKind => {
    await project("project-one", 9_000, true);
    await order("project-one");
    let committed = false;
    const reader = createProjectFinanceService({ now: () => NOW, afterSnapshotEstablished: async () => {
      if (committed) return;
      await mongoose.connection.transaction(async session => {
        await recordedExpense("project-one", 3_000, {}, session);
        const previous = await ProjectPurchaseOrderRevisionModel.findById("revision-order-one").session(session).lean();
        await ProjectPurchaseOrderRevisionModel.collection.insertOne({ ...previous, _id: "approved-revision-two", revision: 2,
          netPaise: 7_000, gstPaise: 1_260, totalPaise: 8_260,
          lines: [{ id: "line-two", netPaise: 7_000, gstPaise: 1_260, totalPaise: 8_260 }] } as never, { session });
        await ProjectPurchaseOrderModel.collection.updateOne({ _id: "order-one" }, { $set: { approvedRevisionId: "approved-revision-two",
          approvedRevision: 2, approvedNetPaise: 7_000, approvedGstPaise: 1_260, approvedTotalPaise: 8_260 } }, { session });
      });
      committed = true;
    } });
    const result = readKind === "detail" ? await reader.getBucket(actor, "project-one")
      : (await reader.listProjects(actor, { limit: 20, offset: 0 })).items[0];
    expect(committed).toBe(true);
    expect(result).toMatchObject({ recordedCostPaise: 0, commitmentBudget: { status: "ready", approvedVendorNetPaise: 5_000,
      outstandingVendorCommitmentPaise: 5_000, budgetUsedPaise: 5_000, availableBudgetPaise: 2_200 } });
    const after = await createProjectFinanceService({ now: () => NOW }).getBucket(actor, "project-one");
    expect(after).toMatchObject({ recordedCostPaise: 3_000, commitmentBudget: { status: "ready", approvedVendorNetPaise: 7_000,
      outstandingVendorCommitmentPaise: 4_000, budgetUsedPaise: 7_000, availableBudgetPaise: 200 } });
  });
});
