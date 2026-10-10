import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true },
  vendorId: { type: String, default: null, immutable: true },
  assignmentId: { type: String, default: null, immutable: true },
  version: { type: Number, required: true, min: 0, immutable: true },
  kind: { type: String, required: true, maxlength: 100, immutable: true },
  occurredAt: { type: Date, required: true, immutable: true }
}, { collection: "executionChangeEvents", versionKey: false, strict: "throw" });
schema.index({ projectId: 1, occurredAt: -1, _id: 1 });
schema.index({ vendorId: 1, occurredAt: -1, _id: 1 });
schema.index({ occurredAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
export const ExecutionChangeEventModel = models.ExecutionChangeEvent ?? model("ExecutionChangeEvent", schema);
