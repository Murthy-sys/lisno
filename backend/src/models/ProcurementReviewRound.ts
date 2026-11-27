import { model, models, Schema } from "./mongoose.js";
const history = new Schema({ action: { type: String, required: true }, actorId: { type: String, required: true }, at: { type: Date, required: true }, reason: { type: String, default: null }, sourceDigest: { type: String, required: true }, members: { type: [Schema.Types.Mixed], default: [] } }, { _id: false, strict: "throw" });
const schema = new Schema({
  _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true },
  sequence: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  status: { type: String, required: true, enum: ["open", "paused", "submitted", "missed"] },
  sourceDigest: { type: String, required: true }, members: { type: [Schema.Types.Mixed], required: true },
  opensAt: { type: Date, required: true, immutable: true }, originalDueAt: { type: Date, required: true, immutable: true },
  effectiveDueAt: { type: Date, required: true }, timezone: { type: String, required: true, immutable: true },
  intervalDays: { type: Number, required: true, min: 1, max: 7, immutable: true },
  policyVersion: { type: Number, required: true, immutable: true },
  pausedAt: { type: Date, default: null }, lateBeforePause: { type: Boolean, default: false },
  submittedAt: { type: Date, default: null }, submittedById: { type: String, default: null },
  notes: { type: String, default: null }, createdAt: { type: Date, required: true, immutable: true },
  changes: { type: [history], default: [] }
}, { strict: "throw", versionKey: false });
schema.index({ projectId: 1, sequence: 1 }, { unique: true });
schema.index({ projectId: 1, effectiveDueAt: -1 });
export const ProcurementReviewRoundModel = models.ProcurementReviewRound ?? model("ProcurementReviewRound", schema);
