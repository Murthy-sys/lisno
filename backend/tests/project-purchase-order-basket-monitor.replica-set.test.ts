import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/middleware/errors.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { FinanceLedgerEntryModel } from "../src/models/FinanceLedgerEntry.js";
import { ProcurementBasketAwardModel, ProcurementBasketAwardRevisionModel,
  ProcurementBasketBoqRevisionModel } from "../src/models/ProcurementBasketTender.js";
import { ProcurementBasketInvoiceAssessmentModel, ProcurementBasketInvoiceAssessmentRevisionModel }
  from "../src/models/ProcurementBasketInvoiceAssessment.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { UserModel } from "../src/models/User.js";
import { VendorWorkAssignmentModel } from "../src/models/VendorWorkAssignment.js";
import type { AuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createProjectPurchaseOrderBasketMonitorService } from "../src/services/project-purchase-order-basket-monitor.service.js";
import { createProjectPurchaseOrderInvoiceAssessmentService } from "../src/services/project-purchase-order-invoice-assessment.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const at = new Date("2026-10-05T00:00:00.000Z");
const buyer: PublicUser = { id: "buyer", name: "Buyer", email: "buyer@example.test", role: "procurement" };
const finance: PublicUser = { id: "finance", name: "Finance", email: "finance@example.test", role: "finance_head" };
const audit = { appendInMongoTransaction: vi.fn(async () => ({})) } as unknown as AuditService;
const monitor = createProjectPurchaseOrderBasketMonitorService({ audit,
  vendorPortalUrl: "https://vendor.example.test/vendor", now: () => at });
const assessment = createProjectPurchaseOrderInvoiceAssessmentService({ audit, now: () => at });
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

vi.mock("../src/services/procurement.service.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/services/procurement.service.js")>(),
  assertProcurementProjectAccess: vi.fn(async (actor: PublicUser, projectId: string) => {
    if (actor.role !== "procurement" || actor.id !== "buyer" || projectId !== "project-a")
      throw new ApiError(403, "FORBIDDEN", "Forbidden.");
  })
}));

beforeAll(async () => {
  replica = await startMongoReplicaSet("procurement-basket-monitor-tests");
  await Promise.all([AiEstimatorKnowledgeVendorModel, FinanceLedgerEntryModel, ProcurementBasketAwardModel,
    ProcurementBasketAwardRevisionModel, ProcurementBasketBoqRevisionModel,
    ProcurementBasketInvoiceAssessmentModel, ProcurementBasketInvoiceAssessmentRevisionModel,
    ProjectPurchaseOrderModel, ProjectPurchaseOrderRevisionModel, ProjectWorkflowTaskModel,
    UserModel, VendorWorkAssignmentModel].map(model => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  await replica.clear();
  vi.mocked(audit.appendInMongoTransaction).mockClear();
  await UserModel.create([{ _id: "buyer", name: "Buyer", email: "buyer@example.test",
    emailNormalized: "buyer@example.test", passwordHash: "fixture", role: "procurement", active: true },
  { _id: "finance", name: "Finance", email: "finance@example.test",
    emailNormalized: "finance@example.test", passwordHash: "fixture", role: "finance_head", active: true }]);
  await ProjectWorkflowTaskModel.collection.insertOne({ _id: "finance-task-a", dedupeKey: "finance-task-a",
    projectId: "project-a", estimateId: "estimate-a", designPlanVersion: 1, kind: "finance",
    title: "Finance review", assigneeRole: "finance_head", status: "open", progress: 0,
    version: 1, openedAt: at });
  await AiEstimatorKnowledgeVendorModel.collection.insertOne({ _id: "vendor-a", name: "Vendor A",
    code: "VENDOR-A", status: "active", nameNormalized: "vendor a", codeNormalized: "vendor-a",
    procurementProfile: { vendorType: "execution", gstRegistered: true, gstNumber: "29AABCS1429B1ZB" } });
  await ProcurementBasketAwardModel.collection.insertOne({ _id: "award-a", enquiryId: "enquiry-a",
    boqRevisionId: "boq-a", projectId: "project-a", mainBasketId: "basket-a", vendorId: "vendor-a",
    bidId: "bid-a", status: "issued", version: 4, currentProposalRevisionId: "proposal-a",
    issuedPurchaseOrderId: "order-a" });
  await ProcurementBasketAwardRevisionModel.collection.insertOne({ _id: "proposal-a", awardId: "award-a",
    enquiryId: "enquiry-a", projectId: "project-a", terms: "Pay after verified milestones.",
    milestones: [{ id: "advance", name: "Advance", basisPoints: 2_000, amountPaise: 23_600 },
      { id: "mobilisation", name: "Mobilisation", basisPoints: 1_500, amountPaise: 17_700 },
      { id: "progress-50", name: "Progress 50%", basisPoints: 2_500, amountPaise: 29_500 },
      { id: "progress-85", name: "Progress 85%", basisPoints: 2_500, amountPaise: 29_500 },
      { id: "final", name: "Final", basisPoints: 1_500, amountPaise: 17_700 }] });
  await ProcurementBasketBoqRevisionModel.collection.insertOne({ _id: "boq-a", enquiryId: "enquiry-a",
    projectId: "project-a", mainBasketId: "basket-a", lines: [{ id: "boq-line-a", roomName: "Living",
      description: "Interior painting", quantityMilliUnits: 1_000, uomCode: "SQFT" }] });
  await ProjectPurchaseOrderModel.collection.insertOne({ _id: "order-a", orderNumber: "PO-20261005-TEST",
    projectId: "project-a", tenderAwardId: "award-a", vendorId: "vendor-a", vendorName: "Vendor A",
    createIdempotencyKey: "order-a-key",
    status: "approved", approvedRevisionId: "revision-a", approvedRevision: 1,
    approvedNetPaise: 100_000, approvedGstPaise: 18_000, approvedTotalPaise: 118_000,
    approvedAt: at, cancelledAt: null });
  await ProjectPurchaseOrderRevisionModel.collection.insertOne({ _id: "revision-a", orderId: "order-a",
    tenderAwardId: "award-a", terms: "Pay after verified milestones.", netPaise: 100_000,
    gstPaise: 18_000, totalPaise: 118_000, lines: [{ id: "line-a", description: "Interior painting",
      quantityMilliUnits: 1_000, uomCode: "SQFT", unitPricePaise: 100_000, gstBasisPoints: 1_800,
      netPaise: 100_000, gstPaise: 18_000, totalPaise: 118_000, targetDate: "2026-10-10",
      deliveryLocation: "Project site" }] });
  await VendorWorkAssignmentModel.collection.insertOne({ _id: "assignment-a", projectId: "project-a",
    vendorId: "vendor-a", orderId: "order-a", orderRevision: 1, lineId: "line-a",
    description: "Interior painting", status: "in_progress", progress: 25, targetDate: "2026-10-10",
    updatedAt: at });
});
afterAll(async () => { await replica?.stop(); });

describe("issued basket package monitoring and Finance assessment", () => {
  it("shows frozen payment-row reviewers and leaves historical rows without chips readable", async () => {
    const historical = await monitor.get(buyer, "project-a", "basket-a", "award-a");
    expect(historical.finance.paymentSchedule[0]).not.toHaveProperty("reviewerSlots");
    await ProcurementBasketAwardRevisionModel.collection.updateOne({ _id: "proposal-a" },
      { $set: { "milestones.0.reviewerSlots": ["procurement"], "milestones.4.reviewerSlots": ["finance_head"] } });
    const selected = await monitor.get(buyer, "project-a", "basket-a", "award-a");
    expect(selected.finance.paymentSchedule[0]?.reviewerSlots).toEqual(["procurement"]);
    expect(selected.finance.paymentSchedule[4]?.reviewerSlots).toEqual(["finance_head"]);
    expect(selected.finance.paymentSchedule[1]).not.toHaveProperty("reviewerSlots");
  });

  it("shows posted, order-linked Procurement cost while leaving payment unknown and protects the PDF", async () => {
    await FinanceLedgerEntryModel.collection.insertMany([
      { _id: "cost-a", bucketId: "bucket-a", projectId: "project-a", type: "direct_spend",
        expenseClass: "procurement", category: "Painting", amountPaise: 20_000,
        purchaseOrderId: "order-a", paymentMilestoneId: "advance", status: "posted", incurredAt: at,
        description: "Recorded site expense", idempotencyKey: "cost-a-key", createdById: "finance" },
      { _id: "cost-other-project", bucketId: "bucket-b", projectId: "project-b", type: "direct_spend",
        expenseClass: "procurement", category: "Painting", amountPaise: 900_000,
        purchaseOrderId: "order-a", paymentMilestoneId: "advance", status: "posted", incurredAt: at,
        description: "Unrelated project", idempotencyKey: "cost-b-key", createdById: "finance" },
      { _id: "cost-void", bucketId: "bucket-a", projectId: "project-a", type: "direct_spend",
        expenseClass: "procurement", category: "Painting", amountPaise: 30_000,
        purchaseOrderId: "order-a", paymentMilestoneId: "advance", status: "voided", incurredAt: at,
        description: "Voided expense", idempotencyKey: "cost-void-key", createdById: "finance" }
    ]);
    const current = await monitor.get(buyer, "project-a", "basket-a", "award-a");
    expect(current).toMatchObject({ award: { status: "issued" }, order: { id: "order-a",
      totals: { netPaise: 100_000, gstPaise: 18_000, totalPaise: 118_000 } },
    site: { status: "in_progress", progressPercent: 25 },
    finance: { assessmentStatus: "pending", recordedCostPaise: 20_000, paidPaise: null } });
    expect(current.vendorAlerts.some(alert => alert.id === "finance-assessment")).toBe(true);
    const pdf = await monitor.pdf(buyer, "project-a", "basket-a", "award-a");
    expect(pdf.filename).toBe("work-order-PO-20261005-TEST.pdf");
    expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    await expect(monitor.pdf({ ...buyer, role: "vendor" }, "project-a", "basket-a", "award-a"))
      .rejects.toMatchObject({ status: 403 });
    await expect(monitor.get(buyer, "project-a", "basket-other", "award-a"))
      .rejects.toMatchObject({ status: 404 });
    expect(await monitor.shareIntent(buyer, "project-a", "basket-a", "award-a"))
      .toMatchObject({ available: false, shareUrl: null });
    expect(vi.mocked(audit.appendInMongoTransaction)).not.toHaveBeenCalled();
  });

  it("records Finance supplied invoice and withholding evidence with integer TDS, CAS and replay", async () => {
    expect((await assessment.get(finance, "order-a")).assessment).toBeNull();
    const first = { expectedVersion: 0, idempotencyKey: "invoice-review-key-1",
      invoiceNumber: "INV-101", invoiceDate: "2026-10-05", invoiceEvidenceReference: "document-reference-101",
      invoiceTotalPaise: 118_000, tdsBasisPaise: 100_000, tdsRateBasisPoints: 100,
      withholdingEffectiveDate: "2026-10-05", withholdingRuleReference: "Reviewed vendor tax record",
      reason: "Finance verified invoice and withholding basis." };
    const saved = await assessment.save(finance, "order-a", first);
    expect(saved).toMatchObject({ orderId: "order-a", version: 1, tdsPaise: 1_000,
      netPayablePaise: 117_000 });
    expect(await assessment.save(finance, "order-a", first)).toEqual(saved);
    await expect(assessment.save(finance, "order-a", { ...first,
      idempotencyKey: "invoice-stale-key", tdsRateBasisPoints: 200 }))
      .rejects.toMatchObject({ status: 409, code: "INVOICE_ASSESSMENT_STALE" });
    const second = await assessment.save(finance, "order-a", { ...first,
      expectedVersion: 1, idempotencyKey: "invoice-review-key-2", tdsRateBasisPoints: 200 });
    expect(second).toMatchObject({ version: 2, tdsPaise: 2_000, netPayablePaise: 116_000 });
    expect((await assessment.get(finance, "order-a")).assessment).toEqual(second);
    expect(await ProcurementBasketInvoiceAssessmentModel.countDocuments({ orderId: "order-a" })).toBe(1);
    expect(await ProcurementBasketInvoiceAssessmentRevisionModel.countDocuments({ orderId: "order-a" })).toBe(2);
    const packageView = await monitor.get(buyer, "project-a", "basket-a", "award-a");
    expect(packageView.finance).toMatchObject({ assessmentStatus: "reviewed", invoiceTotalPaise: 118_000,
      tdsPaise: 2_000, netPayablePaise: 116_000, recordedCostPaise: null, paidPaise: null });
    expect(packageView.vendorAlerts.some(alert => alert.id === "finance-assessment")).toBe(false);
    expect(await assessment.list(finance, "project-a", { limit: 10, offset: 0 })).toMatchObject({
      total: 1, items: [{ id: "order-a", assessmentStatus: "reviewed", assessmentVersion: 2 }] });
  });

  it("keeps Finance access scoped to the project's workflow task and hides unrelated orders", async () => {
    await ProjectPurchaseOrderModel.collection.insertOne({ _id: "order-b", orderNumber: "PO-20261005-OTHER",
      projectId: "project-b", tenderAwardId: "award-b", vendorId: "vendor-b", vendorName: "Vendor B",
      createIdempotencyKey: "order-b-key",
      status: "approved", approvedRevisionId: "revision-b", approvedRevision: 1,
      approvedNetPaise: 500_000, approvedGstPaise: 0, approvedTotalPaise: 500_000,
      approvedAt: at, cancelledAt: null });
    await ProjectPurchaseOrderModel.collection.insertOne({ _id: "legacy-order-a", orderNumber: "PO-20261005-LEGACY",
      projectId: "project-a", vendorId: "vendor-a", vendorName: "Vendor A", tenderAwardId: null,
      createIdempotencyKey: "legacy-order-key",
      status: "approved", approvedRevisionId: "legacy-revision", approvedRevision: 1,
      approvedNetPaise: 10_000, approvedGstPaise: 0, approvedTotalPaise: 10_000,
      approvedAt: at, cancelledAt: null });
    expect(await assessment.list(finance, "project-a", { limit: 1, offset: 0 })).toMatchObject({
      total: 1, limit: 1, offset: 0, items: [{ id: "order-a", assessmentStatus: "pending" }] });
    expect(await assessment.list(finance, "project-a", { limit: 1, offset: 1 })).toMatchObject({
      total: 1, items: [] });
    await expect(assessment.list(finance, "project-b", { limit: 10, offset: 0 }))
      .rejects.toMatchObject({ status: 404 });
    await expect(assessment.get(finance, "order-b")).rejects.toMatchObject({ status: 404 });
    await expect(assessment.save(finance, "order-b", { expectedVersion: 0,
      idempotencyKey: "other-invoice-key", invoiceNumber: "INV-OTHER", invoiceDate: "2026-10-05",
      invoiceEvidenceReference: "other-document-reference", invoiceTotalPaise: 100_000,
      tdsBasisPaise: 100_000, tdsRateBasisPoints: 100,
      withholdingEffectiveDate: "2026-10-05", withholdingRuleReference: "Reviewed tax rule",
      reason: "Unrelated project must remain hidden." })).rejects.toMatchObject({ status: 404 });
    expect(await ProcurementBasketInvoiceAssessmentModel.countDocuments({ orderId: "order-b" })).toBe(0);
    await expect(assessment.get(buyer, "order-a")).rejects.toMatchObject({ status: 403 });
  });
});
