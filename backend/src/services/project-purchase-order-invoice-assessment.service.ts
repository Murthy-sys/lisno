import { createHash, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { ApiError } from "../middleware/errors.js";
import { ProcurementBasketInvoiceAssessmentModel, ProcurementBasketInvoiceAssessmentRevisionModel } from "../models/ProcurementBasketInvoiceAssessment.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { UserModel } from "../models/User.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { requireFinanceProjectAccess } from "./project-finance.service.js";

type Row = Record<string, any>;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const assessmentSchema = z.object({
  expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u),
  invoiceNumber: z.string().trim().min(1).max(120), invoiceDate: date,
  invoiceEvidenceReference: z.string().trim().min(4).max(500),
  invoiceTotalPaise: z.number().int().positive(),
  tdsBasisPaise: z.number().int().min(0),
  tdsRateBasisPoints: z.number().int().min(0).max(10_000),
  withholdingEffectiveDate: date,
  withholdingRuleReference: z.string().trim().min(4).max(500),
  reason: z.string().trim().min(10).max(2_000)
}).strict();
export type InvoiceAssessmentInput = z.infer<typeof assessmentSchema>;
export interface InvoiceAssessmentDto {
  orderId: string; version: number; revisionId: string; invoiceNumber: string; invoiceDate: string;
  invoiceEvidenceReference: string; invoiceTotalPaise: number; tdsBasisPaise: number;
  tdsRateBasisPoints: number; tdsPaise: number; netPayablePaise: number;
  withholdingEffectiveDate: string; withholdingRuleReference: string; reason: string;
  assessedAt: string; assessedById: string;
}

export function createProjectPurchaseOrderInvoiceAssessmentService(input: { audit: AuditService; now?: () => Date }) {
  const now = input.now ?? (() => new Date());
  return {
    async list(actor: PublicUser, projectId: string, page: { limit: number; offset: number }): Promise<{
      items: Array<{ id: string; orderNumber: string; vendorName: string; netPaise: number; gstPaise: number;
        totalPaise: number; approvedAt: string; assessmentStatus: "pending" | "reviewed"; assessmentVersion: number }>;
      total: number; limit: number; offset: number }> {
      return mongoose.connection.transaction(async session => {
        if (actor.role !== "finance_head" || !await UserModel.exists({ _id: actor.id, role: "finance_head", active: true }).session(session))
          throw new ApiError(403, "FORBIDDEN", "Only an active Finance Manager can review vendor invoices.");
        await requireFinanceProjectAccess({ id: actor.id, role: "finance_head" }, projectId, session);
        const filter = { projectId, status: "approved", tenderAwardId: { $type: "string" },
          approvedRevisionId: { $ne: null }, cancelledAt: null };
        const orders = await ProjectPurchaseOrderModel.find(filter).sort({ approvedAt: -1, _id: 1 })
          .skip(page.offset).limit(page.limit).session(session).lean() as Row[];
        const total = await ProjectPurchaseOrderModel.countDocuments(filter).session(session);
        const current = orders.length ? await ProcurementBasketInvoiceAssessmentModel.find({ projectId,
          orderId: { $in: orders.map(order => order._id) } }).select({ orderId: 1, version: 1 })
          .session(session).lean() as Row[] : [];
        const byOrder = new Map(current.map(row => [String(row.orderId), Number(row.version)]));
        return { items: orders.map(order => ({ id: String(order._id), orderNumber: String(order.orderNumber),
          vendorName: String(order.vendorName), netPaise: Number(order.approvedNetPaise),
          gstPaise: Number(order.approvedGstPaise), totalPaise: Number(order.approvedTotalPaise),
          approvedAt: new Date(order.approvedAt).toISOString(),
          assessmentStatus: byOrder.has(String(order._id)) ? "reviewed" as const : "pending" as const,
          assessmentVersion: byOrder.get(String(order._id)) ?? 0 })), total, ...page };
      }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
    },
    async get(actor: PublicUser, orderId: string): Promise<{ order: { id: string; orderNumber: string; projectId: string;
      vendorName: string; netPaise: number; gstPaise: number; totalPaise: number }; assessment: InvoiceAssessmentDto | null }> {
      return mongoose.connection.transaction(async session => {
        if (actor.role !== "finance_head" || !await UserModel.exists({ _id: actor.id, role: "finance_head", active: true }).session(session))
          throw new ApiError(403, "FORBIDDEN", "Only an active Finance Manager can review a vendor invoice.");
        const order = await ProjectPurchaseOrderModel.findOne({ _id: orderId, status: "approved", tenderAwardId: { $type: "string" },
          approvedRevisionId: { $ne: null }, cancelledAt: null }).session(session).lean() as Row | null;
        if (!order) throw new ApiError(404, "PROCUREMENT_WORK_ORDER_NOT_FOUND", "Issued work order not found.");
        await requireFinanceProjectAccess({ id: actor.id, role: "finance_head" }, String(order.projectId), session);
        const current = await ProcurementBasketInvoiceAssessmentModel.findOne({ orderId }).session(session).lean() as Row | null;
        const revision = current ? await ProcurementBasketInvoiceAssessmentRevisionModel.findById(current.currentRevisionId)
          .session(session).lean() as Row | null : null;
        if (current && !revision) throw new ApiError(409, "INVOICE_ASSESSMENT_CONFLICT", "Finance review revision is unavailable.");
        return { order: { id: orderId, orderNumber: String(order.orderNumber), projectId: String(order.projectId),
          vendorName: String(order.vendorName), netPaise: Number(order.approvedNetPaise),
          gstPaise: Number(order.approvedGstPaise), totalPaise: Number(order.approvedTotalPaise) },
          assessment: revision ? dto(revision, Number(current!.version)) : null };
      }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
    },
    async save(actor: PublicUser, orderId: string, value: InvoiceAssessmentInput): Promise<InvoiceAssessmentDto> {
      const parsed = assessmentSchema.safeParse(value);
      if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid Finance invoice assessment.",
        Object.fromEntries(parsed.error.issues.map(issue => [issue.path.join("."), issue.message])));
      const fields = parsed.data;
      return mongoose.connection.transaction(async session => {
        if (actor.role !== "finance_head" || !await UserModel.exists({ _id: actor.id, role: "finance_head", active: true }).session(session))
          throw new ApiError(403, "FORBIDDEN", "Only an active Finance Manager can review a vendor invoice.");
        const order = await ProjectPurchaseOrderModel.findOne({ _id: orderId, status: "approved", tenderAwardId: { $type: "string" },
          approvedRevisionId: { $ne: null }, cancelledAt: null }).session(session).lean() as Row | null;
        if (!order) throw new ApiError(404, "PROCUREMENT_WORK_ORDER_NOT_FOUND", "Issued work order not found.");
        await requireFinanceProjectAccess({ id: actor.id, role: "finance_head" }, String(order.projectId), session);
        const current = await ProcurementBasketInvoiceAssessmentModel.findOne({ orderId }).session(session).lean() as Row | null;
        const replay = await ProcurementBasketInvoiceAssessmentRevisionModel.findOne({ orderId,
          idempotencyKey: fields.idempotencyKey }).session(session).lean() as Row | null;
        const requestDigest = digest({ orderId, ...fields });
        if (replay) {
          if (replay.digest !== requestDigest) throw new ApiError(409, "INVOICE_ASSESSMENT_REPLAY_CONFLICT", "This submission key was used for a different assessment.");
          return dto(replay, Number(replay.revision));
        }
        if ((current?.version ?? 0) !== fields.expectedVersion) throw new ApiError(409, "INVOICE_ASSESSMENT_STALE", "The invoice review changed. Refresh before saving.");
        if (fields.invoiceTotalPaise > Number(order.approvedTotalPaise) || fields.tdsBasisPaise > fields.invoiceTotalPaise)
          throw new ApiError(400, "VALIDATION_ERROR", "Invoice amount or withholding basis exceeds this work order.");
        const tdsPaise = Number((BigInt(fields.tdsBasisPaise) * BigInt(fields.tdsRateBasisPoints) + 5_000n) / 10_000n);
        const netPayablePaise = fields.invoiceTotalPaise - tdsPaise;
        if (netPayablePaise < 0) throw new ApiError(400, "VALIDATION_ERROR", "Withholding exceeds the invoice amount.");
        const timestamp = now();
        const assessmentId = current?._id ?? `basket-invoice-assessment-${randomUUID()}`;
        const revision = fields.expectedVersion + 1;
        const revisionId = `basket-invoice-assessment-revision-${randomUUID()}`;
        await ProcurementBasketInvoiceAssessmentRevisionModel.create([{ _id: revisionId, assessmentId,
          projectId: order.projectId, orderId, awardId: order.tenderAwardId, revision,
          invoiceNumber: fields.invoiceNumber, invoiceDate: fields.invoiceDate,
          invoiceEvidenceReference: fields.invoiceEvidenceReference,
          invoiceTotalPaise: fields.invoiceTotalPaise, tdsBasisPaise: fields.tdsBasisPaise,
          tdsRateBasisPoints: fields.tdsRateBasisPoints, tdsPaise, netPayablePaise,
          withholdingEffectiveDate: fields.withholdingEffectiveDate,
          withholdingRuleReference: fields.withholdingRuleReference, reason: fields.reason,
          digest: requestDigest, idempotencyKey: fields.idempotencyKey,
          assessedAt: timestamp, assessedById: actor.id }], { session });
        if (current) {
          const changed = await ProcurementBasketInvoiceAssessmentModel.updateOne({ _id: assessmentId,
            orderId, version: fields.expectedVersion }, {
            $set: { currentRevisionId: revisionId, updatedById: actor.id, updatedAt: timestamp },
            $inc: { version: 1 }
          }, { session, runValidators: true, timestamps: false });
          if (changed.matchedCount !== 1) throw new ApiError(409, "INVOICE_ASSESSMENT_STALE", "The invoice review changed. Refresh before saving.");
        } else await ProcurementBasketInvoiceAssessmentModel.create([{ _id: assessmentId,
          projectId: order.projectId, orderId, awardId: order.tenderAwardId,
          version: 1, currentRevisionId: revisionId, updatedById: actor.id,
          createdAt: timestamp, updatedAt: timestamp }], { session });
        await input.audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement_basket_invoice_assessed",
          entityType: "project_purchase_order", entityId: orderId, occurredAt: timestamp.toISOString(),
          newValues: { projectId: order.projectId, awardId: order.tenderAwardId, revisionId,
            invoiceTotalPaise: fields.invoiceTotalPaise, tdsPaise, netPayablePaise }, reason: fields.reason }, session);
        return { orderId, version: revision, revisionId,
          invoiceNumber: fields.invoiceNumber, invoiceDate: fields.invoiceDate,
          invoiceEvidenceReference: fields.invoiceEvidenceReference,
          invoiceTotalPaise: fields.invoiceTotalPaise, tdsBasisPaise: fields.tdsBasisPaise,
          tdsRateBasisPoints: fields.tdsRateBasisPoints, tdsPaise, netPayablePaise,
          withholdingEffectiveDate: fields.withholdingEffectiveDate,
          withholdingRuleReference: fields.withholdingRuleReference, reason: fields.reason,
          assessedAt: timestamp.toISOString(), assessedById: actor.id };
      }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
    }
  };
}

function dto(row: Row, version: number): InvoiceAssessmentDto {
  return { orderId: String(row.orderId), version, revisionId: String(row._id),
    invoiceNumber: String(row.invoiceNumber), invoiceDate: String(row.invoiceDate),
    invoiceEvidenceReference: String(row.invoiceEvidenceReference), invoiceTotalPaise: Number(row.invoiceTotalPaise),
    tdsBasisPaise: Number(row.tdsBasisPaise), tdsRateBasisPoints: Number(row.tdsRateBasisPoints),
    tdsPaise: Number(row.tdsPaise), netPayablePaise: Number(row.netPayablePaise),
    withholdingEffectiveDate: String(row.withholdingEffectiveDate), withholdingRuleReference: String(row.withholdingRuleReference),
    reason: String(row.reason), assessedAt: new Date(row.assessedAt).toISOString(), assessedById: String(row.assessedById) };
}
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
