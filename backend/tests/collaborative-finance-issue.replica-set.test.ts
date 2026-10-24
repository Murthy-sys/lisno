import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newEstimationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { DesignPlanReviewRoundModel } from "../src/models/DesignPlanReviewRound.js";
import { DesignWorkflowStateModel } from "../src/models/DesignWorkflowState.js";
import { ProjectFinanceBucketModel } from "../src/models/ProjectFinanceBucket.js";
import { ProjectFinanceBaselineRevisionModel } from "../src/models/ProjectFinanceBaselineRevision.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { activateCollaborativeProjectWorkflow, ensureCollaborativePreparationTask } from "../src/services/project-workflow.service.js";
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

async function fixture(id: string, pre: number, final: number, preOnly = false, finalApprovedAt = at) {
  await ProjectModel.create({ _id: id, name: `Synthetic ${id}`, clientName: "Synthetic Client", clientEmail: `${id}@example.test`,
    clientEmailNormalized: `${id}@example.test`, clientMobile: "0000000000", clientAddress: "Synthetic location", location: "Synthetic location",
    status: "planning", plannedStartAt: at, plannedEndAt: at, estimationWorkflowVersion: 2, estimateRequirementsVersion: 0 });
  await LeadModel.create({ _id: `${id}-lead`, projectId: id, ownerId: "sales", clientName: "Synthetic Client", clientEmail: `${id}@example.test`,
    clientMobile: "0000000000", projectName: `Synthetic ${id}`, location: "Synthetic location", propertyType: "2BHK", source: "walk_in", stage: "won", nextAction: "Estimation", nextActionAt: at });
  const estimation = { ...newEstimationLifecycle(), phase: "post", status: preOnly ? "draft" : "client_approved", editClosedAt: preOnly ? null : at.toISOString(),
    preApproval: { reviewRoundId: `${id}-pre`, estimateVersion: 1, approvedAt: at.toISOString() },
    finalApproval: preOnly ? null : { reviewRoundId: `${id}-final`, estimateVersion: 7, approvedAt: finalApprovedAt.toISOString(), requirementsVersion: 0,
      designReviewRoundId: `${id}-design`, designPlanVersion: 3, designScopeRevision: 1 }, approvedDesignScopeRevision: preOnly ? null : 1 };
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
    designPlanVersion: 3, status: "approved", decision: "approve" } as never);
  await mongoose.connection.transaction(async session => {
    await ensurePendingProjectFinanceBucket({ workflowVersion: 2, projectId: id, estimateId: `${id}-estimate`, estimateVersion: 1,
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
