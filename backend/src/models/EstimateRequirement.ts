import { model, models, Schema } from "./mongoose.js";

const historySchema = new Schema({
  version: { type: Number, required: true }, actorId: { type: String, required: true },
  at: { type: String, required: true }, action: { type: String, required: true },
  mainLineId: { type: String, default: null, ref: "AiEstimatorKnowledgeMainLine" },
  mainBasketId: { type: String, required: true }, roomId: { type: String, default: null },
  text: { type: String, required: true }, status: { type: String, required: true },
  reason: { type: String, default: "" }, lineItemIds: { type: [String], default: [] }
}, { _id: false, strict: "throw" });
const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true, ref: "Project" },
  estimateId: { type: String, default: null, ref: "Estimate" },
  phase: { type: String, enum: ["pre", "post"], required: true, immutable: true },
  mainLineId: { type: String, default: null, ref: "AiEstimatorKnowledgeMainLine" },
  mainBasketId: { type: String, required: true }, roomId: { type: String, default: null },
  text: { type: String, required: true, maxlength: 4000 },
  authorId: { type: String, required: true, immutable: true, ref: "User" },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  status: { type: String, enum: ["open", "included", "declined", "withdrawn", "superseded"], required: true },
  lineItemIds: { type: [String], default: [] }, reason: { type: String, default: "", maxlength: 2000 },
  supersededById: { type: String, default: null },
  resolvedById: { type: String, default: null }, resolvedAt: { type: String, default: null },
  idempotencyKey: { type: String, required: true, immutable: true },
  requestDigest: { type: String, required: true, immutable: true, select: false },
  history: { type: [historySchema], default: [], select: false },
  createdAt: { type: String, required: true, immutable: true }, updatedAt: { type: String, required: true }
}, { versionKey: false, strict: "throw" });
schema.index({ projectId: 1, authorId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ projectId: 1, status: 1, createdAt: 1 });
export const EstimateRequirementModel = models.EstimateRequirement ?? model("EstimateRequirement", schema);
