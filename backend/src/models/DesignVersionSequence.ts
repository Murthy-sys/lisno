import { model, models, Schema } from "mongoose";

const designVersionSequenceSchema = new Schema(
  {
    _id: { type: String, required: true },
    nextNumber: { type: Number, required: true, min: 1 }
  },
  { versionKey: false }
);

export const DesignVersionSequenceModel =
  models.DesignVersionSequence ??
  model("DesignVersionSequence", designVersionSequenceSchema);
