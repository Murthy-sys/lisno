import { model, models, Schema } from "./mongoose.js";
const schema = new Schema({
  _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true },
  roundId: { type: String, required: true, immutable: true }, itemId: { type: String, required: true, immutable: true },
  revision: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  correctionOf: { type: String, default: null, immutable: true }, correctionReason: { type: String, default: null, immutable: true },
  membershipDigest: { type: String, required: true, immutable: true }, sourceDigest: { type: String, required: true, immutable: true },
  itemSnapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
  checkedAt: { type: Date, required: true, immutable: true }, status: { type: String, required: true, enum: ["not_started", "in_progress", "blocked", "completed"], immutable: true },
  progress: { type: Number, default: null, min: 0, max: 100, immutable: true }, notes: { type: String, required: true, maxlength: 2000, immutable: true },
  nextAction: { type: String, required: true, maxlength: 2000, immutable: true }, nextCheckDate: { type: String, required: true, immutable: true },
  delayed: { type: Boolean, required: true, immutable: true }, delayReason: { type: String, default: null, immutable: true },
  responsibleParty: { type: String, default: null, immutable: true }, recoveryAction: { type: String, default: null, immutable: true },
  recoveryDate: { type: String, default: null, immutable: true }, forecastDate: { type: String, default: null, immutable: true },
  forecastReason: { type: String, default: null, immutable: true }, submittedAt: { type: Date, required: true, immutable: true },
  submittedById: { type: String, required: true, immutable: true }, submittedByName: { type: String, required: true, immutable: true },
  late: { type: Boolean, required: true, immutable: true }
}, { strict: "throw", versionKey: false });
schema.index({ roundId: 1, itemId: 1, revision: 1 }, { unique: true });
schema.index({ projectId: 1, roundId: 1, submittedAt: -1 });
for (const operation of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace"] as const) {
  schema.pre(operation, function preserveObservation() { throw new Error("Procurement observations are immutable. Append a correction."); });
}
schema.pre("save", function preserveSavedObservation() {
  if (!this.isNew && this.isModified()) throw new Error("Procurement observations are immutable. Append a correction.");
});
export const ProcurementProgressCheckModel = models.ProcurementProgressCheck ?? model("ProcurementProgressCheck", schema);
