import { model, models, Schema } from "./mongoose.js";

const preparationSnapshotSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true },
  estimateId: { type: String, required: true, immutable: true },
  estimateVersion: { type: Number, required: true, min: 1, immutable: true },
  requirementsVersion: { type: Number, required: true, min: 0, immutable: true },
  designScopeRevision: { type: Number, required: true, min: 1, immutable: true },
  phase: { type: String, enum: ["post"], required: true, immutable: true },
  sourceDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u, immutable: true },
  snapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
  releasedById: { type: String, required: true, immutable: true },
  releasedAt: { type: Date, required: true, immutable: true }
}, { versionKey: false, strict: "throw" });
preparationSnapshotSchema.index({ estimateId: 1, estimateVersion: 1 }, { unique: true });
preparationSnapshotSchema.index({ projectId: 1, releasedAt: -1 });
export const EstimatePreparationSnapshotModel = models.EstimatePreparationSnapshot ??
  model("EstimatePreparationSnapshot", preparationSnapshotSchema);
