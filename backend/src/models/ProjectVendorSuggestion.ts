import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true, ref: "Project" },
  estimateId: { type: String, required: true, immutable: true, ref: "Estimate" },
  estimateVersion: { type: Number, required: true, immutable: true, min: 1, validate: Number.isSafeInteger },
  estimateReviewRoundId: { type: String, default: null, immutable: true },
  designPlanVersion: { type: Number, required: true, immutable: true, min: 1, validate: Number.isSafeInteger },
  vendorId: { type: String, required: true, immutable: true },
  vendorCodeSnapshot: { type: String, required: true, immutable: true },
  vendorNameSnapshot: { type: String, required: true, immutable: true },
  note: { type: String, default: "", maxlength: 1000 },
  status: { type: String, enum: ["suggested", "withdrawn"], required: true },
  version: { type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger },
  idempotencyKey: { type: String, required: true, immutable: true, maxlength: 120 },
  requestHash: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
  createdById: { type: String, required: true, immutable: true, ref: "User" },
  createdByName: { type: String, required: true, immutable: true },
  updatedById: { type: String, required: true, ref: "User" },
  updatedByName: { type: String, required: true }
}, { collection: "projectVendorSuggestions", timestamps: true, versionKey: false, strict: "throw" });
schema.index({ projectId: 1, estimateId: 1, estimateVersion: 1, designPlanVersion: 1, vendorId: 1 }, { unique: true, name: "project_vendor_suggestion_source_unique" });
schema.index({ createdById: 1, idempotencyKey: 1 }, { unique: true, name: "project_vendor_suggestion_request_unique" });
schema.index({ projectId: 1, estimateId: 1, estimateVersion: 1, designPlanVersion: 1, createdAt: -1, _id: 1 });
export const ProjectVendorSuggestionModel = models.ProjectVendorSuggestion ?? model("ProjectVendorSuggestion", schema);
