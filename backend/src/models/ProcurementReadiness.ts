import { model, models, Schema } from "./mongoose.js";

const state = new Schema({
  _id: { type: String, required: true }, projectId: { type: String, required: true },
  version: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ["submitted", "withdrawn", "correction_requested"], required: true },
  declarationId: { type: String, default: null }, updatedAt: { type: Date, required: true }
}, { collection: "procurementReadinessStates", versionKey: false, strict: "throw" });
const declaration = new Schema({
  _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true },
  version: { type: Number, required: true, immutable: true },
  actorId: { type: String, required: true, immutable: true }, actorName: { type: String, required: true, immutable: true },
  at: { type: Date, required: true, immutable: true }, reason: { type: String, required: true, immutable: true },
  sourceDigest: { type: String, required: true, immutable: true }, references: { type: Schema.Types.Mixed, required: true, immutable: true }
}, { collection: "procurementReadinessDeclarations", versionKey: false, strict: "throw" });
declaration.index({ projectId: 1, version: 1 }, { unique: true });
export const ProcurementReadinessStateModel = models.ProcurementReadinessState ?? model("ProcurementReadinessState", state);
export const ProcurementReadinessDeclarationModel = models.ProcurementReadinessDeclaration ?? model("ProcurementReadinessDeclaration", declaration);
