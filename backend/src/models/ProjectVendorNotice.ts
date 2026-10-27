import { model, models, Schema } from "./mongoose.js";
const schema = new Schema({
  _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true },
  vendorId: { type: String, required: true, immutable: true }, sourceToken: { type: String, required: true, immutable: true },
  vendorName: { type: String, required: true, immutable: true },
  kind: { type: String, required: true, enum: ["quality", "absenteeism", "misbehaviour", "ppe", "cleaning", "stop_work"], immutable: true },
  reason: { type: String, required: true, immutable: true }, evidenceIds: { type: [String], default: [] },
  assignmentIds: { type: [String], default: [], immutable: true }, reviewDate: { type: String, default: null, immutable: true },
  status: { type: String, required: true, enum: ["open", "acknowledged", "resolved"] }, version: { type: Number, required: true, min: 1 },
  createdById: { type: String, required: true, immutable: true }, createdAt: { type: Date, required: true, immutable: true },
  resolvedById: { type: String, default: null }, resolvedAt: { type: Date, default: null }, resolutionReason: { type: String, default: null }
}, { versionKey: false, strict: "throw" });
schema.index({ projectId: 1, vendorId: 1, status: 1, createdAt: -1 });
export const ProjectVendorNoticeModel = models.ProjectVendorNotice ?? model("ProjectVendorNotice", schema);
