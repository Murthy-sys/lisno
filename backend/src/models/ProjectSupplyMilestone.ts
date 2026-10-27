import { model, models, Schema } from "./mongoose.js";
const signature = new Schema({ actorId: { type: String, required: true }, role: { type: String, required: true },
  at: { type: Date, required: true }, reason: { type: String, required: true }, evidenceIds: { type: [String], default: [] } }, { _id: false });
const schema = new Schema({
  _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true },
  sourceId: { type: String, required: true, immutable: true }, sourceToken: { type: String, required: true, immutable: true },
  sourceLineItemKey: { type: String, required: true, immutable: true }, title: { type: String, required: true, immutable: true },
  requiredReviewerIds: { type: [String], required: true, immutable: true },
  round: { type: Number, required: true, min: 1 }, version: { type: Number, required: true, min: 1 },
  signatures: { type: [signature], default: [] }, createdById: { type: String, required: true, immutable: true }
}, { timestamps: true, versionKey: false, strict: "throw" });
schema.index({ projectId: 1, sourceId: 1, sourceToken: 1 }, { unique: true });
export const ProjectSupplyMilestoneModel = models.ProjectSupplyMilestone ?? model("ProjectSupplyMilestone", schema);
