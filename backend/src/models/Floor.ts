import { model, models, Schema } from "./mongoose.js";

const floorSchema = new Schema(
  {
    _id: { type: String, required: true },
    projectId: { type: String, ref: "Project", required: true },
    name: { type: String, required: true },
    number: { type: String, required: true },
    order: { type: Number, required: true, min: 0 },
    progress: { type: Number, required: true, min: 0, max: 100 },
    plannedStartAt: { type: Date, required: true },
    plannedEndAt: { type: Date, required: true },
    actualStartAt: { type: Date, default: null },
    actualEndAt: { type: Date, default: null }
  },
  { timestamps: true, versionKey: false }
);

floorSchema.index({ projectId: 1, order: 1 }, { unique: true });

export const FloorModel = models.Floor ?? model("Floor", floorSchema);
