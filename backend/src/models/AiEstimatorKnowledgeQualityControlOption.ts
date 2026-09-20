import {
  AI_ESTIMATOR_KNOWLEDGE_QUALITY_CONTROL_OPTION_KINDS,
  AI_ESTIMATOR_KNOWLEDGE_QUALITY_CONTROL_OPTION_NAME_MAX_LENGTH,
  AI_ESTIMATOR_KNOWLEDGE_QUALITY_CONTROL_OPTION_REFERENCE_PATTERN,
  normalizeKnowledgeQualityControlOptionName
} from "../domain/ai-estimator-knowledge-quality-control-option.js";
import { model, models, Schema } from "./mongoose.js";

const qualityControlOptionSchema = new Schema(
  {
    _id: {
      type: String,
      required: true,
      immutable: true,
      match: AI_ESTIMATOR_KNOWLEDGE_QUALITY_CONTROL_OPTION_REFERENCE_PATTERN
    },
    kind: {
      type: String,
      enum: AI_ESTIMATOR_KNOWLEDGE_QUALITY_CONTROL_OPTION_KINDS,
      required: true,
      immutable: true
    },
    name: {
      type: String,
      required: true,
      immutable: true,
      minlength: 1,
      maxlength: AI_ESTIMATOR_KNOWLEDGE_QUALITY_CONTROL_OPTION_NAME_MAX_LENGTH
    },
    normalizedName: {
      type: String,
      required: true,
      immutable: true,
      minlength: 1,
      maxlength: AI_ESTIMATOR_KNOWLEDGE_QUALITY_CONTROL_OPTION_NAME_MAX_LENGTH
    },
    version: {
      type: Number,
      required: true,
      immutable: true,
      default: 1,
      min: 1,
      max: 1,
      validate: Number.isSafeInteger
    },
    createdById: {
      type: String,
      ref: "User",
      required: true,
      immutable: true
    },
    updatedById: {
      type: String,
      ref: "User",
      required: true,
      immutable: true
    },
    createdAt: {
      type: Date,
      required: true,
      immutable: true
    },
    updatedAt: {
      type: Date,
      required: true,
      immutable: true
    }
  },
  {
    collection: "aiEstimatorKnowledgeQualityControlOptions",
    versionKey: false,
    strict: "throw"
  }
);

qualityControlOptionSchema.pre("validate", function normalizeOption() {
  const value = this.get("name");
  if (typeof value !== "string") return;
  const normalized = normalizeKnowledgeQualityControlOptionName(value);
  this.set("name", normalized.name);
  this.set("normalizedName", normalized.normalizedName);
});

qualityControlOptionSchema.index(
  { kind: 1, normalizedName: 1 },
  { unique: true }
);

export const AiEstimatorKnowledgeQualityControlOptionModel =
  models.AiEstimatorKnowledgeQualityControlOption ??
  model(
    "AiEstimatorKnowledgeQualityControlOption",
    qualityControlOptionSchema
  );
