import { model, models, Schema } from "./mongoose.js";

const cropSchema = new Schema(
  {
    x: { type: Number, required: true, min: 0 },
    y: { type: Number, required: true, min: 0 },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 }
  },
  { _id: false }
);

const designSectionRevisionSchema = new Schema(
  {
    _id: { type: String, required: true },
    sectionId: { type: String, ref: "DesignSection", required: true },
    revisionNumber: { type: Number, required: true, min: 1 },
    sourcePageId: { type: String, ref: "DesignSourcePage", required: true },
    crop: { type: cropSchema, required: true },
    croppedFileReference: { type: String, required: true },
    label: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    reviewStatus: {
      type: String,
      enum: ["draft", "submitted", "approved", "rejected"],
      required: true
    },
    submittedAt: { type: Date, default: null },
    reviewerId: { type: String, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    rejectionComment: { type: String, default: null, maxlength: 1000 }
  },
  { timestamps: true, versionKey: false }
);

designSectionRevisionSchema.index({ sectionId: 1, revisionNumber: 1 }, { unique: true });

export const DesignSectionRevisionModel =
  models.DesignSectionRevision ??
  model("DesignSectionRevision", designSectionRevisionSchema);
