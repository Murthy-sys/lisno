import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  vendorId: { type: String, required: true, immutable: true },
  source: { type: String, enum: ["vendor_self", "procurement"], required: true, immutable: true },
  vendorType: { type: String, enum: ["execution", "supplier"], required: true, immutable: true },
  rubricVersion: { type: Number, required: true, immutable: true },
  rubricGeneration: { type: Number, required: true, min: 0, immutable: true },
  scores: { type: [{ key: { type: String, required: true }, score: { type: Number, required: true, min: 0, max: 100 } }], required: true, immutable: true },
  averageScoreBps: { type: Number, required: true, min: 0, max: 10_000, immutable: true },
  revision: { type: Number, required: true, min: 1, immutable: true },
  comment: { type: String, default: null, maxlength: 2_000, immutable: true },
  submittedAt: { type: Date, required: true, immutable: true },
  actorId: { type: String, default: null, immutable: true },
  requestId: { type: String, default: null, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true },
  payloadHash: { type: String, required: true, immutable: true }
}, { collection: "vendorKpiAssessments", strict: "throw", versionKey: false });
schema.index({ vendorId: 1, source: 1, rubricGeneration: 1, rubricVersion: 1, revision: -1 }, { unique: true });
schema.index({ vendorId: 1, source: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ vendorId: 1, source: 1, rubricGeneration: 1, rubricVersion: 1, submittedAt: -1 });
export const VendorKpiAssessmentModel = models.VendorKpiAssessment ?? model("VendorKpiAssessment", schema);
