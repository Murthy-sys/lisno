import { model, models, Schema } from "./mongoose.js";

const designSourcePageSchema = new Schema(
  {
    _id: { type: String, required: true },
    designVersionId: { type: String, ref: "DesignVersion", required: true },
    pageNumber: { type: Number, required: true, min: 1 },
    renderedFileReference: { type: String, required: true },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 }
  },
  { timestamps: true, versionKey: false }
);

designSourcePageSchema.index({ designVersionId: 1, pageNumber: 1 }, { unique: true });

export const DesignSourcePageModel =
  models.DesignSourcePage ?? model("DesignSourcePage", designSourcePageSchema);
