import { model, models, Schema } from "./mongoose.js";
const schema = new Schema({
  _id: { type: String, required: true }, projectId: { type: String, required: true }, entityId: { type: String, required: true },
  uploaderId: { type: String, required: true }, storageReference: { type: String, required: true }, originalFilename: { type: String, required: true },
  mimeType: { type: String, required: true }, byteSize: { type: Number, required: true }, sha256: { type: String, required: true },
  kind: { type: String, enum: ["image", "video", "document"], required: true }, createdAt: { type: Date, required: true },
  referenceEpoch: { type: Number, default: 0 }
}, { versionKey: false });
schema.index({ projectId: 1, entityId: 1 });
schema.index({ projectId: 1, entityId: 1, uploaderId: 1, sha256: 1, byteSize: 1 }, { unique: true });
export const ProjectManagerEvidenceModel = models.ProjectManagerEvidence ?? model("ProjectManagerEvidence", schema);
const cleanupSchema = new Schema({ _id: { type: String, required: true }, createdAt: { type: Date, required: true }, attempts: { type: Number, default: 0 } }, { versionKey: false });
export const ProjectManagerEvidenceCleanupModel = models.ProjectManagerEvidenceCleanup ?? model("ProjectManagerEvidenceCleanup", cleanupSchema);
