import { model, models, Schema } from "./mongoose.js";

const aiEstimatorKnowledgeDisplayOrderSequenceSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    highWaterOrder: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger
    }
  },
  {
    collection: "aiEstimatorKnowledgeDisplayOrderSequences",
    timestamps: true,
    versionKey: false,
    strict: "throw"
  }
);

export const AiEstimatorKnowledgeDisplayOrderSequenceModel =
  models.AiEstimatorKnowledgeDisplayOrderSequence ??
  model(
    "AiEstimatorKnowledgeDisplayOrderSequence",
    aiEstimatorKnowledgeDisplayOrderSequenceSchema
  );
