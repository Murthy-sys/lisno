import mongoose from "mongoose";
import { assertEstimateDesignMapping, estimateDesignMappingStatuses } from "../domain/estimate-design-mapping.js";
import { model, models, Schema } from "./mongoose.js";

const cropSchema = new Schema({
  x: { type: Number, required: true, min: 0 },
  y: { type: Number, required: true, min: 0 },
  width: { type: Number, required: true, min: 1 },
  height: { type: Number, required: true, min: 1 }
}, { _id: false, strict: "throw" });

const mappingKeys = [
  "roomId",
  "scopeSectionId",
  "catalogueId",
  "mappingStatus"
] as const;

const nullableMappingIdentifier = () => ({
  type: String,
  default: null,
  immutable: true,
  validate: {
    validator: (value: unknown) =>
      value === null ||
      (
        typeof value === "string" &&
        value.trim().length > 0 &&
        !["null", "undefined"].includes(value.trim().toLowerCase())
      ),
    message: "Mapping identifiers must be a real identifier or null."
  }
});

function mappingKeysIn(value: unknown): boolean {
  if (typeof value === "string") return mappingKeys.includes(value as typeof mappingKeys[number]);
  if (Array.isArray(value)) return value.some((item) => mappingKeysIn(item));
  if (!value || typeof value !== "object") return false;
  return mappingKeys.some((key) => key in value);
}

function updateOperatorTouchesMapping(operator: string, value: unknown) {
  if (operator === "$rename" && value && typeof value === "object" && !Array.isArray(value)) {
    return mappingKeysIn(value) || Object.values(value).some((target) => mappingKeysIn(target));
  }
  return mappingKeysIn(value);
}

function updateTouchesMapping(update: Record<string, unknown>) {
  return Object.entries(update).some(([operator, value]) =>
    operator.startsWith("$")
      ? updateOperatorTouchesMapping(operator, value)
      : mappingKeys.includes(operator as typeof mappingKeys[number])
  );
}

export const estimateDesignRevisionSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  drawingId: { type: String, ref: "EstimateDesignDrawing", required: true, immutable: true },
  revisionNumber: { type: Number, required: true, immutable: true, min: 1 },
  sourcePageId: { type: String, ref: "EstimateDesignSourcePage", required: true, immutable: true },
  crop: { type: cropSchema, required: true, immutable: true },
  croppedFileReference: { type: String, required: true, immutable: true },
  roomId: nullableMappingIdentifier(),
  scopeSectionId: nullableMappingIdentifier(),
  catalogueId: nullableMappingIdentifier(),
  mappingStatus: {
    type: String,
    required: true,
    enum: estimateDesignMappingStatuses,
    default: "misc",
    immutable: true
  },
  label: { type: String, required: true, immutable: true, trim: true, minlength: 1, maxlength: 500 },
  reviewStatus: { type: String, required: true, enum: ["draft", "submitted", "approved", "changes_requested"] },
  submittedAt: { type: Date, default: null },
  reviewerId: { type: String, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
  changeSummary: { type: String, default: null, maxlength: 1_000 },
  annotationLayerId: { type: String, ref: "EstimateDesignAnnotationDraft", default: null },
  annotations: { type: Schema.Types.Mixed, default: null },
  replacementUploadId: { type: String, ref: "EstimateDesignUpload", default: null },
  replacesRevisionId: { type: String, ref: "EstimateDesignRevision", default: null, immutable: true }
}, { timestamps: true, versionKey: false });

estimateDesignRevisionSchema.pre("validate", function () {
  assertEstimateDesignMapping({
    roomId: this.roomId,
    scopeSectionId: this.scopeSectionId,
    catalogueId: this.catalogueId,
    mappingStatus: this.mappingStatus
  });
});

function rejectRevisionMappingUpdate(this: mongoose.Query<unknown, unknown>) {
  const update = this.getUpdate();
  const touchesMapping = Array.isArray(update)
    ? update.some((stage) => {
      const value = stage as Record<string, unknown>;
      return updateTouchesMapping(value) || "$replaceRoot" in value || "$replaceWith" in value;
    })
    : updateTouchesMapping((update ?? {}) as Record<string, unknown>);
  if (touchesMapping) throw new Error("Revision mapping snapshots are immutable.");
}

estimateDesignRevisionSchema.pre(["updateOne", "updateMany", "findOneAndUpdate"], rejectRevisionMappingUpdate);

estimateDesignRevisionSchema.index({ drawingId: 1, revisionNumber: 1 }, { unique: true });

export const EstimateDesignRevisionModel = models.EstimateDesignRevision ?? model("EstimateDesignRevision", estimateDesignRevisionSchema);
