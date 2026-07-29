import { model, models, Schema } from "./mongoose.js";

const leadActivitySchema = new Schema({
  _id: { type: String, required: true }, leadId: { type: String, ref: "Lead", required: true, immutable: true },
  actorId: { type: String, ref: "User", required: true, immutable: true }, type: { type: String, required: true, immutable: true },
  note: { type: String, required: true, immutable: true }, occurredAt: { type: Date, required: true, immutable: true }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
leadActivitySchema.index({ leadId: 1, occurredAt: -1, _id: -1 });
export const LeadActivityModel = models.LeadActivity ?? model("LeadActivity", leadActivitySchema);
