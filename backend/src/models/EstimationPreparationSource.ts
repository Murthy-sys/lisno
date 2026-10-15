import { Schema } from "./mongoose.js";

/** Provenance of a frozen preparation release, distinct from a client approval. */
export const estimationPreparationSourceSchema = new Schema({
  estimateId: { type: String, required: true },
  estimateVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  estimateReviewRoundId: { type: String, default: null },
  workflowVersion: { type: Number, enum: [2], required: true },
  phase: { type: String, enum: ["pre", "post"], required: true },
  kind: { type: String, enum: ["approved_pre", "released_post", "approved_final"], required: true },
  sourceSnapshotId: { type: String, required: true },
  sourceDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u }
}, { _id: false, strict: "throw" });
