import { model, models, Schema } from "./mongoose.js";

const cropSchema = new Schema({
  x: { type: Number, required: true, min: 0, immutable: true },
  y: { type: Number, required: true, min: 0, immutable: true },
  width: { type: Number, required: true, min: 1, immutable: true },
  height: { type: Number, required: true, min: 1, immutable: true }
}, { _id: false, strict: "throw" });

const patchSchema = new Schema({
  drawingId: { type: String, ref: "EstimateDesignDrawing", required: true, immutable: true },
  drawingRevisionId: { type: String, ref: "EstimateDesignRevision", required: true, immutable: true },
  crop: { type: cropSchema, required: true, immutable: true },
  order: { type: Number, required: true, min: 0, immutable: true }
}, { _id: false, strict: "throw" });

export const estimatePlanPageRevisionSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  estimateId: { type: String, ref: "Estimate", required: true, immutable: true },
  sourcePageId: { type: String, ref: "EstimateDesignSourcePage", required: true, immutable: true },
  revisionNumber: { type: Number, required: true, min: 1, immutable: true },
  basePageReference: { type: String, required: true, immutable: true },
  status: { type: String, required: true, enum: ["awaiting_review", "changes_requested", "revised", "approved"] },
  patches: { type: [patchSchema], required: true, immutable: true },
  previousRevisionId: { type: String, ref: "EstimatePlanPageRevision", default: null, immutable: true },
  createdBy: { type: String, required: true, immutable: true }
}, { timestamps: true, versionKey: false, strict: "throw" });

estimatePlanPageRevisionSchema.pre("validate", function validateUniquePatches() {
  const ids = this.get("patches").map((patch: { drawingId: string }) => patch.drawingId);
  if (new Set(ids).size !== ids.length) throw new Error("Plan page patches require a unique drawing ID.");
});
estimatePlanPageRevisionSchema.index({ sourcePageId: 1, revisionNumber: 1 }, { unique: true });

export const EstimatePlanPageRevisionModel = models.EstimatePlanPageRevision ??
  model("EstimatePlanPageRevision", estimatePlanPageRevisionSchema);
