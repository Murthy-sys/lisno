import { model, models, Schema } from "./mongoose.js";
import {
  estimateDesignExtractionStatuses,
  estimateDesignUploadPurposes
} from "../domain/estimate-design.js";

const replacementMappingSchema = new Schema({
  roomId: { type: String, default: null, immutable: true },
  scopeSectionId: { type: String, default: null, immutable: true },
  catalogueId: { type: String, default: null, immutable: true }
}, { _id: false, strict: "throw" });

const replacementTargetSnapshotSchema = new Schema({
  drawingId: { type: String, ref: "EstimateDesignDrawing", required: true, immutable: true },
  requestedRevisionId: { type: String, ref: "EstimateDesignRevision", required: true, immutable: true },
  detectedTitle: { type: String, required: true, maxlength: 500, immutable: true },
  normalizedTitle: { type: String, required: true, maxlength: 500, immutable: true },
  mapping: { type: replacementMappingSchema, required: true, immutable: true }
}, { _id: false, strict: "throw" });

const planRequestSnapshotSchema = new Schema({
  requestId: { type: String, ref: "EstimatePlanChangeRequest", required: true, immutable: true },
  requestVersion: { type: Number, required: true, min: 1, immutable: true },
  sourcePageId: { type: String, ref: "EstimateDesignSourcePage", required: true, immutable: true },
  idempotencyKey: { type: String, required: true, minlength: 8, maxlength: 128, immutable: true },
  targets: { type: [replacementTargetSnapshotSchema], required: true, immutable: true }
}, { _id: false, strict: "throw" });

const replacementMatchResultSchema = new Schema({
  drawingId: { type: String, ref: "EstimateDesignDrawing", required: true },
  requestedRevisionId: { type: String, ref: "EstimateDesignRevision", required: true },
  resultRevisionId: { type: String, ref: "EstimateDesignRevision", required: true },
  matchReason: { type: String, enum: ["normalized_title", "mapping_tuple"], required: true },
  pageNumber: { type: Number, required: true, min: 1 }
}, { _id: false, strict: "throw" });

const planRequestResultSchema = new Schema({
  matches: { type: [replacementMatchResultSchema], required: true },
  ignoredPageNumbers: { type: [Number], required: true }
}, { _id: false, strict: "throw" });

const estimateDesignUploadSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  estimateId: { type: String, ref: "Estimate", required: true, immutable: true },
  leadId: { type: String, ref: "Lead", required: true, immutable: true },
  originalFilename: { type: String, required: true, immutable: true, maxlength: 255 },
  storedFileReference: { type: String, required: true, immutable: true },
  mimeType: { type: String, required: true, immutable: true, enum: ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/tiff", "image/heic"] },
  sizeBytes: { type: Number, required: true, immutable: true, min: 0 },
  uploaderId: { type: String, ref: "User", required: true, immutable: true },
  uploadedAt: { type: Date, required: true, immutable: true },
  extractionStatus: { type: String, required: true, enum: estimateDesignExtractionStatuses },
  purpose: { type: String, enum: estimateDesignUploadPurposes, default: null, immutable: true },
  replacementDrawingId: { type: String, ref: "EstimateDesignDrawing", default: null, immutable: true },
  replacesRevisionId: { type: String, ref: "EstimateDesignRevision", default: null, immutable: true },
  replacementVersion: { type: Number, default: null, min: 1, immutable: true },
  planRequestReplacement: { type: planRequestSnapshotSchema, default: null, immutable: true },
  planRequestReplacementResult: { type: planRequestResultSchema, default: null },
  failureCode: { type: String, default: null, maxlength: 64 },
  deletedAt: { type: Date, default: null },
  deletedById: { type: String, ref: "User", default: null },
  failureMessage: { type: String, default: null, maxlength: 500 }
}, { timestamps: true, versionKey: false });

estimateDesignUploadSchema.index({ estimateId: 1, uploadedAt: -1, _id: -1 });
estimateDesignUploadSchema.index(
  {
    purpose: 1,
    "planRequestReplacement.requestId": 1,
    "planRequestReplacement.idempotencyKey": 1
  },
  {
    unique: true,
    partialFilterExpression: { purpose: "plan_request_replacement" }
  }
);

export const EstimateDesignUploadModel = models.EstimateDesignUpload ?? model("EstimateDesignUpload", estimateDesignUploadSchema);
