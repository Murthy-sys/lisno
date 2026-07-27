import { model, models, Schema } from "./mongoose.js";

const evaluationSchema = new Schema(
  {
    _id: { type: String, required: true },
    subjectUserId: { type: String, ref: "User", required: true, immutable: true },
    evaluatorUserId: { type: String, ref: "User", required: true, immutable: true },
    evaluatorRole: {
      type: String,
      enum: ["design_manager", "design_head"],
      required: true,
      immutable: true
    },
    periodStartAt: { type: Date, required: true, immutable: true },
    periodEndAt: { type: Date, required: true, immutable: true },
    score: { type: Number, required: true, min: 0, max: 100, immutable: true },
    comments: { type: String, required: true, immutable: true },
    revisionOf: { type: String, ref: "Evaluation", default: null, immutable: true }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
  }
);

evaluationSchema.index({ subjectUserId: 1, createdAt: 1, _id: 1 });
evaluationSchema.index({ evaluatorUserId: 1, createdAt: 1 });
evaluationSchema.index({ revisionOf: 1 });

export const EvaluationModel =
  models.Evaluation ?? model("Evaluation", evaluationSchema);
