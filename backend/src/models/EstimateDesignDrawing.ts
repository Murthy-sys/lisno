import mongoose from "mongoose";
import { assertEstimateDesignMapping, estimateDesignMappingStatuses } from "../domain/estimate-design-mapping.js";
import { model, models, Schema } from "./mongoose.js";

const evidenceSchema = new Schema({ value: { type: String, required: true, maxlength: 500 } }, { _id: false, strict: "throw" });

const mappingKeys = [
  "roomId",
  "scopeSectionId",
  "catalogueId",
  "mappingStatus"
] as const;

const nullableMappingIdentifier = () => ({
  type: String,
  default: null,
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

function assertMappingIdentifiers(mapping: Record<string, unknown>) {
  for (const key of ["roomId", "scopeSectionId", "catalogueId"] as const) {
    const value = mapping[key];
    if (
      value !== null &&
      (
        typeof value !== "string" ||
        value.trim().length === 0 ||
        ["null", "undefined"].includes(value.trim().toLowerCase())
      )
    ) {
      throw new TypeError("Mapping identifiers must be a real identifier or null.");
    }
  }
}

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

const estimateDesignDrawingSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  uploadId: { type: String, ref: "EstimateDesignUpload", required: true, immutable: true },
  sourcePageId: { type: String, ref: "EstimateDesignSourcePage", required: true, immutable: true },
  estimateId: { type: String, ref: "Estimate", required: true, immutable: true },
  active: { type: Boolean, required: true, default: true },
  verified: { type: Boolean, required: true, default: false },
  roomId: nullableMappingIdentifier(),
  scopeSectionId: nullableMappingIdentifier(),
  catalogueId: nullableMappingIdentifier(),
  mappingStatus: {
    type: String,
    required: true,
    enum: estimateDesignMappingStatuses,
    default: "misc"
  },
  detectedTitle: { type: String, required: true, maxlength: 500 },
  displayTitle: { type: String, required: true, trim: true, minlength: 1, maxlength: 500 },
  source: { type: String, required: true, enum: ["ocr", "manual"] },
  roomConfidence: { type: Number, default: null, min: 0, max: 1 },
  scopeConfidence: { type: Number, default: null, min: 0, max: 1 },
  ocrConfidence: { type: Number, default: null, min: 0, max: 1 },
  roomEvidence: { type: [evidenceSchema], default: [] },
  scopeEvidence: { type: [evidenceSchema], default: [] }
}, { timestamps: true, versionKey: false });

estimateDesignDrawingSchema.pre("validate", function () {
  assertEstimateDesignMapping({
    roomId: this.roomId,
    scopeSectionId: this.scopeSectionId,
    catalogueId: this.catalogueId,
    mappingStatus: this.mappingStatus
  });
});

function validateMappingUpdate(this: mongoose.Query<unknown, unknown>) {
  const update = this.getUpdate();
  if (Array.isArray(update)) {
    const touchesMapping = update.some((stage) => {
      const value = stage as Record<string, unknown>;
      return updateTouchesMapping(value) || "$replaceRoot" in value || "$replaceWith" in value;
    });
    if (touchesMapping) throw new Error("Pipeline updates cannot change mapping fields.");
    return;
  }
  const set = (update?.$set ?? {}) as Record<string, unknown>;
  const unset = (update?.$unset ?? {}) as Record<string, unknown>;
  const direct = (update ?? {}) as Record<string, unknown>;
  const touchesMapping = updateTouchesMapping(direct);
  if (!touchesMapping) return;
  const hasNonSetMappingMutation = Object.entries(direct).some(([operator, value]) =>
    operator !== "$set" && (
      operator.startsWith("$")
        ? updateOperatorTouchesMapping(operator, value)
        : mappingKeys.includes(operator as typeof mappingKeys[number])
    )
  );
  if (
    hasNonSetMappingMutation ||
    mappingKeys.some((key) => key in unset) ||
    !mappingKeys.every((key) => key in set)
  ) {
    throw new Error("Mapping updates must set the complete tuple.");
  }
  assertMappingIdentifiers(set);
  assertEstimateDesignMapping(set);
}

estimateDesignDrawingSchema.pre(["updateOne", "updateMany", "findOneAndUpdate"], validateMappingUpdate);

estimateDesignDrawingSchema.index({ estimateId: 1, active: 1, _id: 1 });
estimateDesignDrawingSchema.index({ uploadId: 1, sourcePageId: 1 });

export const EstimateDesignDrawingModel = models.EstimateDesignDrawing ?? model("EstimateDesignDrawing", estimateDesignDrawingSchema);
