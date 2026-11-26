import { model, models, Schema } from "./mongoose.js";

const previewSchema = new Schema({
  projectName: { type: String, required: true },
  projectLocation: { type: String, default: null },
  preferredLanguage: { type: String, default: null },
  scopeSummary: {
    itemCount: { type: Number, required: true, min: 0 },
    sectionCount: { type: Number, required: true, min: 0 },
    roomCount: { type: Number, required: true, min: 0 }
  }
}, { _id: false, strict: "throw" });

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true },
  estimateId: { type: String, required: true, immutable: true },
  sourceRevision: { type: String, required: true, immutable: true },
  sourceSnapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
  designerId: { type: String, required: true, immutable: true },
  designerName: { type: String, required: true, immutable: true },
  proposedById: { type: String, required: true, immutable: true },
  previousDesignerId: { type: String, default: null, immutable: true },
  safePreview: { type: previewSchema, required: true, immutable: true },
  status: { type: String, enum: ["pending", "accepted", "declined", "cancelled"], required: true },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  createIdempotencyKey: { type: String, required: true, immutable: true },
  decisionIdempotencyKey: { type: String, default: null },
  decisionPayloadDigest: { type: String, default: null },
  decidedById: { type: String, default: null },
  createdAt: { type: Date, required: true, immutable: true },
  decidedAt: { type: Date, default: null },
  decisionNote: { type: String, default: null, maxlength: 1000 },
  closureReason: { type: String, enum: ["assigned_elsewhere", "cancelled_by_admin"], default: null }
}, { versionKey: false, strict: "throw" });

schema.index({ projectId: 1, designerId: 1 }, { unique: true, partialFilterExpression: { status: "pending" }, name: "one_pending_designer_request_per_project_designer" });
schema.index({ projectId: 1, proposedById: 1, createIdempotencyKey: 1 }, { unique: true });
schema.index({ designerId: 1, status: 1, createdAt: -1, _id: 1 });
schema.index({ projectId: 1, createdAt: -1, _id: 1 });

export const DesignerAssignmentRequestModel = models.DesignerAssignmentRequest ?? model("DesignerAssignmentRequest", schema);
