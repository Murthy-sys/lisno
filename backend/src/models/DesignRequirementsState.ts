import { model, models, Schema } from "./mongoose.js";
const eventSchema = new Schema({
  id: { type: String, required: true }, entryId: { type: String, required: true }, sourceDigest: { type: String, required: true },
  ruleKey: { type: String, required: true }, lineItemId: { type: String, required: true }, mainLineId: { type: String, required: true },
  action: { type: String, enum: ["complete", "approve", "defer", "reopen"], required: true },
  actorId: { type: String, required: true }, actorRole: { type: String, required: true }, occurredAt: { type: String, required: true },
  note: { type: String, required: true }, checkedPointIds: { type: [String], required: true },
  idempotencyKey: { type: String, required: true }, requestDigest: { type: String, required: true }
}, { _id: false, strict: "throw" });
const schema = new Schema({
  _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true },
  version: { type: Number, required: true, min: 0 }, dependencyEpoch: { type: Number, default: 0, min: 0 },
  history: { type: [eventSchema], required: true, default: [], select: false }
}, { versionKey: false, strict: "throw" });
export const DesignRequirementsStateModel = models.DesignRequirementsState ?? model("DesignRequirementsState", schema);
