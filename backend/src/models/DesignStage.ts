import { model, models, Schema } from "mongoose";

const designStageSchema = new Schema(
  {
    _id: { type: String, required: true },
    projectId: { type: String, ref: "Project", required: true },
    floorId: { type: String, ref: "Floor", required: true },
    name: { type: String, required: true },
    type: {
      type: String,
      enum: [
        "internal_kickoff",
        "client_kickoff",
        "key_collection",
        "site_measurement",
        "concept_mood_board",
        "floor_plan",
        "client_revisions",
        "final_approval",
        "design_handoff"
      ],
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
