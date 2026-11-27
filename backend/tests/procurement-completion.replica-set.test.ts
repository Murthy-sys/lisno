import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { seedReadyProcurement } from "./fixtures/procurement-ready.js";
import { createProjectCompletionService } from "../src/services/project-completion.service.js";
import { createProcurementReadinessService } from "../src/services/procurement-readiness.service.js";
import { ProjectCompletionDecisionModel } from "../src/models/ProjectCompletionDecision.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProcurementReadinessDeclarationModel, ProcurementReadinessStateModel } from "../src/models/ProcurementReadiness.js";
import { ProcurementLifecycleCommandModel } from "../src/models/ProcurementLifecycleCommand.js";
import { ProcurementInspectionVisitModel } from "../src/models/ProcurementInspectionVisit.js";
import { ProcurementHandoverRevisionModel } from "../src/models/ProcurementHandoverRevision.js";
import { ProcurementPaymentTransactionModel } from "../src/models/ProcurementPaymentTransaction.js";
import { ProcurementPaymentCorrectionModel } from "../src/models/ProcurementPaymentCorrection.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { replica = await startMongoReplicaSet("procurement-completion"); for (const model of [ProjectCompletionDecisionModel, ProcurementReadinessDeclarationModel, ProcurementReadinessStateModel, ProcurementLifecycleCommandModel, ProcurementInspectionVisitModel, ProcurementHandoverRevisionModel, ProcurementPaymentTransactionModel, ProcurementPaymentCorrectionModel]) await model.syncIndexes(); }, 120000);
beforeEach(async () => replica.clear()); afterAll(async () => replica?.stop());
describe("atomic Procurement and project completion", () => {
  it("snapshots current Procurement references at final Admin signoff and retains them after a reversal", async () => {
    const f = await seedReadyProcurement(); const completion = createProjectCompletionService(f.deps);
    const summary = await completion.summary(f.admin, f.projectId); expect(summary.readyForCompletion).toBe(true);
    await expect(completion.complete(f.buyer, f.projectId, { expectedAuthorityVersion: summary.completionAuthorityVersion, idempotencyKey: f.key() })).rejects.toMatchObject({ status: 403 });
    const input = { expectedAuthorityVersion: summary.completionAuthorityVersion, idempotencyKey: f.key() };
    const closed = await completion.complete(f.admin, f.projectId, input); expect(await completion.complete(f.admin, f.projectId, input)).toEqual(closed);
    const decision = await ProjectCompletionDecisionModel.findById(closed.id).lean();
    expect(decision).toMatchObject({ procurementReadinessDeclarationId: f.submitted.declaration!.id, procurementReadinessDigest: f.submitted.sourceDigest, procurementReadinessReferences: f.submitted.references });
    expect((decision as any).procurementReadinessReferences["inspections.inspectionVisitIds"]).toHaveLength(2);
    await AiEstimatorKnowledgeSectionModel.updateOne({ _id: `${f.lines[0]!.mainLineId}-overview` }, { $set: { "payload.closurePriority": "P3" } });
    const laterReadiness = createProcurementReadinessService({ ...f.deps, now: () => new Date("2027-01-15T10:00:00Z") });
    const historical = await laterReadiness.get(f.buyer, f.projectId);
    expect(historical).toMatchObject({ status: "submitted", ready: true, sourceDigest: f.submitted.sourceDigest, references: f.submitted.references, blockers: [], allowedActions: [] });
    await f.payment({ action: "reverse", transactionId: f.transactionId, reason: "Post-closeout bank record correction" });
    const financialException = await laterReadiness.get(f.buyer, f.projectId);
    expect(financialException.status).toBe("submitted");
    expect(financialException.blockers.length).toBeGreaterThan(0);
    expect(financialException.blockers.every(blocker => blocker.tab === "payments")).toBe(true);
    expect(financialException.references).toEqual(f.submitted.references);
    expect(await ProjectCompletionDecisionModel.findById(closed.id).lean()).toEqual(decision);
    expect(await ProjectModel.findById(f.projectId).lean()).toMatchObject({ status: "completed", completionDecisionId: closed.id });
  }, 30000);
  it("rejects stale Configuration without rewriting the submitted declaration", async () => {
    const f = await seedReadyProcurement("changed"); const completion = createProjectCompletionService(f.deps);
    const original = await ProcurementReadinessDeclarationModel.findById(f.submitted.declaration!.id).lean();
    await AiEstimatorKnowledgeSectionModel.updateOne({ _id: `${f.lines[0]!.mainLineId}-overview` }, { $set: { "payload.closurePriority": "P3" } });
    const summary = await completion.summary(f.admin, f.projectId); expect(summary.readyForCompletion).toBe(false);
    expect(summary.blockers).toContainEqual(expect.objectContaining({ code: "PROCUREMENT_READINESS_PENDING" }));
    await expect(completion.complete(f.admin, f.projectId, { expectedAuthorityVersion: summary.completionAuthorityVersion, idempotencyKey: f.key() })).rejects.toMatchObject({ code: "PROJECT_COMPLETION_BLOCKED" });
    expect(await ProcurementReadinessDeclarationModel.findById(f.submitted.declaration!.id).lean()).toEqual(original);
  }, 30000);
  it("serializes payment reversal with closure without reopening a committed closeout", async () => {
    const f = await seedReadyProcurement("race"); const completion = createProjectCompletionService(f.deps);
    const summary = await completion.summary(f.admin, f.projectId);
    const [closing, reversing] = await Promise.allSettled([
      completion.complete(f.admin, f.projectId, { expectedAuthorityVersion: summary.completionAuthorityVersion, idempotencyKey: f.key() }),
      f.payment({ action: "reverse", transactionId: f.transactionId, reason: "Transfer entered against the wrong bank record" })
    ]);
    expect(reversing.status).toBe("fulfilled");
    if (closing.status === "fulfilled") {
      expect(await ProjectModel.findById(f.projectId).lean()).toMatchObject({ status: "completed", completionDecisionId: closing.value.id });
      expect(await ProjectCompletionDecisionModel.countDocuments({ projectId: f.projectId })).toBe(1);
    } else {
      expect(closing.reason).toMatchObject({ code: "PROJECT_COMPLETION_BLOCKED" });
      expect(await ProjectCompletionDecisionModel.countDocuments({ projectId: f.projectId })).toBe(0);
    }
  }, 30000);
});
