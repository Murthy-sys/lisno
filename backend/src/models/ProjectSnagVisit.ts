import { model, models, Schema } from "./mongoose.js";
const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true },
  snagIds: { type: [String], required: true, immutable: true },
  visitedAt: { type: Date, required: true, immutable: true },
  reason: { type: String, required: true, maxlength: 2000, immutable: true },
  postHandover: { type: Boolean, required: true, immutable: true },
  actorId: { type: String, required: true, immutable: true },
  recordedAt: { type: Date, required: true, immutable: true },
  evidenceIds: { type: [String], default: [], immutable: true }
}, { versionKey: false, strict: "throw" });
schema.index({ projectId: 1, visitedAt: -1, _id: 1 });
export const ProjectSnagVisitModel = models.ProjectSnagVisit ?? model("ProjectSnagVisit", schema);
