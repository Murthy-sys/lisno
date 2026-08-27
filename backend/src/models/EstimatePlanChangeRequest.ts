import { annotationDocumentSchema } from "../domain/estimate-design.js";
import { derivePlanRequestStatus, planRequestTargetStatuses } from "../domain/estimate-plan-review.js";
import { model, models, Schema } from "./mongoose.js";

const targetSchema = new Schema({
  drawingId: { type: String, ref: "EstimateDesignDrawing", required: true, immutable: true },
  requestedRevisionId: { type: String, ref: "EstimateDesignRevision", required: true, immutable: true },
  status: { type: String, enum: planRequestTargetStatuses, required: true },
  resolvedByRevisionId: { type: String, ref: "EstimateDesignRevision", default: null }
}, { _id: false, strict: "throw" });

export const estimatePlanChangeRequestSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  estimateId: { type: String, ref: "Estimate", required: true, immutable: true },
  uploadId: { type: String, ref: "EstimateDesignUpload", required: true, immutable: true },
  sourcePageId: { type: String, ref: "EstimateDesignSourcePage", required: true, immutable: true },
  clientId: { type: String, ref: "User", required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true, maxlength: 128 },
  version: { type: Number, required: true, min: 1 },
  summary: { type: String, required: true, trim: true, minlength: 1, maxlength: 1_000 },
  annotations: { type: Schema.Types.Mixed, required: true },
  targets: { type: [targetSchema], required: true },
  unassigned: { type: Boolean, required: true },
  unassignedResolved: { type: Boolean, default: false },
  resolutionNote: { type: String, trim: true, maxlength: 1_000, default: null },
  status: { type: String, enum: ["open", "resolved"], required: true }
}, { timestamps: true, versionKey: false, strict: "throw" });

estimatePlanChangeRequestSchema.pre("validate", function validateRequest() {
  annotationDocumentSchema.parse(this.get("annotations"));
  const targets = this.get("targets") as Array<{ drawingId: string; status: typeof planRequestTargetStatuses[number] }>;
  const unassigned = Boolean(this.get("unassigned"));
  if ((unassigned && targets.length > 0) || (!unassigned && targets.length === 0)) {
    throw new Error("Plan feedback must be either unassigned or contain one or more targets.");
  }
  if (new Set(targets.map((target) => target.drawingId)).size !== targets.length) {
    throw new Error("Plan feedback targets require unique drawing IDs.");
  }
  const derived = derivePlanRequestStatus(targets.map((target) => target.status), unassigned, Boolean(this.get("unassignedResolved")));
  if (this.get("status") !== derived) throw new Error("Plan feedback status must match its target lifecycle.");
});
estimatePlanChangeRequestSchema.index(
  { clientId: 1, sourcePageId: 1, idempotencyKey: 1 },
  { unique: true }
);
estimatePlanChangeRequestSchema.index(
  { clientId: 1, sourcePageId: 1 },
  { unique: true, partialFilterExpression: { status: "open" } }
);

export const EstimatePlanChangeRequestModel = models.EstimatePlanChangeRequest ??
  model("EstimatePlanChangeRequest", estimatePlanChangeRequestSchema);
