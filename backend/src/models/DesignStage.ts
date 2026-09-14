import { DESIGN_STAGE_TYPES } from "../domain/design-workflow.js";
import { model, models, Schema } from "./mongoose.js";

const designStageSchema = new Schema(
  {
    _id: { type: String, required: true },
    projectId: { type: String, ref: "Project", required: true },
    workflowStageId: { type: String, default: undefined },
    floorId: { type: String, ref: "Floor", required: true },
    name: { type: String, required: true },
    type: {
      type: String,
      enum: DESIGN_STAGE_TYPES,
      required: true
    },
    order: { type: Number, required: true, min: 0 },
    dependencyStageIds: [{ type: String, ref: "DesignStage" }]
  },
  { timestamps: true, versionKey: false }
);

designStageSchema.index({ projectId: 1, floorId: 1, order: 1, _id: 1 });

export const DesignStageModel =
  models.DesignStage ?? model("DesignStage", designStageSchema);
