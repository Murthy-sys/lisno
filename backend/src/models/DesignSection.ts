import { model, models, Schema } from "./mongoose.js";

const designSectionSchema = new Schema(
  {
    _id: { type: String, required: true },
    designVersionId: { type: String, ref: "DesignVersion", required: true },
    sourcePageId: { type: String, ref: "DesignSourcePage", required: true },
    label: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    active: { type: Boolean, required: true, default: true },
    source: { type: String, enum: ["ocr", "manual"], required: true },
    ocrConfidence: { type: Number, default: null, min: 0, max: 1 }
  },
  { timestamps: true, versionKey: false }
);

designSectionSchema.index({ designVersionId: 1, active: 1, _id: 1 });

export const DesignSectionModel =
  models.DesignSection ?? model("DesignSection", designSectionSchema);
