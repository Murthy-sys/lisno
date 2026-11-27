import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { seedLifecycleFixture, lifecycleActor, lifecycleAt } from "./fixtures/procurement-lifecycle.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createProcurementPaymentsService, readPaymentReadiness, listPaymentAlertSources } from "../src/services/procurement-payments.service.js";
import { lcTransaction } from "../src/services/procurement-lifecycle/transaction.js";
import { readPaymentCertificationSource } from "../src/services/project-manager/vendors.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { ProcurementBasketAwardModel, ProcurementBasketAwardRevisionModel } from "../src/models/ProcurementBasketTender.js";
import { ProcurementBasketInvoiceAssessmentModel, ProcurementBasketInvoiceAssessmentRevisionModel } from "../src/models/ProcurementBasketInvoiceAssessment.js";
import { ProjectPaymentCertificationModel } from "../src/models/ProjectPaymentCertification.js";
import { ProcurementLifecycleStateModel } from "../src/models/ProcurementLifecycleState.js";
import { ProcurementLifecycleCommandModel } from "../src/models/ProcurementLifecycleCommand.js";
import { ProcurementLifecycleEvidenceModel } from "../src/models/ProcurementLifecycleEvidence.js";
import { ProcurementPaymentAccountModel } from "../src/models/ProcurementPaymentAccount.js";
import { ProcurementPaymentAuthorizationModel } from "../src/models/ProcurementPaymentAuthorization.js";
import { ProcurementPaymentObligationModel } from "../src/models/ProcurementPaymentObligation.js";
import { ProcurementPaymentTransactionModel } from "../src/models/ProcurementPaymentTransaction.js";
import { ProcurementPaymentCorrectionModel } from "../src/models/ProcurementPaymentCorrection.js";
import { ProcurementPaymentReconciliationModel } from "../src/models/ProcurementPaymentReconciliation.js";
import { ProcurementPaymentRetentionModel } from "../src/models/ProcurementPaymentRetention.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { FinanceLedgerEntryModel } from "../src/models/FinanceLedgerEntry.js";
import { ProjectFinanceBucketModel } from "../src/models/ProjectFinanceBucket.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let key = 0;
const service = createProcurementPaymentsService({ audit: createAuditService(createMemoryRepository()), now: () => lifecycleAt });
const paymentModels = [ProcurementLifecycleCommandModel, ProcurementLifecycleEvidenceModel, ProcurementPaymentAccountModel, ProcurementPaymentAuthorizationModel, ProcurementPaymentObligationModel, ProcurementPaymentTransactionModel, ProcurementPaymentCorrectionModel, ProcurementPaymentReconciliationModel, ProcurementPaymentRetentionModel, AuditEventModel];
beforeAll(async () => { replica = await startMongoReplicaSet("procurement-payments"); for (const model of paymentModels) await model.syncIndexes(); }, 120000);
beforeEach(async () => { await replica.clear(); key = 0; });
afterAll(async () => { await replica?.stop(); });

async function fixture(suffix = "a", total = 60000, legacy = false) {
  const f = await seedLifecycleFixture(suffix);
  const awardId = `${f.orderId}-award`, proposalId = `${awardId}-proposal`, assessmentId = `${f.orderId}-assessment`, assessmentRevisionId = `${assessmentId}-revision`;
  const milestones = [{ id: "advance", name: "Advance", amountPaise: total / 2, reviewerSlots: ["procurement"] }, { id: "final", name: "Final", amountPaise: total / 2, reviewerSlots: ["procurement"] }, { id: "zero", name: "Zero milestone", amountPaise: 0, reviewerSlots: [] }];
  await ProjectPurchaseOrderModel.collection.updateOne({ _id: f.orderId }, { $set: { tenderAwardId: awardId, approvedTotalPaise: total, version: 1 } });
  await ProjectPurchaseOrderRevisionModel.collection.updateOne({ _id: f.revisionId }, { $set: { tenderAwardId: awardId, totalPaise: total } });
  await ProcurementBasketAwardModel.collection.insertOne({ _id: awardId, projectId: f.projectId, status: "issued", issuedPurchaseOrderId: f.orderId, currentProposalRevisionId: proposalId } as any);
  await ProcurementBasketAwardRevisionModel.collection.insertOne({ _id: proposalId, awardId, projectId: f.projectId, vendorId: f.vendorId, milestones } as any);
  await ProcurementBasketInvoiceAssessmentModel.collection.insertOne({ _id: assessmentId, projectId: f.projectId, orderId: f.orderId, currentRevisionId: assessmentRevisionId } as any);
  await ProcurementBasketInvoiceAssessmentRevisionModel.collection.insertOne({ _id: assessmentRevisionId, assessmentId, projectId: f.projectId, orderId: f.orderId, awardId, invoiceTotalPaise: total, tdsPaise: total / 10, netPayablePaise: total * 9 / 10 } as any);
  await ProcurementLifecycleStateModel.collection.insertOne({ _id: `${f.projectId}-state`, projectId: f.projectId, version: 1, activatedAt: new Date(lifecycleAt.getTime() + (legacy ? 1000 : -1000)), policy: { timezone: "Asia/Kolkata", reviewIntervalDays: 7, inspectionCount: 2 }, adoption: legacy ? "existing" : "new" } as any);
  for (const milestone of milestones.filter(row => row.amountPaise)) {
    const source = await lcTransaction(session => readPaymentCertificationSource(f.projectId, f.orderId, milestone.id, session));
    await ProjectPaymentCertificationModel.collection.insertOne({ _id: `${f.orderId}-cert-${milestone.id}`, projectId: f.projectId, orderId: f.orderId, orderRevisionId: f.revisionId, proposalRevisionId: proposalId, milestoneId: milestone.id, amountPaise: milestone.amountPaise, sourceToken: source.token, status: "certified" } as any);
  }
  return { ...f, total, assessmentRevisionId, assessmentId, proposalId, milestones };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function order(f: Fixture, actor = f.finance) { return (await service.list(actor, f.projectId)).items[0]!; }
async function command(f: Fixture, input: Record<string, unknown>, actor = f.finance) {
  const current = await order(f, actor);
  return service.command(actor, f.projectId, { orderId: f.orderId, expectedVersion: current.version, sourceDigest: current.sourceDigest, idempotencyKey: `payment-command-${++key}`, ...input });
}
async function ready(f: Fixture) {
  await command(f, { action: "confirm_dates", dates: ["advance", "final"].map(milestoneId => ({ milestoneId, dueDate: "2026-11-26" })), reason: "Confirmed vendor terms" });
  return command(f, { action: "authorize", basis: "invoice", assessmentRevisionId: f.assessmentRevisionId, allocations: f.milestones.map(row => ({ milestoneId: row.id, grossPaise: row.amountPaise, withholdingPaise: row.amountPaise / 10, netPaise: row.amountPaise * 9 / 10 })), reason: "Finance assessed invoice allocation" });
}
async function recordInput(f: Fixture, id: string, amountPaise: number, milestoneId = "advance", extra: Record<string, unknown> = {}) {
  const evidenceId = `${id}-evidence`;
  await ProcurementLifecycleEvidenceModel.collection.insertOne({ _id: evidenceId, projectId: f.projectId, entityId: id, purpose: "payment", uploaderId: f.buyer.id, referenceEpoch: 0 } as any);
  return { action: "record", transactionId: id, amountPaise, allocations: [{ milestoneId, amountPaise }], paidAt: lifecycleAt.toISOString(), method: "bank_transfer", reference: `Bank ${id}`, evidenceIds: [evidenceId], ...extra };
}

describe("procurement external payment integrity", () => {
  it("separates gross, withholding and net across unequal projects; reads do not initialize money", async () => {
    const a = await fixture("a", 60000), b = await fixture("b", 140000);
    await FinanceLedgerEntryModel.collection.insertMany([{ _id: "cost-a", projectId: a.projectId, bucketId: "bucket-a", amountPaise: 31000 }, { _id: "cost-b", projectId: b.projectId, bucketId: "bucket-b", amountPaise: 73000 }] as any);
    await ProjectFinanceBucketModel.collection.insertMany([{ _id: "bucket-a", projectId: a.projectId, directSpendPaise: 31000 }, { _id: "bucket-b", projectId: b.projectId, directSpendPaise: 73000 }] as any);
    const ledgerBefore = await FinanceLedgerEntryModel.collection.find({}).sort({ _id: 1 }).toArray();
    const bucketsBefore = await ProjectFinanceBucketModel.collection.find({}).sort({ _id: 1 }).toArray();
    const before = await order(a); expect(before.paidPaise).toBe(0); expect(before.remainingPaise).toBeNull();
    expect(await ProcurementPaymentAccountModel.countDocuments()).toBe(0);
    await expect(service.list(b.buyer, a.projectId)).rejects.toMatchObject({ status: 404 });
    const aReady = await ready(a), bReady = await ready(b);
    expect([aReady.contractGrossPaise, aReady.withholdingPaise, aReady.authorizedNetPaise]).toEqual([60000, 6000, 54000]);
    expect(bReady.authorizedNetPaise).toBe(126000);
    expect((await service.list(a.finance, a.projectId, { status: "overdue", limit: 1 })).total).toBe(1);
    expect((await service.list(a.finance, a.projectId, { status: "paid" })).total).toBe(0); expect(aReady.milestones[2]?.timing).toBe("no_payment_required");
    const partial = await command(a, await recordInput(a, "partial-a", 17000), a.buyer);
    expect(await FinanceLedgerEntryModel.collection.find({}).sort({ _id: 1 }).toArray()).toEqual(ledgerBefore);
    expect(await ProjectFinanceBucketModel.collection.find({}).sort({ _id: 1 }).toArray()).toEqual(bucketsBefore);
    expect(partial.remainingPaise).toBe(37000); expect((await order(b)).paidPaise).toBe(0);
    expect(await lcTransaction(s => readPaymentReadiness(a.projectId, s, lifecycleAt))).toMatchObject({ ready: false });
  });

  it("replays authorized identical commands, rejects stale writes and concurrent overspend, and preserves reversal history", async () => {
    const f = await fixture(); await ready(f); const current = await order(f);
    const payload = { ...await recordInput(f, "payment-one", 27000), orderId: f.orderId, expectedVersion: current.version, sourceDigest: current.sourceDigest, idempotencyKey: "payment-original-key" };
    const first = await service.command(f.buyer, f.projectId, payload);
    expect(await service.command(f.buyer, f.projectId, payload)).toEqual(first);
    await expect(service.command(f.buyer, f.projectId, { ...payload, amountPaise: 26000 })).rejects.toMatchObject({ status: 409 });
    await command(f, { action: "reverse", transactionId: "payment-one", reason: "Bank amount was entered incorrectly" });
    expect((await order(f)).paidPaise).toBe(0);
    await command(f, await recordInput(f, "payment-replacement", 17000, "advance", { reference: "Bank payment-one", replacesTransactionId: "payment-one" }));
    const state = await order(f); const common = { orderId: f.orderId, expectedVersion: state.version, sourceDigest: state.sourceDigest };
    const attempts = await Promise.allSettled(["race-one", "race-two"].map(async id => service.command(f.buyer, f.projectId, { ...common, ...await recordInput(f, id, 10000), idempotencyKey: `concurrent-${id}` })));
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await order(f)).milestones[0]?.remainingPaise).toBe(0);
    const history = await service.history(f.finance, f.projectId, { limit: 2, offset: 1 });
    expect(history.total).toBe(4); expect(history.items).toHaveLength(2);
    expect(await ProcurementPaymentTransactionModel.findById("payment-one").lean()).toMatchObject({ amountPaise: 27000 });
    await ProjectWorkflowTaskModel.updateOne({ _id: `${f.projectId}-procurement` }, { $set: { assigneeUserId: "replacement-person" } });
    await expect(service.command(f.buyer, f.projectId, payload)).rejects.toMatchObject({ status: 404 });
  });

  it("requires current certification and assessment, preserves overdue dates through proposals, and rejects cross-record evidence", async () => {
    const f = await fixture(); await ready(f);
    await command(f, { action: "propose_dates", dates: [{ milestoneId: "advance", dueDate: "2026-12-20" }], reason: "Vendor requested a later date" }, f.buyer);
    expect((await order(f)).milestones[0]).toMatchObject({ dueDate: "2026-11-26", originalDueDate: "2026-11-26", proposedDueDate: "2026-12-20", timing: "overdue" });
    const input = await recordInput(f, "evidence-parent", 1000);
    await expect(command(f, { ...input, transactionId: "wrong-parent" })).rejects.toMatchObject({ status: 409 });
    await ProjectPaymentCertificationModel.collection.updateOne({ _id: `${f.orderId}-cert-advance` }, { $set: { status: "rejected" } });
    await expect(command(f, input)).rejects.toMatchObject({ status: 409 });
    await ProjectPaymentCertificationModel.collection.updateOne({ _id: `${f.orderId}-cert-advance` }, { $set: { status: "certified" } });
    await ProcurementBasketInvoiceAssessmentModel.collection.updateOne({ _id: f.assessmentId }, { $set: { currentRevisionId: "missing-revision" } });
    await expect(command(f, input)).rejects.toMatchObject({ status: 409 });
    expect(await ProcurementPaymentTransactionModel.countDocuments()).toBe(0);
  });

  it("keeps adopted-project balances unknown until evidenced opening reconciliation and blocks pending corrections", async () => {
    const f = await fixture("legacy", 60000, true); await ready(f);
    expect((await order(f)).paidPaise).toBeNull();
    const input = await recordInput(f, "legacy-new-payment", 5000);
    await expect(command(f, input)).rejects.toMatchObject({ status: 409 });
    await expect(command(f, { action: "reconcile", reconciliationId: "opening-record", openingBalances: [{ milestoneId: "advance", amountPaise: 12000 }], evidenceIds: [], reason: "Verified historical transfer" })).rejects.toMatchObject({ status: 409 });
    await ProcurementLifecycleEvidenceModel.collection.insertOne({ _id: "opening-proof", projectId: f.projectId, entityId: "opening-record", purpose: "payment" } as any);
    const reconciled = await command(f, { action: "reconcile", reconciliationId: "opening-record", openingBalances: [{ milestoneId: "advance", amountPaise: 12000 }], evidenceIds: ["opening-proof"], reason: "Verified historical transfer" });
    expect(reconciled.paidPaise).toBe(12000); await command(f, input);
    await command(f, { action: "request_correction", transactionId: "legacy-new-payment", reason: "Review the bank transfer amount" }, f.buyer);
    const alerts = await lcTransaction(s => listPaymentAlertSources(f.projectId, s, lifecycleAt)); expect(alerts.some(row => row.kind === "payment_correction")).toBe(true);
    const history = await service.history(f.finance, f.projectId); expect(history.items.some(row => row.kind === "opening_reconciliation" && row.amountPaise === 12000)).toBe(true);
    await expect(command(f, { action: "reconcile", reconciliationId: "overwrite-opening", openingBalances: [], evidenceIds: [], reason: "Try to erase history" })).rejects.toMatchObject({ status: 409 });
  });

  it("requires separate Finance retention approval and Admin acknowledgement, then permits settlement after signoff", async () => {
    const f = await fixture(); await ready(f);
    await command(f, await recordInput(f, "advance-full", 27000));
    const retained = await command(f, { action: "approve_retention", milestoneId: "final", amountPaise: 27000, dueDate: "2026-12-20", ownerId: f.finance.id, reason: "Warranty retention agreed with vendor" });
    expect((await lcTransaction(s => readPaymentReadiness(f.projectId, s, lifecycleAt))).ready).toBe(false);
    const admin: PublicUser = lifecycleActor("payment-admin", "super_admin"); await UserModel.collection.insertOne({ _id: admin.id, ...admin, active: true } as any);
    const ack = { action: "acknowledge_retention", retentionId: retained.milestones[1]!.retention!.id, reason: "Reviewed future retained liability" };
    await expect(command(f, ack)).rejects.toMatchObject({ status: 404 }); await command(f, ack, admin);
    expect((await lcTransaction(s => readPaymentReadiness(f.projectId, s, lifecycleAt))).ready).toBe(true);
    await ProjectModel.collection.updateOne({ _id: f.projectId }, { $set: { status: "completed", completionDecisionId: "immutable-signoff" } });
    const paid = await command(f, await recordInput(f, "retention-settled", 27000, "final")); expect(paid.remainingPaise).toBe(0);
    await command(f, { action: "reverse", transactionId: "advance-full", reason: "Correct a pre-closeout bank reference" });
    expect((await lcTransaction(s => readPaymentReadiness(f.projectId, s, lifecycleAt))).ready).toBe(false);
    await command(f, await recordInput(f, "post-closeout-correction", 27000, "advance", { reference: "Corrected advance bank reference", replacesTransactionId: "advance-full" }));
    expect((await ProjectModel.findById(f.projectId).lean())?.completionDecisionId).toBe("immutable-signoff");
  });
  it("reconciles advance cash into invoice allocations without counting it twice and rejects assessment reductions below payments", async () => {
    const f = await fixture();
    const pointer = await ProcurementBasketInvoiceAssessmentModel.collection.findOne({ _id: f.assessmentId });
    await ProcurementBasketInvoiceAssessmentModel.collection.deleteOne({ _id: f.assessmentId });
    await command(f, { action: "confirm_dates", dates: ["advance", "final"].map(milestoneId => ({ milestoneId, dueDate: "2026-11-27" })), reason: "Confirmed payment schedule" });
    await command(f, { action: "authorize", basis: "advance", assessmentRevisionId: null, allocations: [{ milestoneId: "advance", grossPaise: 20000, withholdingPaise: 0, netPaise: 20000 }], reason: "Finance approved pre-invoice advance" });
    await command(f, await recordInput(f, "pre-invoice", 19000));
    await ProcurementBasketInvoiceAssessmentModel.collection.insertOne(pointer!);
    expect((await order(f)).paidPaise).toBe(19000); expect((await order(f)).remainingPaise).toBeNull();
    const assessed = await ready(f); expect(assessed.paidPaise).toBe(19000); expect(assessed.remainingPaise).toBe(35000);
    const input = await recordInput(f, "multi-milestone", 10000, "advance", { allocations: [{ milestoneId: "advance", amountPaise: 8000 }, { milestoneId: "final", amountPaise: 2000 }] });
    const paid = await command(f, input); expect(paid.paidPaise).toBe(29000); expect(paid.milestones[0]?.remainingPaise).toBe(0);
    await ProcurementBasketInvoiceAssessmentRevisionModel.collection.updateOne({ _id: f.assessmentRevisionId }, { $set: { invoiceTotalPaise: 20000, tdsPaise: 2000, netPayablePaise: 18000 } });
    await expect(command(f, { action: "authorize", basis: "invoice", assessmentRevisionId: f.assessmentRevisionId, allocations: [{ milestoneId: "advance", grossPaise: 10000, withholdingPaise: 1000, netPaise: 9000 }, { milestoneId: "final", grossPaise: 10000, withholdingPaise: 1000, netPaise: 9000 }, { milestoneId: "zero", grossPaise: 0, withholdingPaise: 0, netPaise: 0 }], reason: "Reconcile revised invoice" })).rejects.toMatchObject({ status: 409 });
    expect(await ProcurementPaymentTransactionModel.countDocuments()).toBe(2);
  });

  it("rejects duplicate external references, inactive actors, and issued-order scope changes", async () => {
    const f = await fixture(); await ready(f);
    await command(f, await recordInput(f, "unique-reference", 1000));
    await expect(command(f, await recordInput(f, "duplicate-reference", 1000, "advance", { reference: "  bank   UNIQUE-reference  " }))).rejects.toMatchObject({ status: 409 });
    await UserModel.updateOne({ _id: f.buyer.id }, { $set: { active: false } });
    await expect(service.list(f.buyer, f.projectId)).rejects.toMatchObject({ status: 404 });
    await ProjectPurchaseOrderModel.collection.updateOne({ _id: f.orderId }, { $set: { cancelledAt: lifecycleAt } });
    const changed = await order(f); expect(changed.paidPaise).toBe(1000); expect(changed.sourceAvailable).toBe(false);
    await expect(command(f, await recordInput(f, "cancelled-order", 1000))).rejects.toMatchObject({ status: 409 });
  });

  it("consumes retention grants cumulatively before and after closeout without refilling them from ordinary reversals", async () => {
    const f = await fixture(); await ready(f);
    await command(f, await recordInput(f, "ordinary-preclose", 24300));
    await command(f, await recordInput(f, "other-milestone-paid", 27000, "final"));
    const approved = await command(f, { action: "approve_retention", milestoneId: "advance", amountPaise: 2700, dueDate: "2026-12-20", ownerId: f.finance.id, reason: "Retain the final vendor balance" });
    const retentionId = approved.milestones[0]!.retention!.id;
    const admin = lifecycleActor("retention-admin", "super_admin"); await UserModel.collection.insertOne({ _id: admin.id, ...admin, active: true } as any);
    await command(f, { action: "acknowledge_retention", retentionId, reason: "Acknowledge this exact retained grant" }, admin);
    const partial = await command(f, await recordInput(f, "retained-preclose", 1000), f.buyer);
    expect(partial.milestones[0]!.retention).toMatchObject({ id: retentionId, amountPaise: 2700, remainingPaise: 1700 });
    expect((await ProcurementPaymentTransactionModel.findById("retained-preclose").lean())!.allocations[0]).toMatchObject({ retentionId, retentionAmountPaise: 1000 });
    await ProjectModel.collection.updateOne({ _id: f.projectId }, { $set: { status: "completed", completionDecisionId: "retention-signoff" } });
    const settled = await command(f, await recordInput(f, "retained-postclose", 1700), f.buyer);
    expect(settled.milestones[0]!.retention!.remainingPaise).toBe(0);
    expect(settled.allowedActions).not.toContain("record");
    await command(f, { action: "reverse", transactionId: "ordinary-preclose", reason: "Correct the original bank reference" });
    const reopened = await order(f, f.buyer);
    expect(reopened.milestones[0]).toMatchObject({ remainingPaise: 24300, retention: { remainingPaise: 0 } });
    expect(reopened.allowedActions).not.toContain("record");
    const retry = await recordInput(f, "retention-overdraw", 100);
    await expect(command(f, retry, f.buyer)).rejects.toMatchObject({ status: 409 });
    await expect(command(f, retry)).rejects.toMatchObject({ status: 409 });
    await expect(command(f, { ...retry, replacesTransactionId: "ordinary-preclose" }, f.buyer)).rejects.toMatchObject({ status: 409 });
    const corrected = await command(f, await recordInput(f, "ordinary-corrected", 24300, "advance", { replacesTransactionId: "ordinary-preclose" }));
    expect(corrected.milestones[0]!.retention!.remainingPaise).toBe(0);
    expect((await ProcurementPaymentTransactionModel.findById("ordinary-corrected").lean())!.allocations[0]).toMatchObject({ retentionId: null, retentionAmountPaise: 0 });
    await command(f, { action: "reverse", transactionId: "retained-postclose", reason: "Correct the retained transfer reference" });
    expect((await order(f, f.buyer)).milestones[0]!.retention!.remainingPaise).toBe(1700);
    const resettled = await command(f, await recordInput(f, "retained-resettled", 1700), f.buyer);
    expect(resettled.milestones[0]!.retention!.remainingPaise).toBe(0);
    expect((await ProjectModel.findById(f.projectId).lean())!.completionDecisionId).toBe("retention-signoff");
  });

  it("appends evidenced opening corrections with CAS and reconciles effective payments while preserving original history", async () => {
    const f = await fixture("opening-chain", 60000, true); await ready(f);
    async function reconciliation(id: string, amountPaise: number, supersedesReconciliationId?: string) {
      const evidenceId = `${id}-proof`;
      await ProcurementLifecycleEvidenceModel.collection.insertOne({ _id: evidenceId, projectId: f.projectId, entityId: id, purpose: "payment" } as any);
      return { action: "reconcile", reconciliationId: id, openingBalances: [{ milestoneId: "advance", amountPaise }], evidenceIds: [evidenceId], reason: "Reconcile verified historical bank evidence", ...(supersedesReconciliationId ? { supersedesReconciliationId } : {}) };
    }
    const initial = await command(f, await reconciliation("opening-original", 12000));
    expect(initial.openingReconciliation).toEqual({ id: "opening-original", balances: [{ milestoneId: "advance", amountPaise: 12000 }] });
    const original = await ProcurementPaymentReconciliationModel.findById("opening-original").lean();
    await command(f, await recordInput(f, "after-opening", 5000));
    const correction = await reconciliation("opening-correction", 0, "opening-original");
    await expect(command(f, { ...correction, evidenceIds: [] })).rejects.toMatchObject({ status: 409 });
    await expect(command(f, { ...correction, supersedesReconciliationId: "another-project-opening" })).rejects.toMatchObject({ status: 409 });
    await expect(command(f, { ...correction, openingBalances: [{ milestoneId: "advance", amountPaise: 25000 }] })).rejects.toMatchObject({ status: 409 });
    const corrected = await command(f, { ...correction, openingBalances: [{ milestoneId: "advance", amountPaise: 11000 }] });
    expect(corrected.paidPaise).toBe(16000);
    expect(corrected.openingReconciliation!.id).toBe("opening-correction");
    expect(await ProcurementPaymentReconciliationModel.findById("opening-original").lean()).toEqual(original);
    const current = await order(f);
    const candidates = await Promise.all([reconciliation("opening-race-a", 9000, "opening-correction"), reconciliation("opening-race-b", 10000, "opening-correction")]);
    const results = await Promise.allSettled(candidates.map((candidate, index) => service.command(f.finance, f.projectId, { ...candidate, orderId: f.orderId, expectedVersion: current.version, sourceDigest: current.sourceDigest, idempotencyKey: `opening-race-key-${index}` })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const winner = await order(f); const winnerId = winner.openingReconciliation!.id;
    expect(await ProcurementPaymentReconciliationModel.countDocuments()).toBe(3);
    await expect(command(f, await reconciliation("opening-stale", 0, "opening-original"))).rejects.toMatchObject({ status: 409 });
    await ProjectModel.collection.updateOne({ _id: f.projectId }, { $set: { status: "completed", completionDecisionId: "opening-signoff" } });
    expect((await order(f)).allowedActions).toContain("reconcile");
    const afterClose = await command(f, await reconciliation("opening-after-close", 0, winnerId));
    expect(afterClose.paidPaise).toBe(5000);
    await ProjectPurchaseOrderModel.collection.updateOne({ _id: f.orderId }, { $set: { cancelledAt: lifecycleAt } });
    const unavailableSourceCorrection = await command(f, await reconciliation("opening-after-cancel", 1000, "opening-after-close"));
    expect(unavailableSourceCorrection.paidPaise).toBe(6000);
    expect(unavailableSourceCorrection.sourceAvailable).toBe(false);
    expect(await ProcurementPaymentReconciliationModel.findById("opening-after-cancel").lean()).toMatchObject({ supersedesReconciliationId: "opening-after-close", orderRevisionId: f.revisionId, vendorId: f.vendorId });
    const history = await service.history(f.finance, f.projectId);
    expect(history.items.filter(row => row.kind === "opening_reconciliation")).toHaveLength(5);
    expect(history.items.find(row => row.id === "opening-correction")).toMatchObject({ supersedesReconciliationId: "opening-original", amountPaise: 11000 });
    expect((await ProjectModel.findById(f.projectId).lean())!.completionDecisionId).toBe("opening-signoff");
  });

  it("does not permit an initial opening reconciliation after closeout or a Procurement replacement before closeout", async () => {
    const f = await fixture(); await ready(f);
    await command(f, await recordInput(f, "preclose-for-replacement", 1000));
    await command(f, { action: "reverse", transactionId: "preclose-for-replacement", reason: "Finance requested a reference correction" });
    await expect(command(f, await recordInput(f, "procurement-replacement", 1000, "advance", { replacesTransactionId: "preclose-for-replacement" }), f.buyer)).rejects.toMatchObject({ status: 409 });
    await ProjectModel.collection.updateOne({ _id: f.projectId }, { $set: { status: "completed" } });
    expect((await order(f)).allowedActions).not.toContain("reconcile");
    await expect(command(f, { action: "reconcile", reconciliationId: "closed-initial", openingBalances: [], evidenceIds: [], reason: "Try to initialize closed history" })).rejects.toMatchObject({ status: 409 });
    expect(await ProcurementPaymentReconciliationModel.countDocuments()).toBe(0);
  });

});
