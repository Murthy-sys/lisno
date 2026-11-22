import { model, models, Schema } from "./mongoose.js";

// A receipt outlives the reviewed version, including when the successful command was a no-op.
const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  requestDigest: { type: String, required: true, immutable: true },
  updatedMainLineIds: { type: [String], required: true, immutable: true },
  auditEventId: { type: String, default: null, immutable: true }
}, { collection: "aiEstimatorKnowledgeMarginOperations", versionKey: false, strict: "throw" });

export const AiEstimatorKnowledgeMarginOperationModel = models.AiEstimatorKnowledgeMarginOperation
  ?? model("AiEstimatorKnowledgeMarginOperation", schema);
