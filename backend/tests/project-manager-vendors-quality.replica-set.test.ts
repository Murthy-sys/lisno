import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { VendorWorkAssignmentModel } from "../src/models/VendorWorkAssignment.js";
import { VendorExecutionStateModel } from "../src/models/VendorExecutionState.js";
import { VendorExecutionEventModel } from "../src/models/VendorExecutionEvent.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeBasketQualityRevisionModel } from "../src/models/AiEstimatorKnowledgeBasketQualityRevision.js";
import { ProcurementBasketAwardModel, ProcurementBasketAwardRevisionModel } from "../src/models/ProcurementBasketTender.js";
import { ProjectVendorNoticeModel } from "../src/models/ProjectVendorNotice.js";
import { ProjectPaymentCertificationModel } from "../src/models/ProjectPaymentCertification.js";
import { ProjectQualityAuditModel } from "../src/models/ProjectQualityAudit.js";
import { ProjectManagerEvidenceModel } from "../src/models/ProjectManagerEvidence.js";
import { ProjectManagerEventModel } from "../src/models/ProjectManagerEvent.js";
import { FinanceLedgerEntryModel } from "../src/models/FinanceLedgerEntry.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { basketQualityDigest } from "../src/services/ai-estimator-knowledge-basket-quality.js";
import { createVendorExecutionService } from "../src/services/vendor-execution.service.js";
import { createProjectManagerVendorsService } from "../src/services/project-manager/vendors.js";
import { createProjectManagerQualityService } from "../src/services/project-manager/quality.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

vi.mock("../src/services/vendor-readiness.service.js", () => ({ vendorActivation: vi.fn(async () => ({ effectiveStatus: "active" })) }));
const now = new Date("2026-10-27T09:00:00Z");
const actor = (id: string, role: PublicUser["role"]): PublicUser => ({ id, role, name: id, email: `${id}@example.invalid` });
const pm = actor("pm-a", "site_manager"), other = actor("pm-b", "site_manager"), site = pm, procurement = actor("proc-a", "procurement"), designer = actor("designer-a", "designer"), finance = actor("finance-a", "finance_head");
const audit = createAuditService(createMemoryRepository()); const deps = { audit, now: () => now };
const execution = createVendorExecutionService(deps); const vendors = createProjectManagerVendorsService({ ...deps, execution }); const quality = createProjectManagerQualityService(deps);
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>; let serial = 0;
const key = () => `command-${++serial}`;
const parameter = { id: "fixing-check", type: "checkbox", label: "Check fixing", unit: null, allowedValues: [], minimum: null, maximum: null, defaultValue: null, required: true, category: "Installation", active: true,
  instructions: "Inspect fixings", acceptanceCriteria: "Secure", stage: "Installation", checkMethod: "visual", severity: "major", responsibleRole: "site", failureAction: "Repair", sampling: { method: "all", unit: "unit" }, evidence: { photos: true, documents: false, video: false, minPhotosPerSample: 1 } };
beforeAll(async () => {
  replica = await startMongoReplicaSet("pm-vendors-quality");
  for (const model of [ProjectVendorNoticeModel, ProjectPaymentCertificationModel, ProjectQualityAuditModel, ProjectManagerEventModel, VendorExecutionEventModel, VendorExecutionStateModel, ProjectManagerEvidenceModel, AuditEventModel]) await model.syncIndexes();
}, 120_000);
afterAll(async () => { await replica?.stop(); });
beforeEach(async () => {
  await replica.clear(); serial = 0;
  await UserModel.create([pm, other, procurement, designer, finance].map(user => ({ _id: user.id, name: user.name, role: user.role, email: user.email, emailNormalized: user.email, passwordHash: "fixture-only", active: true })));
  await ProjectModel.collection.insertMany([{ _id: "project-a", name: "Project A", status: "active", programManagerId: pm.id, assignedDesignerIds: [designer.id] }, { _id: "project-b", name: "Project B", status: "active", programManagerId: other.id }] as any);
  await ProjectWorkflowTaskModel.collection.insertMany([{ _id: "site-task", projectId: "project-a", estimateId: "estimate-a", designPlanVersion: 1, version: 1, status: "open", kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: site.id }, { _id: "proc-task", projectId: "project-a", kind: "procurement", assigneeRole: "procurement", assigneeUserId: procurement.id }, { _id: "finance-task", projectId: "project-a", kind: "finance", assigneeRole: "finance_head", assigneeUserId: finance.id }] as any);
  await AiEstimatorKnowledgeVendorModel.collection.insertOne({ _id: "vendor-a", name: "Fixture contractor", status: "active" } as any);
  await AiEstimatorKnowledgeBasketModel.collection.insertOne({ _id: "basket-a", name: "Carpentry", status: "active", version: 1, qualityRevisionId: "quality-revision-a" } as any);
  await AiEstimatorKnowledgeBasketQualityRevisionModel.collection.insertOne({ _id: "quality-revision-a", basketId: "basket-a", revisionNumber: 1, parameters: [parameter], contentDigest: basketQualityDigest("basket-a", [parameter]), createdAt: now } as any);
  const lines = ["a", "b"].map(id => ({ id: `line-${id}`, procurementItemId: `item-${id}`, estimateId: "estimate-a", estimateVersion: 2, estimateReviewRoundId: "approved-round", sourceSectionId: "basket-a", sourceLineItemKey: `source-${id}`, roomName: "Living", itemName: "Cabinet", quantityMilliUnits: 1000, unitPricePaise: 10000, netPaise: 10000, gstPaise: 0, totalPaise: 10000, uomId: "nos", uomCode: "NOS", uomName: "Number", scopeType: "execution", description: "Install cabinet", targetDate: "2026-11-10" }));
  await ProjectPurchaseOrderModel.collection.insertOne({ _id: "order-a", projectId: "project-a", vendorId: "vendor-a", vendorName: "Fixture contractor", orderNumber: "PO-A", estimateId: "estimate-a", status: "approved", approvedRevision: 1, approvedRevisionId: "order-revision-a", cancelledAt: null, tenderAwardId: "award-a" } as any);
  await ProjectPurchaseOrderRevisionModel.collection.insertOne({ _id: "order-revision-a", orderId: "order-a", projectId: "project-a", vendorId: "vendor-a", tenderAwardId: "award-a", revision: 1, lines } as any);
  await EstimateModel.collection.insertOne({ _id: "estimate-a", projectId: "project-a", status: "client_approved", designPlanStatus: "approved", designPlanVersion: 1, designPlanDesignerId: designer.id } as any);
  await EstimateClientReviewRoundModel.collection.insertOne({ _id: "approved-round", estimateId: "estimate-a", projectId: "project-a", status: "approved", decision: "approve", estimateVersion: 2, estimateSnapshot: { lineItems: lines.map(line => ({ id: line.sourceLineItemKey, mainBasketId: "basket-a", mainLineId: "main-a" })) } } as any);
  for (const line of lines) {
    const assignmentId = `work-${line.id}`;
    await VendorWorkAssignmentModel.collection.insertOne({ _id: assignmentId, projectId: "project-a", vendorId: "vendor-a", orderId: "order-a", orderRevision: 1, lineId: line.id, procurementItemId: line.procurementItemId, estimateId: "estimate-a", estimateVersion: 2, estimateReviewRoundId: "approved-round", sourceSectionId: "basket-a", sourceLineItemKey: line.sourceLineItemKey, roomName: "Living", itemName: "Cabinet", description: "Install cabinet", scopeType: "execution", status: "in_progress", version: 1, progress: 40, currentRound: 1, note: "Working", targetDate: "2026-11-10" } as any);
    await VendorExecutionStateModel.collection.insertOne({ _id: assignmentId, assignmentId, projectId: "project-a", vendorId: "vendor-a", workflowVersion: 1, version: 2, executionRound: 1, status: "in_progress", progress: 40, hold: null, schedule: { startDate: "2026-10-25", finishDate: "2026-11-10", revision: 1, confirmedAt: now, confirmedById: pm.id }, roundStartedAt: now, createdAt: now, updatedAt: now } as any);
  }
  await ProcurementBasketAwardModel.collection.insertOne({ _id: "award-a", projectId: "project-a", status: "issued", issuedPurchaseOrderId: "order-a", currentProposalRevisionId: "proposal-a", vendorId: "vendor-a" } as any);
  await ProcurementBasketAwardRevisionModel.collection.insertOne({ _id: "proposal-a", awardId: "award-a", projectId: "project-a", vendorId: "vendor-a", programManagerId: site.id, designerId: designer.id, requiredSlots: ["program_manager", "designer"], milestones: [{ id: "progress_50", name: "Progress 50%", amountPaise: 10000, reviewerSlots: ["program_manager", "designer"] }] } as any);
});

async function noticeInput(kind = "quality") { const panel = await vendors.vendors(pm, "project-a"); return { expectedVersion: 0, idempotencyKey: key(), recordId: `notice-${serial}`, vendorId: "vendor-a", sourceToken: panel.items[0]!.sourceToken, kind, reason: "The installation needs inspection", evidenceIds: [] }; }
async function saveDraft(answer = "pass", evidenceIds: string[] = []) {
  const candidate = (await quality.quality(pm, "project-a")).items[0]!;
  return quality.saveAudit(pm, "project-a", candidate.id, { action: "save", expectedVersion: candidate.version, idempotencyKey: key(), orderId: "order-a", basketId: "basket-a", sourceToken: candidate.sourceToken, week: "2026-10-26", answers: [{ id: parameter.id, answer, reason: answer === "fail" ? "Loose fixing needs repair" : null, evidenceIds }] });
}
async function addPhoto(entityId: string) { await ProjectManagerEvidenceModel.collection.insertOne({ _id: "photo-a", projectId: "project-a", entityId, kind: "image", mimeType: "image/jpeg", storageReference: "opaque-fixture", byteSize: 1, createdAt: now } as any); }

describe("PM vendor and quality persistence", () => {
  it("retains evidence added during notice resolution in reads and immutable action history", async () => {
    const notice = await vendors.createNotice(pm, "project-a", await noticeInput());
    await addPhoto(notice.id);
    const result = await vendors.actNotice(pm, "project-a", notice.id, { action: "resolve", expectedVersion: notice.version, idempotencyKey: key(), reason: "Repair inspected with photo evidence", evidenceIds: ["photo-a"] });
    expect(result.evidenceIds).toEqual(["photo-a"]);
    expect((await vendors.vendors(pm, "project-a")).items.find(row => row.id === notice.id)?.evidenceIds).toEqual(["photo-a"]);
    expect((await ProjectManagerEventModel.findOne({ entityId: notice.id, action: "resolve" }).lean())?.result.evidenceIds).toEqual(["photo-a"]);
  });
  it("scopes reads and persists notices once with current authorization before replay", async () => {
    await expect(vendors.vendors(other, "project-a")).rejects.toMatchObject({ status: 404 });
    const input = await noticeInput(); const first = await vendors.createNotice(pm, "project-a", input); const replay = await vendors.createNotice(pm, "project-a", input);
    expect(replay.id).toBe(first.id); expect(await ProjectVendorNoticeModel.countDocuments()).toBe(1); expect(await ProjectManagerEventModel.countDocuments()).toBe(1);
    await ProjectModel.updateOne({ _id: "project-a" }, { $set: { programManagerId: other.id } });
    await expect(vendors.createNotice(pm, "project-a", input)).rejects.toMatchObject({ status: 404 });
  });
  it("rolls back every hold and notice when any selected assignment is stale", async () => {
    const input = { ...await noticeInput("stop_work"), reviewDate: "2026-10-30", assignments: [{ assignmentId: "work-line-a", expectedVersion: 2 }, { assignmentId: "work-line-b", expectedVersion: 1 }] };
    await expect(vendors.createNotice(pm, "project-a", input)).rejects.toMatchObject({ status: 409 });
    expect(await ProjectVendorNoticeModel.countDocuments()).toBe(0); expect(await VendorExecutionEventModel.countDocuments({ action: "hold" })).toBe(0);
    expect((await VendorExecutionStateModel.findById("work-line-a").lean())!.hold).toBeNull();
    const result = await vendors.createNotice(pm, "project-a", { ...input, assignments: input.assignments.map(row => ({ ...row, expectedVersion: 2 })) });
    expect(result.status).toBe("open"); expect(await VendorExecutionStateModel.countDocuments({ "hold.reason": input.reason })).toBe(2);
  });
  it("serializes duplicate create commands and retains notice history when an order is cancelled", async () => {
    const input = await noticeInput();
    const [first, repeated] = await Promise.all([vendors.createNotice(pm, "project-a", input), vendors.createNotice(pm, "project-a", input)]);
    expect(first.id).toBe(repeated.id); expect(await ProjectVendorNoticeModel.countDocuments()).toBe(1);
    await ProjectPurchaseOrderModel.updateOne({ _id: "order-a" }, { $set: { cancelledAt: now, status: "cancelled" } });
    const panel = await vendors.vendors(pm, "project-a"); expect(panel.items[0]?.status).toBe("historical"); expect(panel.items.find(row => row.id === first.id)?.ownerName).toBe("Fixture contractor"); expect(panel.sources).toHaveLength(0);
  });
  it("allows only the consolidated issued reviewer to certify and never labels recorded costs Paid", async () => {
    await FinanceLedgerEntryModel.collection.insertOne({ _id: "cost-a", projectId: "project-a", purchaseOrderId: "order-a", type: "direct_spend", expenseClass: "procurement", status: "posted", amountPaise: 6000 } as any);
    const panel = await vendors.vendors(procurement, "project-a"); const source = panel.sources.find(row => row.id === "order-a:progress_50")!;
    const record = await vendors.createCertification(procurement, "project-a", { expectedVersion: 0, idempotencyKey: key(), recordId: "cert-a", orderId: "order-a", milestoneId: "progress_50", sourceToken: source.sourceToken, reason: "Work is ready for milestone inspection" });
    const decision = { expectedVersion: record.version, idempotencyKey: key(), action: "certify", sourceToken: record.sourceToken, reason: "Inspected current milestone evidence" };
    await expect(vendors.actCertification(other, "project-a", record.id, decision)).rejects.toMatchObject({ status: 404 });
    const reviewed = await vendors.actCertification(site, "project-a", record.id, decision); expect(reviewed.status).toBe("partially_certified");
    const complete = await vendors.actCertification(designer, "project-a", record.id, { ...decision, expectedVersion: reviewed.version, idempotencyKey: key() });
    expect(complete.status).toBe("certified"); expect(complete.facts.find(row => row.label === "Payment")?.value).toBe("Not available from payment records");
    expect(await FinanceLedgerEntryModel.countDocuments()).toBe(1);
  });
  it("requires reconciliation after a frozen Site Manager reviewer is reassigned", async () => {
    const panel = await vendors.vendors(procurement, "project-a"); const source = panel.sources.find(row => row.id === "order-a:progress_50")!;
    const record = await vendors.createCertification(procurement, "project-a", { expectedVersion: 0, idempotencyKey: key(), recordId: "cert-a", orderId: "order-a", milestoneId: "progress_50", sourceToken: source.sourceToken, reason: "Ready for milestone inspection" });
    const replacement = actor("site-b", "site_manager"); await UserModel.create({ _id: replacement.id, name: replacement.name, role: replacement.role, email: replacement.email, emailNormalized: replacement.email, passwordHash: "fixture-only", active: true });
    await ProjectWorkflowTaskModel.updateOne({ _id: "site-task" }, { $set: { assigneeUserId: replacement.id } });
    await ProjectModel.updateOne({ _id: "project-a" }, { $set: { programManagerId: replacement.id } });
    await expect(vendors.actCertification(site, "project-a", record.id, { expectedVersion: record.version, idempotencyKey: key(), action: "certify", sourceToken: record.sourceToken, reason: "Old reviewer cannot certify" })).rejects.toMatchObject({ status: 404 });
    await expect(vendors.actCertification(replacement, "project-a", record.id, { expectedVersion: record.version, idempotencyKey: key(), action: "certify", sourceToken: record.sourceToken, reason: "Replacement cannot inherit old approval" })).rejects.toMatchObject({ status: 409 });
    expect((await ProjectPaymentCertificationModel.findById(record.id).lean())!.decisions).toHaveLength(0);
  });
  it("does not sign missing evidence and preserves signed findings with a separate correction", async () => {
    const draft = await saveDraft("fail"); const sign = { expectedVersion: draft.version, idempotencyKey: key(), sourceToken: draft.sourceToken, reason: "Weekly inspection completed with findings" };
    await expect(quality.signAudit(pm, "project-a", draft.id, sign)).rejects.toMatchObject({ status: 409 });
    await addPhoto(draft.id); const saved = await saveDraft("fail", ["photo-a"]);
    const signed = await quality.signAudit(pm, "project-a", draft.id, { ...sign, expectedVersion: saved.version }); expect(signed.status).toBe("signed_with_findings");
    await expect(saveDraft()).rejects.toMatchObject({ status: 409 });
    const correction = await quality.saveAudit(pm, "project-a", draft.id, { action: "correct", expectedVersion: signed.version, idempotencyKey: key(), reason: "Reinspect after repairing loose fixing" });
    expect(correction.id).not.toBe(signed.id); expect(correction.status).toBe("draft"); expect((await ProjectQualityAuditModel.findById(signed.id).lean())!.status).toBe("signed");
  });
  it("allows a new audit for a reissued order in the same week without changing the signed prior revision", async () => {
    const draft = await saveDraft("fail"); await addPhoto(draft.id); const saved = await saveDraft("fail", ["photo-a"]);
    const signed = await quality.signAudit(pm, "project-a", saved.id, { expectedVersion: saved.version, idempotencyKey: key(), sourceToken: saved.sourceToken, reason: "Inspected original issued package" });
    const original = await ProjectQualityAuditModel.findById(signed.id).lean();
    const priorOrder = await ProjectPurchaseOrderRevisionModel.findById("order-revision-a").lean();
    await ProjectPurchaseOrderRevisionModel.collection.insertOne({ ...priorOrder, _id: "order-revision-b", revision: 2 } as any);
    await ProjectPurchaseOrderModel.updateOne({ _id: "order-a" }, { $set: { approvedRevisionId: "order-revision-b", approvedRevision: 2 } });
    const candidate = (await quality.quality(pm, "project-a")).items[0]!; expect(candidate.id).not.toBe(signed.id);
    const second = await quality.saveAudit(pm, "project-a", candidate.id, { action: "save", expectedVersion: 0, idempotencyKey: key(), orderId: "order-a", basketId: "basket-a", sourceToken: candidate.sourceToken, week: "2026-10-26", answers: [] });
    expect(second.status).toBe("draft"); expect(await ProjectQualityAuditModel.countDocuments()).toBe(2);
    expect(await ProjectQualityAuditModel.findById(signed.id).lean()).toEqual(original);
    expect((await quality.quality(pm, "project-a")).items.find(row => row.id === signed.id)).toMatchObject({ status: "historical_signed_with_findings", severity: "neutral" });
  });
  it("keeps findings active through a correction draft and retires only the superseded signed finding", async () => {
    const draft = await saveDraft("fail"); await addPhoto(draft.id); const saved = await saveDraft("fail", ["photo-a"]);
    const signed = await quality.signAudit(pm, "project-a", saved.id, { expectedVersion: saved.version, idempotencyKey: key(), sourceToken: saved.sourceToken, reason: "Signed original findings" });
    const original = await ProjectQualityAuditModel.findById(signed.id).lean();
    const correction = await quality.saveAudit(pm, "project-a", signed.id, { action: "correct", expectedVersion: signed.version, idempotencyKey: key(), reason: "Inspect repaired fixing" });
    expect((await quality.quality(pm, "project-a")).items.find(row => row.id === signed.id)).toMatchObject({ status: "signed_with_findings", severity: "warning" });
    await ProjectManagerEvidenceModel.collection.insertOne({ _id: "correction-photo", projectId: "project-a", entityId: correction.id, kind: "image", mimeType: "image/jpeg", storageReference: "opaque-correction", byteSize: 1, createdAt: now } as any);
    const correctedDraft = await quality.saveAudit(pm, "project-a", correction.id, { action: "save", expectedVersion: correction.version, idempotencyKey: key(), orderId: "order-a", basketId: "basket-a", sourceToken: correction.sourceToken, week: "2026-10-26", answers: [{ id: parameter.id, answer: "pass", evidenceIds: ["correction-photo"] }] });
    const passing = await quality.signAudit(pm, "project-a", correction.id, { expectedVersion: correctedDraft.version, idempotencyKey: key(), sourceToken: correction.sourceToken, reason: "Repaired fixing passed reinspection" });
    expect(passing).toMatchObject({ status: "signed", severity: "success" });
    const rows = (await quality.quality(pm, "project-a")).items;
    expect(rows.find(row => row.id === signed.id)).toMatchObject({ status: "corrected", severity: "neutral", actions: [] });
    expect(rows.find(row => row.id === signed.id)?.checks?.[0]).toMatchObject({ answer: "fail", reason: "Loose fixing needs repair" });
    expect(rows.filter(row => row.severity === "warning")).toHaveLength(0);
    expect(await ProjectQualityAuditModel.findById(signed.id).lean()).toEqual(original);
  });
  it("exposes prior certification decision evidence to the next configured reviewer", async () => {
    const panel = await vendors.vendors(procurement, "project-a"); const source = panel.sources.find(row => row.id === "order-a:progress_50")!;
    const record = await vendors.createCertification(procurement, "project-a", { expectedVersion: 0, idempotencyKey: key(), recordId: "cert-evidence", orderId: "order-a", milestoneId: "progress_50", sourceToken: source.sourceToken, reason: "Milestone ready for inspection" });
    await addPhoto(record.id);
    const reviewed = await vendors.actCertification(site, "project-a", record.id, { expectedVersion: record.version, idempotencyKey: key(), action: "certify", sourceToken: record.sourceToken, reason: "Verified work with attached photograph", evidenceIds: ["photo-a"] });
    expect(reviewed.evidenceIds).toEqual(["photo-a"]);
    const next = (await vendors.vendors(designer, "project-a", { kind: "certification" })).items.find(row => row.id === record.id)!;
    expect(next.evidenceIds).toEqual(["photo-a"]); expect(next.actions.map(action => action.id)).toContain("certify");
    const final = await vendors.actCertification(designer, "project-a", record.id, { expectedVersion: reviewed.version, idempotencyKey: key(), action: "certify", sourceToken: record.sourceToken, reason: "Checked prior reviewer photograph", evidenceIds: ["photo-a"] });
    expect(final.evidenceIds).toEqual(["photo-a"]);
    expect((await ProjectPaymentCertificationModel.findById(record.id).lean())!.decisions.map((decision: any) => decision.evidenceIds)).toEqual([["photo-a"], ["photo-a"]]);
  });
  it("rejects changed checklist and cross-record evidence without rewriting prior drafts", async () => {
    const draft = await saveDraft(); await addPhoto("other-record");
    await expect(saveDraft("pass", ["photo-a"])).rejects.toMatchObject({ status: 409 });
    const nextParameters = [{ ...parameter, label: "Changed fixing check" }];
    await AiEstimatorKnowledgeBasketQualityRevisionModel.collection.insertOne({ _id: "quality-revision-b", basketId: "basket-a", revisionNumber: 2, parameters: nextParameters, contentDigest: basketQualityDigest("basket-a", nextParameters), createdAt: now } as any);
    await AiEstimatorKnowledgeBasketModel.updateOne({ _id: "basket-a" }, { $set: { qualityRevisionId: "quality-revision-b" } });
    await expect(quality.signAudit(pm, "project-a", draft.id, { expectedVersion: draft.version, idempotencyKey: key(), sourceToken: draft.sourceToken, reason: "Attempt stale signature" })).rejects.toMatchObject({ status: 409 });
    const rows = (await quality.quality(pm, "project-a")).items; expect(rows.some(row => row.id === draft.id && row.status === "source_changed")).toBe(true); expect(rows[0]!.checks?.[0]?.label).toBe("Changed fixing check");
    expect((await ProjectQualityAuditModel.findById(draft.id).lean())!.parameters[0].label).toBe("Check fixing");
  });
  it("paginates every vendor record past the old cap with exact filtered totals and no nested truncation", async () => {
    await ProjectVendorNoticeModel.collection.insertMany(Array.from({ length: 207 }, (_, index) => ({ _id: `bulk-notice-${String(index).padStart(3, "0")}`, projectId: "project-a", vendorId: "vendor-a", vendorName: "Fixture contractor", sourceToken: "fixture-token", kind: index === 206 ? "stop_work" : "quality", reason: "Review installation", assignmentIds: [], evidenceIds: [], reviewDate: null, version: 1, status: "open", createdAt: now, createdById: pm.id })) as any);
    const all: string[] = [];
    for (const offset of [0, 100, 200]) {
      const page = await vendors.vendors(pm, "project-a", { kind: "vendor_notice", limit: 100, offset });
      expect(page.total).toBe(207); expect(page.items.length).toBe(offset === 200 ? 7 : 100); expect(page.items.every(row => row.children === undefined)).toBe(true);
      all.push(...page.items.map(row => row.id));
      if (offset === 200) expect(page.items.some(row => row.id === "bulk-notice-206" && row.severity === "critical")).toBe(true);
    }
    expect(new Set(all).size).toBe(207);
    const empty = await vendors.vendors(pm, "project-a", { vendorId: "unassigned-vendor", limit: 10 }); expect(empty.total).toBe(0); expect(empty.items).toHaveLength(0);
    await expect(vendors.vendors(pm, "project-a", { limit: 101 })).rejects.toMatchObject({ status: 400 });
  });
  it("paginates current quality candidates together with all historical audits past the old cap", async () => {
    const base = (await quality.quality(pm, "project-a")).items[0]!;
    await ProjectQualityAuditModel.collection.insertMany(Array.from({ length: 105 }, (_, index) => ({ _id: `old-audit-${String(index).padStart(3, "0")}`, projectId: "project-a", orderId: "order-a", orderRevisionId: "old-order", orderNumber: "PO-A", vendorId: "vendor-a", basketId: "basket-a", basketName: "Carpentry", checklistRevisionId: `old-checklist-${index}`, checklistRevisionNumber: 1, sourceToken: `old-token-${index}`, parameters: [parameter], answers: [], status: "draft", version: 1, week: "2026-10-19", correctionOf: null, createdAt: now, createdById: pm.id })) as any);
    const first = await quality.quality(pm, "project-a", { limit: 100, offset: 0 });
    const second = await quality.quality(pm, "project-a", { limit: 100, offset: 100 });
    expect(first.total).toBe(106); expect(second.total).toBe(106); expect(first.items).toHaveLength(100); expect(second.items).toHaveLength(6); expect(first.items[0]?.id).toBe(base.id);
    expect(new Set([...first.items, ...second.items].map(row => row.id)).size).toBe(106); expect(second.items.every(row => row.status === "source_changed")).toBe(true);
    await expect(quality.quality(pm, "project-a", { offset: -1 })).rejects.toMatchObject({ status: 400 });
  });
});
