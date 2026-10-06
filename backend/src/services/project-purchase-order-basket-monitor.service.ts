import mongoose, { type ClientSession } from "mongoose";
import PDFDocument from "pdfkit";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { FinanceLedgerEntryModel } from "../models/FinanceLedgerEntry.js";
import { ProcurementBasketAwardModel, ProcurementBasketAwardRevisionModel,
  ProcurementBasketBoqRevisionModel } from "../models/ProcurementBasketTender.js";
import { ProcurementBasketInvoiceAssessmentModel, ProcurementBasketInvoiceAssessmentRevisionModel } from "../models/ProcurementBasketInvoiceAssessment.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../models/ProjectPurchaseOrderRevision.js";
import { UserModel } from "../models/User.js";
import { VendorWorkAssignmentModel } from "../models/VendorWorkAssignment.js";
import { VendorWorkImageModel } from "../models/VendorWorkImage.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { assertProcurementProjectAccess } from "./procurement.service.js";
import { storedProcurementVendorProfile } from "./procurement-vendor-profile.js";

type Row = Record<string, any>;
export interface BasketPackageMonitorDto {
  award: { id: string; status: "issued"; vendorId: string };
  order: { id: string; orderNumber: string; status: string; revision: number; terms: string | null; vendor: { name: string };
    lines: Array<{ id: string; description: string; quantityMilliUnits: number; uomCode: string;
      unitPricePaise: number; gstBasisPoints: number; netPaise: number; gstPaise: number; totalPaise: number;
      targetDate: string | null; deliveryLocation: string | null }>;
    totals: { netPaise: number; gstPaise: number; totalPaise: number } };
  boqLines: Array<{ id: string; description: string; roomName: string; quantityMilliUnits: number; uomCode: string }>;
  site: { status: string; progressPercent: number | null;
    tasks: Array<{ id: string; label: string; status: string; progressPercent: number; evidenceCount: number;
      reviewOwnerName: string | null }> };
  finance: { assessmentStatus: "pending" | "reviewed"; invoiceTotalPaise: number | null;
    tdsPaise: number | null; netPayablePaise: number | null; recordedCostPaise: number | null; paidPaise: null;
    gstRegistration: { registered: boolean | null; gstin: string | null };
    paymentSchedule: Array<{ id: string; name: string; basisPoints: number; amountPaise: number;
      reviewerSlots?: Array<"program_manager" | "designer" | "procurement" | "finance_head"> }> };
  vendorAlerts: Array<{ id: string; message: string; ownerName: string; createdAt: string;
    severity: "info" | "warning" | "critical" }>;
}

export function createProjectPurchaseOrderBasketMonitorService(input: { audit: AuditService;
  vendorPortalUrl: string; now?: () => Date }) {
  const now = input.now ?? (() => new Date());
  return {
    async get(actor: PublicUser, projectId: string, basketId: string, awardId: string): Promise<BasketPackageMonitorDto> {
      return mongoose.connection.transaction(async session => {
        await assertProcurementProjectAccess(actor, projectId, session);
        return readMonitor(projectId, basketId, awardId, session, now());
      }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
    },
    async pdf(actor: PublicUser, projectId: string, basketId: string, awardId: string): Promise<{ filename: string; bytes: Buffer }> {
      const monitor = await this.get(actor, projectId, basketId, awardId);
      return { filename: `work-order-${monitor.order.orderNumber}.pdf`, bytes: await renderWorkOrderPdf(monitor) };
    },
    async shareIntent(actor: PublicUser, projectId: string, basketId: string, awardId: string): Promise<{
      available: boolean; shareUrl: string | null; blocker: string | null }> {
      return mongoose.connection.transaction(async session => {
        await assertProcurementProjectAccess(actor, projectId, session);
        const { award, order } = await issuedPackage(projectId, basketId, awardId, session);
        const linked = await UserModel.exists({ vendorId: award.vendorId, role: "vendor", active: true }).session(session);
        const vendor = await AiEstimatorKnowledgeVendorModel.findById(award.vendorId).session(session).lean() as Row | null;
        const phone = linked ? indianWhatsAppPhone(storedProcurementVendorProfile(vendor?.procurementProfile)?.phoneNumber ?? null) : null;
        if (!phone) return { available: false, shareUrl: null,
          blocker: "An active vendor portal account and a usable vendor phone number are required." };
        const portal = new URL(input.vendorPortalUrl);
        if (!(["https:", "http:"].includes(portal.protocol) && (portal.protocol !== "http:" ||
          ["localhost", "127.0.0.1"].includes(portal.hostname))))
          throw new ApiError(503, "VENDOR_PORTAL_URL_UNAVAILABLE", "The vendor portal URL is not configured for safe sharing.");
        const message = `Your Lisno work order ${order.orderNumber} is ready. Sign in to review it: ${portal.toString()}`;
        const shareUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        await input.audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement_basket_work_order_share_intent",
          entityType: "project_purchase_order", entityId: String(order._id), occurredAt: now().toISOString(),
          newValues: { projectId, awardId, vendorId: award.vendorId, channel: "whatsapp", delivery: "not_sent" } }, session);
        return { available: true, shareUrl, blocker: null };
      }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
    }
  };
}

async function issuedPackage(projectId: string, basketId: string, awardId: string, session: ClientSession): Promise<{
  award: Row; order: Row; revision: Row; proposal: Row; boq: Row }> {
  const award = await ProcurementBasketAwardModel.findOne({ _id: awardId, projectId, mainBasketId: basketId,
    status: "issued", issuedPurchaseOrderId: { $type: "string" } }).session(session).lean() as Row | null;
  if (!award) throw new ApiError(404, "PROCUREMENT_BASKET_AWARD_NOT_FOUND", "Issued basket award not found.");
  const order = await ProjectPurchaseOrderModel.findOne({ _id: award.issuedPurchaseOrderId,
    projectId, tenderAwardId: awardId, status: "approved", cancelledAt: null }).session(session).lean() as Row | null;
  const revision = order ? await ProjectPurchaseOrderRevisionModel.findOne({ _id: order.approvedRevisionId,
    orderId: order._id, tenderAwardId: awardId }).session(session).lean() as Row | null : null;
  const proposal = await ProcurementBasketAwardRevisionModel.findOne({ _id: award.currentProposalRevisionId,
    awardId }).session(session).lean() as Row | null;
  const boq = await ProcurementBasketBoqRevisionModel.findOne({ _id: award.boqRevisionId,
    enquiryId: award.enquiryId, projectId, mainBasketId: basketId }).session(session).lean() as Row | null;
  if (!order || !revision || !proposal || !boq) throw new ApiError(409, "PROCUREMENT_BASKET_PACKAGE_CONFLICT",
    "The issued work order or its approved source is unavailable.");
  return { award, order, revision, proposal, boq };
}

async function readMonitor(projectId: string, basketId: string, awardId: string, session: ClientSession,
  observedAt: Date): Promise<BasketPackageMonitorDto> {
  const { award, order, revision, proposal, boq } = await issuedPackage(projectId, basketId, awardId, session);
  const assignments = await VendorWorkAssignmentModel.find({ orderId: order._id, orderRevision: order.approvedRevision,
    status: { $ne: "superseded" } }).sort({ lineId: 1 }).session(session).lean() as Row[];
  const assignmentIds = assignments.map(row => String(row._id));
  const evidence = await VendorWorkImageModel.aggregate<{ _id: string; count: number }>([
    { $match: { assignmentId: { $in: assignmentIds } } },
    { $group: { _id: "$assignmentId", count: { $sum: 1 } } }
  ]).session(session);
  const evidenceById = new Map(evidence.map(row => [String(row._id), Number(row.count)]));
  const financeCurrent = await ProcurementBasketInvoiceAssessmentModel.findOne({ orderId: order._id,
    projectId, awardId }).session(session).lean() as Row | null;
  const financeAssessment = financeCurrent ? await ProcurementBasketInvoiceAssessmentRevisionModel.findById(financeCurrent.currentRevisionId)
    .session(session).lean() as Row | null : null;
  if (financeCurrent && !financeAssessment) throw new ApiError(409, "INVOICE_ASSESSMENT_CONFLICT", "Finance review revision is unavailable.");
  const linkedEntries = await FinanceLedgerEntryModel.find({ projectId, purchaseOrderId: order._id,
    type: "direct_spend", expenseClass: "procurement", status: "posted" }).select({ amountPaise: 1 }).session(session).lean() as Row[];
  const recordedCost = linkedEntries.length ? linkedEntries.reduce((sum, row) => sum + BigInt(row.amountPaise), 0n) : null;
  const vendor = await AiEstimatorKnowledgeVendorModel.findById(award.vendorId).select({ procurementProfile: 1 }).session(session).lean() as Row | null;
  const profile = storedProcurementVendorProfile(vendor?.procurementProfile);
  const lineById = new Map((revision.lines as Row[]).map(line => [String(line.id), line]));
  const progressWeight = assignments.reduce((sum, row) => {
    const line = lineById.get(String(row.lineId));
    return sum + BigInt(line?.netPaise ?? 0) * BigInt(row.progress);
  }, 0n);
  const net = BigInt(revision.netPaise);
  const progressPercent = assignments.length === revision.lines.length && net > 0n
    ? Number((progressWeight + net / 2n) / net) : null;
  const siteStatus = assignments.length !== revision.lines.length ? "unavailable"
    : assignments.every(row => row.status === "client_approved") ? "client_approved"
      : assignments.some(row => row.status === "changes_requested") ? "changes_requested"
        : assignments.some(row => row.status === "submitted_for_client") ? "pending_client_review"
          : assignments.some(row => row.status === "in_progress") ? "in_progress" : "awaiting_vendor";
  const alerts: BasketPackageMonitorDto["vendorAlerts"] = [];
  const push = (id: string, message: string, ownerName: string, at: unknown,
    severity: "info" | "warning" | "critical") => alerts.push({ id, message, ownerName,
    createdAt: new Date(at as Date).toISOString(), severity });
  if (assignments.length !== revision.lines.length) push("assignment-missing", "Vendor work assignments need reconciliation.",
    "Procurement", order.approvedAt, "critical");
  for (const row of assignments) {
    if (row.status === "awaiting_vendor_access") push(`vendor-access-${row._id}`, "Vendor portal access is pending.",
      "Procurement", row.updatedAt, "warning");
    if (row.status === "submitted_for_client") push(`client-review-${row._id}`, "Submitted work is awaiting client review.",
      "Client", row.submittedAt ?? row.updatedAt, "info");
    if (row.status === "changes_requested") push(`changes-${row._id}`, "Client requested changes to vendor work.",
      "Vendor", row.updatedAt, "warning");
    if (row.status !== "client_approved" && row.targetDate && `${row.targetDate}` < observedAt.toISOString().slice(0, 10))
      push(`target-${row._id}`, "Work target date has passed.", "Vendor", row.updatedAt, "warning");
  }
  if (!financeAssessment) push("finance-assessment", "Invoice and withholding review is pending.",
    "Finance", order.approvedAt, "info");
  return {
    award: { id: awardId, status: "issued", vendorId: String(award.vendorId) },
    order: { id: String(order._id), orderNumber: String(order.orderNumber), status: String(order.status),
      revision: Number(order.approvedRevision), terms: revision.terms ?? null, vendor: { name: String(order.vendorName) },
      lines: (revision.lines as Row[]).map(line => ({ id: String(line.id), description: String(line.description),
        quantityMilliUnits: Number(line.quantityMilliUnits), uomCode: String(line.uomCode),
        unitPricePaise: Number(line.unitPricePaise), gstBasisPoints: Number(line.gstBasisPoints),
        netPaise: Number(line.netPaise), gstPaise: Number(line.gstPaise), totalPaise: Number(line.totalPaise),
        targetDate: line.targetDate ?? null, deliveryLocation: line.deliveryLocation ?? null })),
      totals: { netPaise: Number(revision.netPaise), gstPaise: Number(revision.gstPaise), totalPaise: Number(revision.totalPaise) } },
    boqLines: (boq.lines as Row[]).map(line => ({ id: String(line.id), description: String(line.description),
      roomName: String(line.roomName), quantityMilliUnits: Number(line.quantityMilliUnits), uomCode: String(line.uomCode) })),
    site: { status: siteStatus, progressPercent,
      tasks: assignments.map(row => ({ id: String(row._id), label: String(row.description), status: String(row.status),
        progressPercent: Number(row.progress), evidenceCount: evidenceById.get(String(row._id)) ?? 0,
        reviewOwnerName: row.status === "submitted_for_client" ? "Client" : row.status === "client_approved" ? null : "Vendor" })) },
    finance: { assessmentStatus: financeAssessment ? "reviewed" : "pending",
      invoiceTotalPaise: financeAssessment ? Number(financeAssessment.invoiceTotalPaise) : null,
      tdsPaise: financeAssessment ? Number(financeAssessment.tdsPaise) : null,
      netPayablePaise: financeAssessment ? Number(financeAssessment.netPayablePaise) : null,
      recordedCostPaise: recordedCost === null ? null : Number(recordedCost), paidPaise: null,
      gstRegistration: { registered: profile?.gstRegistered ?? null, gstin: profile?.gstNumber ?? null },
      paymentSchedule: (proposal.milestones as Row[]).map(row => ({ id: String(row.id), name: String(row.name),
        basisPoints: Number(row.basisPoints), amountPaise: Number(row.amountPaise),
        ...(row.reviewerSlots === undefined ? {} : { reviewerSlots: row.reviewerSlots }) })) },
    vendorAlerts: alerts
  };
}

function indianWhatsAppPhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/[^0-9]/gu, "");
  if (/^[6-9][0-9]{9}$/u.test(digits)) return `91${digits}`;
  if (/^91[6-9][0-9]{9}$/u.test(digits)) return digits;
  return null;
}

function renderWorkOrderPdf(monitor: BasketPackageMonitorDto): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.font("Helvetica-Bold").fontSize(18).text("LISNO WORK ORDER");
    doc.moveDown(0.5).font("Helvetica").fontSize(10).text(`Order: ${monitor.order.orderNumber}`)
      .text(`Vendor: ${monitor.order.vendor.name}`).text(`Approved revision: ${monitor.order.revision}`);
    doc.moveDown().font("Helvetica-Bold").fontSize(12).text("Awarded scope");
    for (const line of monitor.order.lines) {
      if (doc.y > 690) doc.addPage();
      doc.moveDown(0.5).font("Helvetica-Bold").fontSize(10).text(line.description);
      doc.font("Helvetica").text(`${line.quantityMilliUnits / 1_000} ${line.uomCode}  x  Rs ${(line.unitPricePaise / 100).toFixed(2)}  =  Rs ${(line.totalPaise / 100).toFixed(2)} incl. quoted tax`);
      doc.text(`Target: ${line.targetDate ?? "Not specified"}  |  Delivery: ${line.deliveryLocation ?? "Not specified"}`);
    }
    doc.moveDown().font("Helvetica-Bold").text(`Contract net: Rs ${(monitor.order.totals.netPaise / 100).toFixed(2)}`)
      .text(`Quoted GST: Rs ${(monitor.order.totals.gstPaise / 100).toFixed(2)}`)
      .text(`Total: Rs ${(monitor.order.totals.totalPaise / 100).toFixed(2)}`);
    doc.moveDown().fontSize(12).text("Payment schedule");
    for (const milestone of monitor.finance.paymentSchedule) {
      if (doc.y > 690) doc.addPage();
      doc.font("Helvetica").fontSize(10).text(`${milestone.name} - ${(milestone.basisPoints / 100).toFixed(2)}% - Rs ${(milestone.amountPaise / 100).toFixed(2)}`);
    }
    if (monitor.order.terms) {
      doc.moveDown().font("Helvetica-Bold").fontSize(12).text("Terms");
      doc.font("Helvetica").fontSize(10).text(monitor.order.terms);
    }
    doc.moveDown().fontSize(9).fillColor("#555555").text("This document records the approved order and its intended payment schedule. Payment and site completion are tracked separately in Lisno.");
    doc.end();
  });
}
