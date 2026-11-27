import { model, models, Schema } from "./mongoose.js";
const schema = new Schema({
  _id: { type: String, required: true, immutable: true }, handoverId: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true }, version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  sourceDigest: { type: String, required: true, immutable: true }, lifecycleSourceDigest: { type: String, required: true, immutable: true },
  status: { type: String, enum: ["draft", "submitted"], required: true, immutable: true },
  action: { type: String, enum: ["save", "submit", "correct", "reconcile"], required: true, immutable: true },
  checks: { type: [Schema.Types.Mixed], required: true, immutable: true }, answers: { type: [Schema.Types.Mixed], required: true, immutable: true },
  sourceSnapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
  qualityAuditIds: { type: [String], required: true, immutable: true }, supplyReviewIds: { type: [String], required: true, immutable: true },
  previousRevisionId: { type: String, default: null, immutable: true }, reason: { type: String, default: null, immutable: true },
  actorId: { type: String, required: true, immutable: true }, occurredAt: { type: Date, required: true, immutable: true }
}, { strict: "throw", versionKey: false });
schema.index({ projectId: 1, version: 1 }, { unique: true });
for (const operation of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace"] as const) {
  schema.pre(operation, function preventRevisionChanges() { throw new Error("Submitted and draft handover revisions are immutable. Append a revision."); });
}
schema.pre("save", function preventSavedRevisionChanges() {
  if (!this.isNew && this.isModified()) throw new Error("Handover revisions are immutable. Append a revision.");
});
export const ProcurementHandoverRevisionModel = models.ProcurementHandoverRevision ?? model("ProcurementHandoverRevision", schema);
