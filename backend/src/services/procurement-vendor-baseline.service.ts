import { createHash } from "node:crypto";
import mongoose from "mongoose";
import type { ProcurementVendorBaselineInput, ProcurementVendorBaselinePage, ProcurementVendorBaselineResult } from "../contracts/procurement-vendor.js";
import { procurementVendorBaselineQuerySchema, procurementVendorBaselineSchema } from "../domain/procurement-vendor-allocation.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectProcurementItemModel } from "../models/ProjectProcurementItem.js";
import { aiEstimatorKnowledgeActorGuard } from "./ai-estimator-knowledge-actor.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { lockProcurementVendors } from "./procurement-vendor-allocation.service.js";

type Row = Record<string, any>;
export interface ProcurementVendorBaselineService {
  list(actor: PublicUser, vendorId: string, query: { limit: number; offset: number }): Promise<ProcurementVendorBaselinePage>;
  complete(actor: PublicUser, vendorId: string, itemId: string, input: ProcurementVendorBaselineInput): Promise<ProcurementVendorBaselineResult>;
}

export function createProcurementVendorBaselineService(input: { audit: AuditService; now?: () => Date }): ProcurementVendorBaselineService {
  const now = input.now ?? (() => new Date());
  return {
    async list(actor, vendorId, query) {
      return mongoose.connection.transaction(async (session) => {
        await aiEstimatorKnowledgeActorGuard.requireReadActor(actor, session);
        if (!await AiEstimatorKnowledgeVendorModel.exists({ _id: vendorId }).session(session)) vendorNotFound();
        const parsed = procurementVendorBaselineQuerySchema.safeParse(query);
        if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid allocation baseline pagination.");
        const { limit, offset } = parsed.data;
        const filter = baselineFilter(vendorId);
        const total = await ProjectProcurementItemModel.countDocuments(filter).session(session);
        const rows = await ProjectProcurementItemModel.find(filter).select({ _id: 1, projectId: 1, itemName: 1, brand: 1, version: 1 })
          .sort({ _id: 1 }).skip(offset).limit(limit).session(session).lean();
        const projects = await ProjectModel.find({ _id: { $in: [...new Set(rows.map((row) => row.projectId))] } })
          .select({ _id: 1, name: 1 }).session(session).lean();
        const names = new Map(projects.map((project) => [String(project._id), String(project.name)]));
        return { items: rows.map((row) => ({ itemId: String(row._id), projectId: row.projectId,
          projectName: names.get(row.projectId) ?? "Unavailable project", itemName: row.itemName, brand: row.brand, version: row.version })), total, limit, offset };
      }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
    },
    async complete(actor, vendorId, itemId, value) {
      return mongoose.connection.transaction(async (session) => {
        await aiEstimatorKnowledgeActorGuard.requireMutationActor(actor, session);
        const parsed = procurementVendorBaselineSchema.safeParse(value);
        if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])));
        const fields = parsed.data;
        const vendors = await lockProcurementVendors([vendorId], session);
        if (!vendors.has(vendorId)) vendorNotFound();
        const current = await ProjectProcurementItemModel.findById(itemId).session(session).lean();
        if (!current) itemNotFound();
        const requestDigest = createHash("sha256").update(JSON.stringify({ vendorId, itemId, ...fields })).digest("hex");
        const receipt = current.allocationBaselineReceipt;
        if (receipt) {
          if (receipt.idempotencyKey !== fields.idempotencyKey || receipt.requestDigest !== requestDigest || receipt.recordedById !== actor.id) {
            throw new ApiError(409, "PROCUREMENT_VENDOR_BASELINE_IDEMPOTENCY_CONFLICT", "This item's historical allocation has already been recorded with a different request.");
          }
          return receiptResult(current, receipt);
        }
        if (current.vendorId !== vendorId) itemNotFound();
        if (current.version !== fields.expectedVersion) throw new ApiError(409, "PROCUREMENT_ITEM_VERSION_CONFLICT", "This item has changed. Reload the latest allocation baseline before saving again.");
        if (current.allocationTrackingVersion != null || current.allocatedWorkPaise != null) {
          throw new ApiError(409, "PROCUREMENT_VENDOR_BASELINE_INELIGIBLE", "Only unrecorded historical vendor allocations can be completed here.");
        }
        const timestamp = now();
        const recordedReceipt = { idempotencyKey: fields.idempotencyKey, requestDigest, vendorId,
          allocatedWorkPaise: fields.allocatedWorkPaise, version: current.version + 1, recordedAt: timestamp, recordedById: actor.id };
        const updated = await ProjectProcurementItemModel.findOneAndUpdate({ _id: itemId, version: fields.expectedVersion, ...baselineFilter(vendorId) }, {
          $set: { allocatedWorkPaise: fields.allocatedWorkPaise, allocationTrackingVersion: 1, allocationBaselineReceipt: recordedReceipt,
            updatedById: actor.id, updatedAt: timestamp }, $inc: { version: 1 }
        }, { session, returnDocument: "after", runValidators: true, timestamps: false }).lean();
        if (!updated) throw new ApiError(409, "PROCUREMENT_ITEM_VERSION_CONFLICT", "This item has changed. Reload the latest allocation baseline before saving again.");
        const result = receiptResult(updated, recordedReceipt);
        await input.audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement_vendor_allocation_baseline_recorded",
          entityType: "project_procurement_item", entityId: itemId, occurredAt: timestamp.toISOString(), reason: fields.reason,
          oldValues: { vendorId, allocatedWorkPaise: null, version: current.version }, newValues: { ...result } }, session);
        return result;
      }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
    }
  };
}

function baselineFilter(vendorId: string) {
  // Equality to null intentionally matches absent fields in pre-feature documents.
  return { vendorId, allocatedWorkPaise: null, allocationTrackingVersion: null };
}
function receiptResult(item: Row, receipt: Row): ProcurementVendorBaselineResult {
  return { itemId: String(item._id), projectId: item.projectId, vendorId: receipt.vendorId,
    allocatedWorkPaise: receipt.allocatedWorkPaise, version: receipt.version, recordedAt: new Date(receipt.recordedAt).toISOString() };
}
function vendorNotFound(): never { throw new ApiError(404, "PROCUREMENT_VENDOR_NOT_FOUND", "Vendor not found."); }
function itemNotFound(): never { throw new ApiError(404, "PROCUREMENT_ITEM_NOT_FOUND", "Procurement item not found for this vendor."); }
