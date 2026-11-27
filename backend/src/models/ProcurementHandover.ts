import { model, models, Schema } from "./mongoose.js";
const schema = new Schema({
  _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  currentRevisionId: { type: String, required: true }, submittedRevisionId: { type: String, default: null },
  status: { type: String, enum: ["draft", "submitted"], required: true },
  updatedAt: { type: Date, required: true }, updatedById: { type: String, required: true }
}, { strict: "throw", versionKey: false });
schema.index({ projectId: 1 }, { unique: true });
export const ProcurementHandoverModel = models.ProcurementHandover ?? model("ProcurementHandover", schema);
