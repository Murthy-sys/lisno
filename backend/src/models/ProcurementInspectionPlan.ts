import { model, models, Schema } from "./mongoose.js";
const slot = new Schema({ id: { type: String, required: true }, startsAt: { type: Date, required: true }, endsAt: { type: Date, required: true }, plannedAt: { type: Date, required: true }, originalPlannedAt: { type: Date, required: true } }, { _id: false, strict: "throw" });
const revision = new Schema({ version: { type: Number, required: true }, count: { type: Number, required: true, enum: [2, 3] }, sourceDigest: { type: String, required: true }, slots: { type: [slot], required: true }, at: { type: Date, required: true }, actorId: { type: String, required: true }, reason: { type: String, required: true } }, { _id: false, strict: "throw" });
const schema = new Schema({
  _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger }, count: { type: Number, required: true, enum: [2, 3] },
  sourceDigest: { type: String, required: true }, slots: { type: [slot], required: true }, revisions: { type: [revision], required: true },
  createdAt: { type: Date, required: true, immutable: true }, updatedAt: { type: Date, required: true }
}, { strict: "throw", versionKey: false });
schema.index({ projectId: 1 }, { unique: true });
export const ProcurementInspectionPlanModel = models.ProcurementInspectionPlan ?? model("ProcurementInspectionPlan", schema);
