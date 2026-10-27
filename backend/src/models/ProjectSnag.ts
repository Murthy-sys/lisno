import { model, models, Schema } from "./mongoose.js";
const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true },
  assignmentId: { type: String, default: null, immutable: true },
  sourceLineItemKey: { type: String, default: null, immutable: true },
  sourceSectionId: { type: String, default: null, immutable: true },
  vendorId: { type: String, default: null, immutable: true },
  vendorName: { type: String, default: null, immutable: true },
  roomId: { type: String, default: null, immutable: true },
  roomName: { type: String, default: null, immutable: true },
  tradeName: { type: String, default: null, immutable: true },
  ownerId: { type: String, default: null },
  title: { type: String, required: true, maxlength: 180, immutable: true },
  description: { type: String, required: true, maxlength: 2000, immutable: true },
  severity: { type: String, required: true, enum: ["critical", "warning", "neutral"], immutable: true },
  status: { type: String, required: true, enum: ["open", "in_progress", "resolved", "verified"] },
  dueAt: { type: Date, default: null, immutable: true },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  postHandover: { type: Boolean, required: true, immutable: true },
  createdById: { type: String, required: true, immutable: true },
  createdAt: { type: Date, required: true, immutable: true }, updatedAt: { type: Date, required: true },
  resolvedAt: { type: Date, default: null }, resolvedById: { type: String, default: null },
  verifiedAt: { type: Date, default: null }, verifiedById: { type: String, default: null },
  reopenedAfterHandoverAt: { type: Date, default: null },
  evidenceIds: { type: [String], default: [] }
}, { versionKey: false, strict: "throw" });
schema.index({ projectId: 1, status: 1, severity: 1, dueAt: 1, _id: 1 });
schema.index({ projectId: 1, roomId: 1, sourceSectionId: 1, vendorId: 1, status: 1 });
export const ProjectSnagModel = models.ProjectSnag ?? model("ProjectSnag", schema);
