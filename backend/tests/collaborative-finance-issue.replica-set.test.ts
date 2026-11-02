import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { newEstimationLifecycle, newQuotationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { DesignPlanReviewRoundModel } from "../src/models/DesignPlanReviewRound.js";
import { DesignWorkflowStateModel } from "../src/models/DesignWorkflowState.js";
import { ProjectFinanceBucketModel } from "../src/models/ProjectFinanceBucket.js";
import { ProjectFinanceBaselineRevisionModel } from "../src/models/ProjectFinanceBaselineRevision.js";
import { QuotationDesignHandoffModel } from "../src/models/QuotationDesignHandoff.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { QuotationUnlockReceiptModel } from "../src/models/QuotationUnlockReceipt.js";
import { createEstimateCollaborationService } from "../src/services/estimate-collaboration.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { activateCollaborativeProjectWorkflow, ensureCollaborativePreparationTask, recordQuotationDesignHandoff } from "../src/services/project-workflow.service.js";
import { ensurePendingProjectFinanceBucket, syncCollaborativeFinanceBaseline, openProjectFinanceBucket, createProjectFinanceService } from "../src/services/project-finance.service.js";
import { assertProjectWorkOrderIssueEligible, projectWorkOrderIssueReadiness } from "../src/services/project-work-order-eligibility.service.js";
import { mongoSuperAdminDashboardOverview, mongoSuperAdminDashboardProjects } from "../src/repositories/super-admin-dashboard.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const at = new Date("2026-10-13T10:00:00Z");
const actor = { id: "collab-finance-super", name: "Synthetic Admin", role: "super_admin", email: "finance-super@example.test" } as const;
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("collaborative-finance-issue");
  await Promise.all([ProjectFinanceBucketModel.init(), ProjectFinanceBaselineRevisionModel.init(), UserModel.init()]);
}, 120000);
afterAll(async () => { await replica?.stop(); });
beforeEach(async () => {
  await replica.clear();
  await UserModel.create({ _id: actor.id, name: actor.name, email: actor.email, emailNormalized: actor.email,
    role: actor.role, active: true, passwordHash: "synthetic-unused", accountKind: "standard", version: 1 });
});

async function fixture(id: string, pre: number, final: number, preOnly = false, finalApprovedAt = at, workflowVersion: 2 | 3 = 2) {
  await ProjectModel.create({ _id: id, name: `Synthetic ${id}`, clientName: "Synthetic Client", clientEmail: `${id}@example.test`,
    clientEmailNormalized: `${id}@example.test`, clientMobile: "0000000000", clientAddress: "Synthetic location", location: "Synthetic location",
    status: "planning", plannedStartAt: at, plannedEndAt: at, estimationWorkflowVersion: workflowVersion, estimateRequirementsVersion: 0 });
  await LeadModel.create({ _id: `${id}-lead`, projectId: id, ownerId: "sales", clientName: "Synthetic Client", clientEmail: `${id}@example.test`,
    clientMobile: "0000000000", projectName: `Synthetic ${id}`, location: "Synthetic location", propertyType: "2BHK", source: "walk_in", stage: "won", nextAction: "Estimation", nextActionAt: at });
  const estimation = { ...(workflowVersion === 3 ? newQuotationLifecycle() : newEstimationLifecycle()), phase: "post", status: preOnly ? "draft" : "client_approved", editClosedAt: preOnly ? null : at.toISOString(),
    preApproval: { reviewRoundId: `${id}-pre`, estimateVersion: 1, approvedAt: at.toISOString() },
    finalApproval: preOnly ? null : { reviewRoundId: `${id}-final`, estimateVersion: 7, approvedAt: finalApprovedAt.toISOString(), requirementsVersion: 0,
      designReviewRoundId: workflowVersion === 3 ? null : `${id}-design`, designPlanVersion: workflowVersion === 3 ? null : 3, designScopeRevision: 1 },
    ...(workflowVersion === 3 ? { designApproval: preOnly ? null : { reviewRoundId: `${id}-design`, estimateReviewRoundId: `${id}-final`, designPlanVersion: 3, designScopeRevision: 1, approvedAt: at.toISOString() } } : {}), approvedDesignScopeRevision: preOnly ? null : 1 };
  await EstimateModel.create({ _id: `${id}-estimate`, leadId: `${id}-lead`, projectId: id, ownerId: "sales", propertyType: "2BHK", rooms: [], scopes: [], lineItems: [],
    version: 25, status: "client_approved", estimation, subtotal: final, gst: 0, total: final,
    designPlanStatus: preOnly ? "pending_assignment" : "approved", designPlanVersion: preOnly ? 0 : 3,
    designPlanApprovedById: preOnly ? null : actor.id, designPlanApprovedAt: preOnly ? null : at, designPlanApprovalSource: preOnly ? null : "admin_proof" });
  for (const [phase, value, version] of [["pre", pre, 1], ["post", final, 7]] as const) {
    if (preOnly && phase === "post") continue;
    await EstimateClientReviewRoundModel.collection.insertOne({ _id: `${id}-${phase === "post" ? "final" : "pre"}`, estimateId: `${id}-estimate`,
      leadId: `${id}-lead`, projectId: id, phase, estimateVersion: version, status: "approved", decision: "approve", decidedById: "synthetic-client", decidedAt: phase === "post" ? finalApprovedAt : at,
      decisionSource: "client_portal", estimateSnapshot: { subtotal: value, gst: 0, total: value, subtotalPaise: value * 100, gstPaise: 0, totalPaise: value * 100, lineItems: [] } } as never);
  }
  if (!preOnly) await DesignPlanReviewRoundModel.collection.insertOne({ _id: `${id}-design`, estimateId: `${id}-estimate`, projectId: id,
    designPlanVersion: 3, designScopeRevision: 1, status: "approved", decision: "approve" } as never);
  await mongoose.connection.transaction(async session => {
    await ensurePendingProjectFinanceBucket({ workflowVersion, projectId: id, estimateId: `${id}-estimate`, estimateVersion: 1,
      estimateReviewRoundId: `${id}-pre`, approvedSubtotalRupees: pre, approvedGstRupees: 0, approvedContractTotalRupees: pre,
      createdById: actor.id, occurredAt: at }, session);
    if (!preOnly) await syncCollaborativeFinanceBaseline(`${id}-estimate`, session);
  });
}
async function payment(id: string, roundId = `${id}-final`, receivedAt = at) {
  await DesignWorkflowStateModel.create({ _id: id, projectId: id, version: 1, estimationWorkflowVersion: 2, designStartedAt: at.toISOString(),
    initialPaymentAt: receivedAt.toISOString(), initialPaymentEstimateId: `${id}-estimate`, initialPaymentEstimateVersion: 7,
    initialPaymentReviewRoundId: roundId, initialPaymentDesignReviewRoundId: `${id}-design`, stages: {}, pauses: [], history: [] });
}

describe("final finance source and work-order gate", () => {
  it("retries issuance eligibility against an unlock that wins after the approved snapshot was read", async () => {
    const id = "unlock-race";
    await fixture(id, 1000, 1500, false, at, 3);
    await payment(id);
    const sales = { id: "sales", name: "Synthetic Sales", email: "unlock-sales@example.test", role: "estimator_sales" as const };
    await UserModel.create({ _id: sales.id, ...sales, emailNormalized: sales.email, active: true, passwordHash: "unused" });
    await ProjectModel.updateOne({ _id: id }, { $set: { assignedEstimatorId: sales.id } });
    await ProjectPurchaseOrderModel.collection.insertOne({ _id: `${id}-order`, projectId: id, status: "ready_to_issue",
      version: 3, submittedRevisionId: `${id}-order-revision`, approvedRevisionId: null,
      approvedNetPaise: null, approvedGstPaise: null, approvedTotalPaise: null } as never);
    expect(await projectWorkOrderIssueReadiness(id)).toMatchObject({ canIssue: true });
    const history = await EstimateClientReviewRoundModel.find({ projectId: id }).sort({ _id: 1 }).lean();
    const drawings = await DesignPlanReviewRoundModel.find({ projectId: id }).lean();
    const baseline = await ProjectFinanceBucketModel.findOne({ projectId: id }).lean();
    const originalOrder = await ProjectPurchaseOrderModel.findById(`${id}-order`).lean();
    let paused = false;
    let release!: () => void;
    const resumed = new Promise<void>(resolve => { release = resolve; });
    const originalUpdate = ProjectModel.updateOne.bind(ProjectModel);
    const fenceSpy = vi.spyOn(ProjectModel, "updateOne").mockImplementation((filter: any, update: any, options: any) => {
      const query = originalUpdate(filter, update, options);
      if (filter._id === id && update.$inc?.estimationFenceEpoch === 1 && !paused) {
        const execute = query.exec.bind(query);
        query.exec = async () => { paused = true; await resumed; return execute(); };
      }
      return query;
    });
    let attempts = 0;
    const issuance = mongoose.connection.transaction(async session => {
      attempts += 1;
      await assertProjectWorkOrderIssueEligible(id, session, { estimateId: `${id}-estimate`, estimateVersion: 7, estimateReviewRoundId: `${id}-final` });
      // A committed order is the observable sink behind the real issuance eligibility primitive.
      await ProjectPurchaseOrderModel.updateOne({ _id: `${id}-order`, status: "ready_to_issue", version: 3 }, {
        $set: { status: "approved", approvedRevisionId: `${id}-order-revision`, approvedNetPaise: 50_000,
          approvedGstPaise: 9_000, approvedTotalPaise: 59_000 }, $inc: { version: 1 }
      }, { session });
    }).then(() => null, error => error);
    try {
      await vi.waitFor(() => expect(paused).toBe(true));
      const service = createEstimateCollaborationService(createAuditService(createMongoRepository()));
      await service.unlock(sales, `${id}-estimate`, { expectedVersion: 25, reviewRoundId: `${id}-final`,
        reason: "Client requested a scope revision", idempotencyKey: "unlock-wins-issuance" });
      release();
      expect(await issuance).toMatchObject({ code: "WORK_ORDER_NOT_READY" });
      expect(attempts).toBeGreaterThan(1);
    } finally { release(); await issuance; fenceSpy.mockRestore(); }
    expect(await ProjectPurchaseOrderModel.findById(`${id}-order`).lean()).toEqual(originalOrder);
    expect(await ProjectPurchaseOrderModel.countDocuments({ projectId: id, approvedRevisionId: { $ne: null } })).toBe(0);
    expect(await EstimateClientReviewRoundModel.find({ projectId: id }).sort({ _id: 1 }).lean()).toEqual(history);
    expect(await DesignPlanReviewRoundModel.find({ projectId: id }).lean()).toEqual(drawings);
    expect(await ProjectFinanceBucketModel.findOne({ projectId: id }).lean()).toEqual(baseline);
    expect(await QuotationUnlockReceiptModel.countDocuments({ estimateId: `${id}-estimate` })).toBe(1);
    expect(await EstimateModel.findById(`${id}-estimate`).lean()).toMatchObject({ version: 26,
      estimation: { editClosedAt: null, status: "draft", finalApproval: { reviewRoundId: `${id}-final` } } });
  });

  it("binds v3 quotation and later drawings separately, preserving two unequal project baselines on repricing", async () => {
    await fixture("quote-alpha", 1000, 1500, false, at, 3);
    await fixture("quote-beta", 2300, 3100, false, at, 3);
    const finance = createProjectFinanceService({ now: () => at });
    const page = await finance.listProjects(actor, { limit: 20, offset: 0 });
    expect(page.summary).toMatchObject({ projectCount: 2, approvedSubtotalPaise: 460000, approvedContractTotalPaise: 460000 });
    for (const id of ["quote-alpha", "quote-beta"]) {
      await payment(id);
      expect(await projectWorkOrderIssueReadiness(id)).toMatchObject({ required: true, canIssue: true });
      const estimate = (await EstimateModel.findById(`${id}-estimate`).lean())!;
      await mongoose.connection.transaction(session => recordQuotationDesignHandoff(estimate, actor.id, at, session));
      await mongoose.connection.transaction(session => recordQuotationDesignHandoff(estimate, actor.id, at, session));
    }
    expect(await QuotationDesignHandoffModel.countDocuments()).toBe(2);
    const id = "quote-alpha";
    await EstimateModel.updateOne({ _id: `${id}-estimate` }, { $set: { "estimation.editClosedAt": null, "estimation.status": "draft" } });
    expect(await projectWorkOrderIssueReadiness(id)).toMatchObject({ required: true, canIssue: false });
    expect(await finance.getBucket(actor, id)).toMatchObject({ approvedSubtotalPaise: 150000 });
    await EstimateClientReviewRoundModel.collection.insertOne({ _id: `${id}-revised`, estimateId: `${id}-estimate`, projectId: id,
      leadId: `${id}-lead`, phase: "post", estimateVersion: 26, status: "approved", decision: "approve", decidedById: "synthetic-client",
      decisionSource: "client_portal", decidedAt: at, estimateSnapshot: { subtotal: 1800, gst: 0, total: 1800,
        subtotalPaise: 180000, gstPaise: 0, totalPaise: 180000, lineItems: [] } } as never);
    await EstimateModel.updateOne({ _id: `${id}-estimate` }, { $set: { version: 27, "estimation.status": "client_approved", "estimation.editClosedAt": at.toISOString(),
      "estimation.finalApproval.reviewRoundId": `${id}-revised`, "estimation.finalApproval.estimateVersion": 26 } });
    await mongoose.connection.transaction(async session => {
      await syncCollaborativeFinanceBaseline(`${id}-estimate`, session);
      const estimate = (await EstimateModel.findById(`${id}-estimate`).session(session).lean())!;
      await recordQuotationDesignHandoff(estimate, actor.id, at, session);
    });
    expect(await ProjectFinanceBucketModel.findOne({ projectId: id }).lean()).toMatchObject({ approvedSubtotalPaise: 100000,
      effectiveBaseline: { approvedSubtotalPaise: 180000, estimateReviewRoundId: `${id}-revised` } });
    expect(await ProjectFinanceBaselineRevisionModel.countDocuments({ projectId: id })).toBe(3);
    expect(await QuotationDesignHandoffModel.countDocuments({ projectId: id })).toBe(2);
    expect(await projectWorkOrderIssueReadiness(id)).toMatchObject({ canIssue: false });
    expect((await finance.listProjects(actor, { limit: 20, offset: 0 })).summary).toMatchObject({ approvedSubtotalPaise: 490000 });
  });
  it("does not treat a v3 quotation approval as drawing approval or unrestricted legacy issuance", async () => {
    await fixture("quote-only", 1000, 1500, false, at, 3);
    await EstimateModel.updateOne({ _id: "quote-only-estimate" }, { $set: { designPlanStatus: "assigned", "estimation.designApproval": null,
      "estimation.approvedDesignScopeRevision": null } });
    await payment("quote-only");
    expect(await projectWorkOrderIssueReadiness("quote-only")).toMatchObject({ required: true, canIssue: false });
    await expect(mongoose.connection.transaction(session => assertProjectWorkOrderIssueEligible("quote-only", session)))
      .rejects.toMatchObject({ code: "WORK_ORDER_NOT_READY" });
  });

  it("filters by the effective final approval decision instead of the original or materialization date", async () => {
    const finalApprovedAt = new Date("2026-10-20T23:59:59.999Z");
    await fixture("final-date", 1000, 1500, false, finalApprovedAt);
    await fixture("pre-date", 2300, 3100, true);
    const service = createProjectFinanceService({ now: () => new Date("2026-10-24T10:00:00Z") });
    const final = await service.getBucket(actor, "final-date");
    expect(final).toMatchObject({ budgetApprovedAt: finalApprovedAt.toISOString(), baselinePhase: "post", approvedSubtotalPaise: 150000 });
    expect(final.createdAt).not.toBe(final.budgetApprovedAt);
    const finalPage = await service.listProjects(actor, { limit: 10, offset: 0, approvedFrom: "2026-10-20", approvedTo: "2026-10-20" });
    expect(finalPage.items).toEqual([final]);
    expect(finalPage.summary).toMatchObject({ projectCount: 1, approvedSubtotalPaise: 150000, costBudgetPaise: 120000 });
    const prePage = await service.listProjects(actor, { limit: 10, offset: 0, approvedFrom: "2026-10-13", approvedTo: "2026-10-13" });
    expect(prePage.items).toEqual([expect.objectContaining({ projectId: "pre-date", budgetApprovedAt: at.toISOString(), baselinePhase: "pre" })]);
    expect(await ProjectFinanceBucketModel.findOne({ projectId: "final-date" }).lean()).toMatchObject({ approvedSubtotalPaise: 100000 });
  });

  it("does not invent a legacy design approval event when a collaborative design round is missing", async () => {
    await fixture("missing-design-history", 1000, 1500);
    await DesignPlanReviewRoundModel.deleteOne({ _id: "missing-design-history-design" });
    const overview = await mongoSuperAdminDashboardOverview({ observedAt: at.toISOString(),
      startAt: new Date(at.getTime() - 7 * 86_400_000).toISOString(), endAt: new Date(at.getTime() + 1).toISOString(), periodDays: 7 });
    expect(overview.comparison.metrics.design_plans_approved.current).toBe(0);
  });

  it.each([true, false])("keeps unactivated Site preparation out of overdue finance and execution integrity, preOnly=%s", async preOnly => {
    const id = "preparation";
    await fixture(id, 1000, 1500, preOnly);
    const estimate = (await EstimateModel.findById(`${id}-estimate`).lean())!;
    await mongoose.connection.transaction(session => ensureCollaborativePreparationTask({ ...estimate, designPlanVersion: 0 }, at, session));
    await ProjectWorkflowTaskModel.updateMany({ projectId: id, kind: { $ne: "site_execution" } },
      { $set: { status: "completed", progress: 100, completedAt: at } });
    const observedAt = new Date(at.getTime() + 30 * 86_400_000);
    const service = createProjectFinanceService({ now: () => observedAt });
    expect(await service.getBucket(actor, id)).toMatchObject({ overdueTaskCount: 0 });
    expect((await service.listProjects(actor, { limit: 20, offset: 0 })).summary).toMatchObject({ overdueTaskCount: 0 });
    const overview = await mongoSuperAdminDashboardOverview({ observedAt: observedAt.toISOString(),
      startAt: new Date(observedAt.getTime() - 7 * 86_400_000).toISOString(), endAt: observedAt.toISOString(), periodDays: 7 });
    expect(overview.execution.total).toBe(0);
    expect(overview.dataQuality.issues.map(issue => issue.code)).not.toContain("task_project_lineage_mismatch");
    expect(overview.dataQuality.issues.map(issue => issue.code)).not.toContain("finance_bucket_lineage_mismatch");
    expect(overview.dataQuality.unavailableMetricKeys).not.toContain("execution.total");
    if (!preOnly) {
      const preparation = (await ProjectWorkflowTaskModel.findOne({ projectId: id, kind: "site_execution" }).lean())!;
      await payment(id, `${id}-final`, observedAt);
      await mongoose.connection.transaction(session => activateCollaborativeProjectWorkflow(id, actor.id, observedAt, session));
      expect(await ProjectWorkflowTaskModel.findById(preparation._id).lean()).toMatchObject({ preparationOnly: false,
        designPlanVersion: 3, openedAt: observedAt });
      expect(await service.getBucket(actor, id)).toMatchObject({ overdueTaskCount: 0 });
      const later = createProjectFinanceService({ now: () => new Date(observedAt.getTime() + 8 * 86_400_000) });
      expect(await later.getBucket(actor, id)).toMatchObject({ overdueTaskCount: 1 });
      expect((await later.listProjects(actor, { limit: 20, offset: 0 })).summary).toMatchObject({ overdueTaskCount: 1 });
    }
  });

  it("reconciles two unequal project, detail and portfolio values without rewriting original baselines", async () => {
    await fixture("alpha", 1000, 1500); await fixture("beta", 2300, 3100);
    const service = createProjectFinanceService({ now: () => at });
    const page = await service.listProjects(actor, { limit: 20, offset: 0 });
    expect(page.summary).toMatchObject({ projectCount: 2, approvedContractTotalPaise: 460000, approvedSubtotalPaise: 460000,
      costBudgetPaise: 368000, targetProfitPaise: 92000, recordedCostPaise: 0 });
    for (const [id, original, final] of [["alpha", 100000, 150000], ["beta", 230000, 310000]] as const) {
      const detail = await service.getBucket(actor, id);
      expect(detail).toMatchObject({ approvedContractTotalPaise: final, originalApprovedContractTotalPaise: original, baselinePhase: "post", estimateVersion: 7, status: "pending_design" });
      expect(page.items.find(item => item.projectId === id)).toEqual(detail);
      expect(await ProjectFinanceBucketModel.findOne({ projectId: id }).lean()).toMatchObject({ approvedContractTotalPaise: original });
    }
    expect(await ProjectFinanceBaselineRevisionModel.countDocuments()).toBe(4);
    const dashboard = await mongoSuperAdminDashboardProjects(at.toISOString(), { module: "finance", sort: "name_asc", limit: 20, offset: 0 });
    expect(dashboard.total).toBe(2);
    expect(dashboard.items.map(row => row.finance?.approvedSubtotalPaise)).toEqual([150000, 310000]);

  });
  it("blocks all issuance and finance opening before payment, then accepts only the final source", async () => {
    await fixture("alpha", 1000, 1500);
    const open = (session: mongoose.ClientSession) => openProjectFinanceBucket({ projectId: "alpha", designPlanVersion: 3, openedById: actor.id, occurredAt: at }, session);
    expect(await projectWorkOrderIssueReadiness("alpha")).toMatchObject({ required: true, canIssue: false });
    await expect(mongoose.connection.transaction(open)).rejects.toMatchObject({ code: "WORK_ORDER_NOT_READY" });
    expect((await ProjectFinanceBucketModel.findOne({ projectId: "alpha" }).lean())?.status).toBe("pending_design");
    await payment("alpha");
    await expect(mongoose.connection.transaction(session => assertProjectWorkOrderIssueEligible("alpha", session,
      { estimateId: "alpha-estimate", estimateVersion: 1, estimateReviewRoundId: "alpha-pre" }))).rejects.toMatchObject({ code: "WORK_ORDER_SOURCE_RECONCILIATION_REQUIRED" });
    await mongoose.connection.transaction(async session => {
      await assertProjectWorkOrderIssueEligible("alpha", session, { estimateId: "alpha-estimate", estimateVersion: 7, estimateReviewRoundId: "alpha-final" });
      await open(session);
    });
    const opened = await ProjectFinanceBucketModel.findOne({ projectId: "alpha" }).lean();
    await mongoose.connection.transaction(open);
    expect((await ProjectFinanceBucketModel.findOne({ projectId: "alpha" }).lean())?.version).toBe(opened?.version);
  });
  it("rejects a foreign receipt and stale design or requirements without treating them as paid", async () => {
    await fixture("alpha", 1000, 1500); await payment("alpha", "beta-final");
    expect((await projectWorkOrderIssueReadiness("alpha")).canIssue).toBe(false);
    await DesignWorkflowStateModel.updateOne({ _id: "alpha" }, { $set: { initialPaymentReviewRoundId: "alpha-final" } });
    await EstimateModel.updateOne({ _id: "alpha-estimate" }, { $inc: { "estimation.designScopeRevision": 1 } });
    expect((await projectWorkOrderIssueReadiness("alpha")).blockers).toContain("Design must be complete and approved for the final estimate scope.");
    await ProjectModel.updateOne({ _id: "alpha" }, { $inc: { estimateRequirementsVersion: 1 } });
    expect((await projectWorkOrderIssueReadiness("alpha")).blockers).toContain("The final estimate approval or its requirements source needs reconciliation.");
  });
});
