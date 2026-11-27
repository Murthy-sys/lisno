import { model, models, Schema } from "./mongoose.js";
const origin = new Schema({ kind: { type: String, required: true, enum: ["handover", "inspection", "urgent"] }, entityId: { type: String, required: true }, checkId: { type: String } }, { _id: false, strict: "throw" });
const schema = new Schema({
  _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true },
  snagId: { type: String, required: true, immutable: true }, sourceDigest: { type: String, required: true, immutable: true },
  origin: { type: origin, required: true, immutable: true }, digest: { type: String, required: true, immutable: true },
  itemId: { type: String, default: null, immutable: true }, vendorId: { type: String, default: null, immutable: true },
  title: { type: String, required: true, maxlength: 180, immutable: true }, note: { type: String, required: true, maxlength: 2000, immutable: true },
  ownerId: { type: String, required: true, immutable: true }, dueAt: { type: Date, required: true, immutable: true },
  evidenceIds: { type: [String], required: true, immutable: true }, reportedById: { type: String, required: true, immutable: true },
  reportedAt: { type: Date, required: true, immutable: true }
}, { strict: "throw", versionKey: false });
schema.index({ projectId: 1, "origin.kind": 1, "origin.entityId": 1, "origin.checkId": 1 }, { unique: true });
schema.index({ projectId: 1, reportedAt: -1, _id: 1 });
schema.index({ snagId: 1 }, { unique: true });
for (const operation of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace"] as const) {
  schema.pre(operation, function preventOriginChanges() { throw new Error("Procurement finding origin records are immutable. Resolve the canonical snag."); });
}
schema.pre("save", function preventSavedOriginChanges() {
  if (!this.isNew && this.isModified()) throw new Error("Procurement finding origin records are immutable. Resolve the canonical snag.");
});
export const ProcurementFindingModel = models.ProcurementFinding ?? model("ProcurementFinding", schema);
