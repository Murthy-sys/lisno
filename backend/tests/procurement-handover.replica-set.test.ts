import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { HandoverAnswerInput, HandoverWorkspace } from "../src/contracts/procurement-handover.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeBasketQualityRevisionModel } from "../src/models/AiEstimatorKnowledgeBasketQualityRevision.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { ProcurementFindingModel } from "../src/models/ProcurementFinding.js";
import { ProcurementHandoverModel } from "../src/models/ProcurementHandover.js";
import { ProcurementHandoverRevisionModel } from "../src/models/ProcurementHandoverRevision.js";
import { ProcurementLifecycleCommandModel } from "../src/models/ProcurementLifecycleCommand.js";
import { ProcurementLifecycleEvidenceModel } from "../src/models/ProcurementLifecycleEvidence.js";
import { ProcurementLifecycleStateModel } from "../src/models/ProcurementLifecycleState.js";
import { ProjectManagerEventModel } from "../src/models/ProjectManagerEvent.js";
import { ProjectQualityAuditModel } from "../src/models/ProjectQualityAudit.js";
import { ProjectSnagModel } from "../src/models/ProjectSnag.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import { basketQualityDigest } from "../src/services/ai-estimator-knowledge-basket-quality.js";
import { createProcurementFindingsService } from "../src/services/procurement-findings.service.js";
import { createProcurementHandoverService, handoverEvidenceEntityId, readHandoverReadiness } from "../src/services/procurement-handover.service.js";
import { createLifecycleFindingBridge } from "../src/services/procurement-lifecycle/findings-bridge.js";
import { lcTransaction } from "../src/services/procurement-lifecycle/transaction.js";
import { lifecycleAt, seedLifecycleFixture } from "./fixtures/procurement-lifecycle.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const audit = createAuditService(createMemoryRepository());
const base = { audit, now: () => lifecycleAt };
const deps = { ...base, createFindingInSession: createLifecycleFindingBridge(base) };
const handover = createProcurementHandoverService(deps), findings = createProcurementFindingsService(deps);
const parameter = { id: "fixing", type: "checkbox", label: "Check fixing", unit: null, allowedValues: [], minimum: null,
  maximum: null, defaultValue: null, required: true, category: "Installation", active: true,
  instructions: "Inspect fixings", acceptanceCriteria: "Secure", stage: "Installation", checkMethod: "visual", severity: "major",
  responsibleRole: "site", failureAction: "Repair", sampling: { method: "all", unit: "unit" },
  evidence: { photos: true, documents: false, video: false, minPhotosPerSample: 1 } };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let a: Awaited<ReturnType<typeof seedLifecycleFixture>>, b: typeof a, serial = 0;
const key = () => `handover-test-${++serial}`;
beforeAll(async () => {
  replica = await startMongoReplicaSet("procurement-handover");
  for (const model of [ProcurementHandoverModel, ProcurementHandoverRevisionModel, ProcurementFindingModel,
    ProcurementLifecycleCommandModel, ProcurementLifecycleEvidenceModel, ProcurementLifecycleStateModel,
    ProjectSnagModel, ProjectManagerEventModel, AuditEventModel]) await model.syncIndexes();
}, 120_000);
afterAll(async () => { await replica?.stop(); });
beforeEach(async () => {
  await replica.clear(); serial = 0;
  a = await seedLifecycleFixture("handover-a"); b = await seedLifecycleFixture("handover-b");
  for (const fixture of [a, b]) {
    const basketId = `${fixture.projectId}-basket`, revisionId = `${basketId}-quality-1`;
    await AiEstimatorKnowledgeBasketModel.collection.insertOne({ _id: basketId, name: "Interiors", status: "active", version: 1,
      dependencyEpoch: 0, qualityRevisionId: revisionId } as any);
    await AiEstimatorKnowledgeBasketQualityRevisionModel.collection.insertOne({ _id: revisionId, basketId, revisionNumber: 1,
      parameters: [parameter], contentDigest: basketQualityDigest(basketId, [parameter]), createdAt: lifecycleAt } as any);
    await ProcurementLifecycleStateModel.collection.insertOne({ _id: fixture.projectId, projectId: fixture.projectId, version: 1,
      activatedAt: lifecycleAt, activatedById: fixture.buyer.id, policy: { timezone: "Asia/Kolkata", reviewIntervalDays: 7, inspectionCount: 2 },
      adoption: "new", sourceDigest: "0".repeat(64), updatedAt: lifecycleAt, updatedById: fixture.buyer.id } as any);
  }
});
const workspace = () => handover.get(a.buyer, a.projectId);
async function command(panel: HandoverWorkspace, input: Record<string, unknown>) {
  return handover.command(a.buyer, a.projectId, { expectedVersion: panel.version, sourceDigest: panel.sourceDigest, idempotencyKey: key(), ...input });
}
async function evidence(id: string, kind: "image" | "document", projectId = a.projectId, entityId = handoverEvidenceEntityId(projectId), purpose = "handover") {
  await ProcurementLifecycleEvidenceModel.collection.insertOne({ _id: id, projectId, entityId, purpose, uploaderId: a.buyer.id,
    kind, mimeType: kind === "image" ? "image/jpeg" : "application/pdf", originalFilename: "fixture", storageReference: `opaque-${id}`,
    byteSize: 1, sha256: id, createdAt: lifecycleAt, referenceEpoch: 0 } as any);
}
async function completeDraft(panel: HandoverWorkspace) {
  await evidence("photo", "image"); await evidence("document", "document");
  const answers: HandoverAnswerInput[] = panel.checks.map(check => ({ checkId: check.id, answer: check.required ? "pass" : "not_applicable",
    note: check.required ? "Inspected and accepted" : "No applicable equipment or documents for this scope", sampleCount: 1,
    evidenceIds: !check.required ? [] : check.evidence?.photos ? ["photo"] : check.evidence?.documents ? ["document"] : [] }));
  return command(panel, { action: "save", answers });
}

describe("procurement handover transaction invariants", () => {
  it("uses appointed identities and current configured snapshots without mutating read fences", async () => {
    const panel = await workspace();
    expect(panel.checks.filter(check => check.parameterId === parameter.id)).toHaveLength(3);
    expect(new Set(panel.checks.filter(check => check.parameterId).map(check => check.itemId)).size).toBe(3);
    expect(panel.checks.find(check => check.parameterId)?.parameterSnapshot).toMatchObject({ id: "fixing", required: true });
    expect(panel.checks.some(check => check.label === "Delivery receipt recorded")).toBe(false);
    await lcTransaction(session => readHandoverReadiness(a.projectId, session, lifecycleAt));
    expect((await AiEstimatorKnowledgeBasketModel.findById(`${a.projectId}-basket`).lean())!.dependencyEpoch).toBe(0);
    await expect(handover.get(b.buyer, a.projectId)).rejects.toMatchObject({ status: 404 });
    await expect(handover.get(a.finance, a.projectId)).rejects.toMatchObject({ status: 404 });
  });
  it("requires scoped evidence and mandatory outcomes, and preserves submitted/corrected immutable history", async () => {
    let panel = await workspace(); const check = panel.checks.find(row => row.parameterId)!;
    await expect(command(panel, { action: "save", answers: [{ checkId: check.id, answer: "not_applicable", note: "Not required", evidenceIds: [], sampleCount: 1 }] })).rejects.toMatchObject({ status: 409 });
    panel = await completeDraft(panel);
    const missing = { ...panel.answers.find(row => row.checkId === check.id)!, evidenceIds: [] };
    const { actorId: _actor, recordedAt: _at, findingId: _finding, ...input } = missing;
    panel = await command(panel, { action: "save", answers: [input] });
    await expect(command(panel, { action: "submit", reason: "Ready for handover" })).rejects.toMatchObject({ status: 409 });
    await evidence("foreign", "image", b.projectId);
    await expect(command(panel, { action: "save", answers: [{ ...input, evidenceIds: ["foreign"] }] })).rejects.toMatchObject({ status: 409 });
    await evidence("wrong-purpose", "image", a.projectId, panel.evidenceEntityId, "inspection");
    await expect(command(panel, { action: "save", answers: [{ ...input, evidenceIds: ["wrong-purpose"] }] })).rejects.toMatchObject({ status: 409 });
    panel = await command(panel, { action: "save", answers: [{ ...input, evidenceIds: ["photo"] }] });
    panel = await command(panel, { action: "submit", reason: "Handover evidence checked" });
    const original = await ProcurementHandoverRevisionModel.findById(panel.currentRevisionId).lean();
    expect((await lcTransaction(session => readHandoverReadiness(a.projectId, session, lifecycleAt, true))).ready).toBe(true);
    await expect(command(panel, { action: "save", answers: [] })).rejects.toMatchObject({ status: 409 });
    const corrected = await command(panel, { action: "correct", reason: "Additional site observation requires correction" });
    expect(corrected.status).toBe("draft"); expect(corrected.submittedRevisionId).toBe(panel.currentRevisionId);
    expect(await ProcurementHandoverRevisionModel.findById(panel.currentRevisionId).lean()).toEqual(original);
    await expect(ProcurementHandoverRevisionModel.updateOne({ _id: original!._id }, { $set: { status: "draft" } })).rejects.toThrow("immutable");
    expect((await lcTransaction(session => readHandoverReadiness(a.projectId, session, lifecycleAt))).ready).toBe(false);
  });
  it("links a failed check to exactly one truthful canonical snag, and only canonical verification clears it", async () => {
    let panel = await workspace(); const check = panel.checks.find(row => row.parameterId)!;
    const answer = { checkId: check.id, answer: "fail", note: "Loose fixing needs repair", sampleCount: 1, evidenceIds: [],
      finding: { ownerId: a.manager.id, dueAt: "2026-12-01T09:00:00Z" } };
    const input = { action: "save", expectedVersion: 0, sourceDigest: panel.sourceDigest, idempotencyKey: key(), answers: [answer] };
    const repeated = await Promise.all([handover.command(a.buyer, a.projectId, input), handover.command(a.buyer, a.projectId, input)]);
    expect(repeated[0].currentRevisionId).toBe(repeated[1].currentRevisionId);
    panel = await command(repeated[0], { action: "save", answers: [{ ...answer, note: "Repair is in progress" }] });
    expect(await ProcurementFindingModel.countDocuments({ projectId: a.projectId })).toBe(1);
    expect(await ProjectSnagModel.countDocuments({ projectId: a.projectId })).toBe(1);
    const snag = await ProjectSnagModel.findById(panel.findings[0]!.snagId).lean();
    expect(snag).toMatchObject({ createdById: a.buyer.id, ownerId: a.manager.id, status: "open" });
    panel = await completeDraft(panel);
    await ProjectSnagModel.updateOne({ _id: snag!._id }, { $set: { status: "resolved" } });
    await expect(command(panel, { action: "submit", reason: "Work repaired" })).rejects.toMatchObject({ status: 409 });
    await ProjectSnagModel.updateOne({ _id: snag!._id }, { $set: { status: "verified" } });
    panel = await command(panel, { action: "submit", reason: "Verified by the canonical snag workflow" });
    expect(panel.findings[0]!.status).toBe("verified");
    expect((await ProcurementFindingModel.findById(panel.findings[0]!.id).lean())!.reportedById).toBe(a.buyer.id);
  });
  it("rejects an unrelated corrective-action owner and rolls back all revision/finding/audit writes", async () => {
    const panel = await workspace(); const check = panel.checks[0]!;
    await expect(command(panel, { action: "save", answers: [{ checkId: check.id, answer: "fail", note: "Needs repair", evidenceIds: [], sampleCount: 1,
      finding: { ownerId: b.manager.id, dueAt: "2026-12-01T09:00:00Z" } }] })).rejects.toMatchObject({ status: 409 });
    expect(await ProcurementHandoverRevisionModel.countDocuments()).toBe(0);
    expect(await ProcurementFindingModel.countDocuments()).toBe(0); expect(await ProjectSnagModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });
  it("requires explicit reconciliation of configured quality changes and retains the original submission", async () => {
    let panel = await completeDraft(await workspace()); panel = await command(panel, { action: "submit", reason: "All checks passed" });
    const originalId = panel.currentRevisionId, original = await ProcurementHandoverRevisionModel.findById(originalId).lean();
    const basketId = `${a.projectId}-basket`, nextParameter = { ...parameter, label: "Check all fixing points", evidence: { ...parameter.evidence, minPhotosPerSample: 2 } };
    await AiEstimatorKnowledgeBasketQualityRevisionModel.collection.insertOne({ _id: `${basketId}-quality-2`, basketId, revisionNumber: 2,
      parameters: [nextParameter], contentDigest: basketQualityDigest(basketId, [nextParameter]), createdAt: lifecycleAt } as any);
    await AiEstimatorKnowledgeBasketModel.updateOne({ _id: basketId }, { $set: { qualityRevisionId: `${basketId}-quality-2` }, $inc: { version: 1 } });
    await expect(command(panel, { action: "correct", reason: "Update outdated checks" })).rejects.toMatchObject({ status: 409 });
    panel = await workspace(); expect(panel.status).toBe("source_changed");
    expect(panel.sourceChanges).toHaveLength(3); expect(panel.sourceChanges[0]).toMatchObject({ kind: "changed" });
    panel = await command(panel, { action: "reconcile", reason: "Adopt updated required quality inspection" });
    expect(panel.answers.some(answer => panel.checks.find(check => check.id === answer.checkId)?.parameterId)).toBe(false);
    expect(await ProcurementHandoverRevisionModel.findById(originalId).lean()).toEqual(original);
    await expect(command(panel, { action: "submit", reason: "Needs new quality evidence" })).rejects.toMatchObject({ status: 409 });
  });
  it("displays immutable PM findings without treating Procurement answers or correction drafts as a PM signature", async () => {
    let panel = await completeDraft(await workspace());
    const row = { _id: "site-audit", projectId: a.projectId, orderId: a.orderId, orderRevisionId: a.revisionId,
      basketId: `${a.projectId}-basket`, checklistRevisionId: `${a.projectId}-basket-quality-1`, status: "signed",
      signedAt: lifecycleAt, signedById: a.manager.id, parameters: [parameter], answers: [{ id: parameter.id, answer: "fail" }] };
    await ProjectQualityAuditModel.collection.insertOne(row as any);
    await ProjectQualityAuditModel.collection.insertOne({ ...row, _id: "site-correction", status: "draft", correctionOf: row._id } as any);
    panel = await workspace(); expect(panel.qualityAudits[0]).toMatchObject({ id: row._id, status: "signed_with_findings", signedById: a.manager.id });
    await expect(command(panel, { action: "submit", reason: "Procurement checks passed" })).rejects.toMatchObject({ status: 409 });
    await ProjectQualityAuditModel.collection.updateOne({ _id: "site-correction" }, { $set: { status: "signed", answers: [{ id: parameter.id, answer: "pass" }] } });
    panel = await command(panel, { action: "submit", reason: "Site Manager signed corrected audit" });
    expect(panel.qualityAudits.find(audit => audit.id === row._id)?.status).toBe("corrected");
    expect(await ProjectQualityAuditModel.findById(row._id).lean()).toEqual(row);
  });
  it("serializes stale competing versions and rechecks current assignment before idempotent replay", async () => {
    const panel = await workspace(), first = { action: "save", expectedVersion: 0, sourceDigest: panel.sourceDigest, idempotencyKey: key(), answers: [] };
    const results = await Promise.allSettled([handover.command(a.buyer, a.projectId, first), handover.command(a.buyer, a.projectId, { ...first, idempotencyKey: key() })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await ProcurementHandoverRevisionModel.countDocuments()).toBe(1);
    const replay = results[0]!.status === "fulfilled" ? first : null;
    if (replay) {
      await ProjectWorkflowTaskModel.updateOne({ _id: `${a.projectId}-procurement` }, { $set: { assigneeUserId: b.buyer.id } });
      await expect(handover.command(a.buyer, a.projectId, replay)).rejects.toMatchObject({ status: 404 });
    }
  });
  it("allows urgent findings independently of progress rounds and keeps their evidence and identity scoped", async () => {
    const panel = await workspace(); await evidence("urgent-photo", "image", a.projectId, "urgent-finding");
    const input = { recordId: "urgent-finding", expectedVersion: 0, sourceDigest: panel.lifecycleSourceDigest, idempotencyKey: key(),
      title: "Urgent site defect", note: "Inspect a new defect today", ownerId: a.manager.id, dueAt: "2026-11-28T09:00:00Z", evidenceIds: ["urgent-photo"] };
    const result = await findings.report(a.buyer, a.projectId, input);
    expect(result).toMatchObject({ id: input.recordId, reportedById: a.buyer.id, status: "open", origin: { kind: "urgent" } });
    expect((await workspace()).findings).toHaveLength(1);
    await expect(findings.report(b.buyer, a.projectId, input)).rejects.toMatchObject({ status: 404 });
    expect(await findings.report(a.buyer, a.projectId, input)).toEqual(result);
  });
});
