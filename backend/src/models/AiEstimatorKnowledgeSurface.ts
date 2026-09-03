import {
  AI_ESTIMATOR_KNOWLEDGE_MASTER_STATUSES,
  AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT,
  AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT,
  normalizeKnowledgeIdentity
} from "../domain/ai-estimator-knowledge.js";
import { model, models, Schema } from "./mongoose.js";

const surfaceSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    code: { type: String, required: true, minlength: 1, maxlength: 64 },
    codeNormalized: { type: String, required: true, maxlength: 64 },
    name: { type: String, required: true, minlength: 1, maxlength: AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT },
    nameNormalized: { type: String, required: true, maxlength: AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT },
    description: { type: String, default: null, maxlength: AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT },
    displayOrder: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    status: { type: String, enum: AI_ESTIMATOR_KNOWLEDGE_MASTER_STATUSES, required: true, default: "active" },
    version: { type: Number, required: true, default: 1, min: 1, validate: Number.isSafeInteger },
    dependencyEpoch: {
      type: Number,
      default: 0,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      validate: Number.isSafeInteger
    },
    createdById: { type: String, ref: "User", required: true, immutable: true },
    updatedById: { type: String, ref: "User", required: true },
    archivedAt: { type: Date, default: null },
    archivedById: { type: String, ref: "User", default: null }
  },
  { collection: "aiEstimatorKnowledgeSurfaces", timestamps: true, versionKey: false, strict: "throw" }
);

surfaceSchema.pre("validate", function normalizeMaster() {
  for (const path of ["code", "name"] as const) {
    const value = this.get(path);
    if (typeof value === "string") {
      const display = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
      this.set(path, display);
      this.set(`${path}Normalized`, normalizeKnowledgeIdentity(display));
    }
  }
  const archived = this.get("status") === "archived";
  if (archived !== (this.get("archivedAt") instanceof Date) || archived !== (typeof this.get("archivedById") === "string")) this.invalidate("status", "Master archive metadata is inconsistent.");
});

const nonArchived = { status: { $in: ["active", "inactive"] } };
surfaceSchema.index({ codeNormalized: 1 }, { unique: true, partialFilterExpression: nonArchived });
surfaceSchema.index({ nameNormalized: 1 }, { unique: true, partialFilterExpression: nonArchived });
surfaceSchema.index({ status: 1, displayOrder: 1, _id: 1 });

export const AiEstimatorKnowledgeSurfaceModel =
  models.AiEstimatorKnowledgeSurface ?? model("AiEstimatorKnowledgeSurface", surfaceSchema);
