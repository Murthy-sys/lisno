import {
  ESTIMATE_CLIENT_PROOF_MIME_TYPES,
  ESTIMATE_CLIENT_SHA256
} from "../domain/estimate-client-review.js";
import { model, models, Schema } from "./mongoose.js";

const estimateClientResponseProofSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    reviewRoundId: {
      type: String,
      ref: "EstimateClientReviewRound",
      required: true,
      immutable: true
    },
    estimateId: { type: String, ref: "Estimate", required: true, immutable: true },
    storageReference: {
      type: String,
      required: true,
      immutable: true,
      select: false
    },
    originalFilename: { type: String, required: true, immutable: true },
    mimeType: {
      type: String,
      enum: ESTIMATE_CLIENT_PROOF_MIME_TYPES,
      required: true,
      immutable: true
    },
    byteSize: { type: Number, required: true, immutable: true, min: 1 },
    sha256: {
      type: String,
      required: true,
      immutable: true,
      match: ESTIMATE_CLIENT_SHA256
    },
    uploadedById: { type: String, ref: "User", required: true, immutable: true },
    uploadedAt: { type: Date, required: true, immutable: true }
  },
  { versionKey: false }
);

estimateClientResponseProofSchema.index({ reviewRoundId: 1 }, { unique: true });

export const EstimateClientResponseProofModel =
  models.EstimateClientResponseProof ??
  model("EstimateClientResponseProof", estimateClientResponseProofSchema);
