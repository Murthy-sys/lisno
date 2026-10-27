import { model, models, Schema } from "./mongoose.js";
const answerSchema = new Schema({ id: { type: String, required: true }, answer: { type: String, required: true, enum: ["pass", "fail", "not_applicable"] }, reason: { type: String, default: null },
  evidenceIds: { type: [String], default: [] }, sampleCount: { type: Number, min: 1, required: true } }, { _id: false, strict: "throw" });
const schema = new Schema({
  _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true },
  orderId: { type: String, required: true, immutable: true }, orderRevisionId: { type: String, required: true, immutable: true }, vendorId: { type: String, required: true, immutable: true },
  orderNumber: { type: String, required: true, immutable: true },
  basketId: { type: String, required: true, immutable: true }, basketName: { type: String, required: true, immutable: true }, checklistRevisionId: { type: String, required: true, immutable: true },
  checklistRevisionNumber: { type: Number, required: true, min: 1, immutable: true },
  sourceToken: { type: String, required: true, immutable: true }, parameters: { type: [Schema.Types.Mixed], required: true, immutable: true },
  week: { type: String, required: true, immutable: true }, correctionOf: { type: String, default: null, immutable: true }, correctionReason: { type: String, default: null, immutable: true },
  status: { type: String, required: true, enum: ["draft", "signed"] }, version: { type: Number, required: true, min: 1 }, answers: { type: [answerSchema], default: [] },
  createdAt: { type: Date, required: true, immutable: true }, createdById: { type: String, required: true, immutable: true },
  updatedAt: { type: Date, required: true }, updatedById: { type: String, required: true },
  signedAt: { type: Date, default: null }, signedById: { type: String, default: null }, signatureReason: { type: String, default: null }
}, { versionKey: false, strict: "throw" });
// A reissued order can require another inspection in the same week using the
// same checklist. Its source identity must not collide with immutable history.
schema.index({ projectId: 1, orderId: 1, orderRevisionId: 1, basketId: 1, checklistRevisionId: 1, sourceToken: 1, week: 1, correctionOf: 1 }, { unique: true, name: "project_quality_audit_round_source" });
schema.index({ projectId: 1, week: -1, createdAt: -1 });
export const ProjectQualityAuditModel = models.ProjectQualityAudit ?? model("ProjectQualityAudit", schema);
