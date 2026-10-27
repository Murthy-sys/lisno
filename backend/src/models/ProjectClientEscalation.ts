import { model, models, Schema } from "./mongoose.js";
const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true },
  clientId: { type: String, default: null, immutable: true },
  title: { type: String, required: true, maxlength: 180, immutable: true },
  description: { type: String, required: true, maxlength: 2000, immutable: true },
  status: { type: String, required: true, enum: ["open", "pending", "resolved"] },
  ownerId: { type: String, required: true }, followUpAt: { type: Date, default: null },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  createdById: { type: String, required: true, immutable: true },
  createdAt: { type: Date, required: true, immutable: true }, updatedAt: { type: Date, required: true },
  resolvedAt: { type: Date, default: null }, evidenceIds: { type: [String], default: [] }
}, { versionKey: false, strict: "throw" });
schema.index({ projectId: 1, status: 1, followUpAt: 1, _id: 1 });
export const ProjectClientEscalationModel = models.ProjectClientEscalation ?? model("ProjectClientEscalation", schema);
