import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";
import { storedProcurementSource } from "../domain/project-procurement.js";
import { model, models, Schema } from "./mongoose.js";

const baselineReceiptSchema = new Schema({
  idempotencyKey: { type: String, required: true, maxlength: 200 },
  requestDigest: { type: String, required: true, minlength: 64, maxlength: 64 },
  vendorId: { type: String, required: true },
  allocatedWorkPaise: { type: Number, required: true, min: 1, max: MAX_FINANCE_AMOUNT_PAISE, validate: Number.isSafeInteger },
  version: { type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger },
  recordedAt: { type: Date, required: true },
  recordedById: { type: String, required: true }
}, { _id: false, strict: "throw" });

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true, ref: "Project" },
  estimateId: { type: String, default: null, maxlength: 500 },
  estimateVersion: { type: Number, default: null, min: 1, max: Number.MAX_SAFE_INTEGER, validate: (value: number | null) => value === null || Number.isSafeInteger(value) },
  estimateReviewRoundId: { type: String, default: null, maxlength: 500 },
  sourceSectionId: { type: String, default: null, maxlength: 500 },
  sourceLineItemKey: { type: String, default: null, maxlength: 500 },
  itemName: { type: String, required: true, maxlength: 200 },
  itemNameNormalized: { type: String, required: true, maxlength: 400 },
  brand: { type: String, required: true, maxlength: 200 },
  brandNormalized: { type: String, required: true, maxlength: 400 },
  uomId: { type: String, required: true },
  uomCode: { type: String, required: true },
  uomName: { type: String, required: true },
  uomSearch: { type: String, required: true },
  vendorId: { type: String, default: null },
  vendorCode: { type: String, default: null },
  vendorName: { type: String, default: null },
  vendorSearch: { type: String, default: null },
  pricePaise: { type: Number, required: true, min: 1, max: MAX_FINANCE_AMOUNT_PAISE, validate: Number.isSafeInteger },
  allocatedWorkPaise: { type: Number, default: null, min: 1, max: MAX_FINANCE_AMOUNT_PAISE, validate: (value: number | null) => value === null || Number.isSafeInteger(value) },
  // Service-owned, monotonic provenance. Null preserves eligibility of pre-feature rows.
  allocationTrackingVersion: { type: Number, default: null, enum: [1, null] },
  allocationBaselineReceipt: { type: baselineReceiptSchema, default: null },
  version: { type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger },
  createdById: { type: String, required: true, immutable: true, ref: "User" },
  updatedById: { type: String, required: true, ref: "User" }
}, { collection: "projectProcurementItems", timestamps: true, versionKey: false, strict: "throw" });

schema.pre("validate", function () {
  try { storedProcurementSource(this.toObject()); } catch { this.invalidate("estimateId", "Procurement estimate source must be complete or absent."); }
});
export const PROJECT_PROCUREMENT_SOURCE_INDEX_NAME = "project_procurement_source_item_unique";
export const PROJECT_PROCUREMENT_SOURCE_INDEX_KEY = { projectId: 1, estimateId: 1, estimateVersion: 1, sourceLineItemKey: 1, itemNameNormalized: 1, brandNormalized: 1, uomId: 1, vendorId: 1 } as const;
schema.index(PROJECT_PROCUREMENT_SOURCE_INDEX_KEY, { unique: true, name: PROJECT_PROCUREMENT_SOURCE_INDEX_NAME });
schema.index({ projectId: 1, itemNameNormalized: 1, brandNormalized: 1, _id: 1 });
schema.index({ vendorId: 1, allocatedWorkPaise: 1, allocationTrackingVersion: 1, _id: 1 }, { name: "project_procurement_vendor_allocation" });

export const ProjectProcurementItemModel = models.ProjectProcurementItem ?? model("ProjectProcurementItem", schema);
