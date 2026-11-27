import { model, models, Schema } from "./mongoose.js";
const schema = new Schema({
  _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true },
  planId: { type: String, required: true, immutable: true }, planVersion: { type: Number, required: true, immutable: true },
  rootVisitId: { type: String, required: true, immutable: true }, slotId: { type: String, default: null, immutable: true },
  revision: { type: Number, required: true, min: 1, immutable: true }, correctionOf: { type: String, default: null, immutable: true },
  correctionReason: { type: String, default: null, immutable: true }, isOriginal: { type: Boolean, required: true, immutable: true },
  sourceDigest: { type: String, required: true, immutable: true }, inspectedAt: { type: Date, required: true, immutable: true },
  recordedAt: { type: Date, required: true, immutable: true }, inspectorId: { type: String, required: true, immutable: true },
  inspectorName: { type: String, required: true, immutable: true }, itemIds: { type: [String], required: true, immutable: true },
  items: { type: [Schema.Types.Mixed], required: true, immutable: true }, notes: { type: String, required: true, maxlength: 2000, immutable: true },
  delayed: { type: Boolean, required: true, immutable: true }, delayReason: { type: String, default: null, immutable: true },
  responsibleParty: { type: String, default: null, immutable: true }, recoveryAction: { type: String, default: null, immutable: true },
  recoveryDate: { type: String, default: null, immutable: true }, evidenceIds: { type: [String], default: [], immutable: true },
  findings: { type: [Schema.Types.Mixed], default: [], immutable: true }, late: { type: Boolean, required: true, immutable: true }
}, { strict: "throw", versionKey: false });
schema.index({ projectId: 1, rootVisitId: 1, revision: 1 }, { unique: true });
schema.index({ projectId: 1, slotId: 1 }, { unique: true, partialFilterExpression: { slotId: { $type: "string" }, isOriginal: true } });
schema.index({ projectId: 1, inspectedAt: 1 }, { unique: true, partialFilterExpression: { isOriginal: true } });
schema.index({ projectId: 1, recordedAt: -1, _id: 1 });
for (const operation of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace"] as const) {
  schema.pre(operation, function preserveVisit() { throw new Error("Inspection visits are immutable. Append a correction."); });
}
schema.pre("save", function preserveSavedVisit() {
  if (!this.isNew && this.isModified()) throw new Error("Inspection visits are immutable. Append a correction.");
});
export const ProcurementInspectionVisitModel = models.ProcurementInspectionVisit ?? model("ProcurementInspectionVisit", schema);
