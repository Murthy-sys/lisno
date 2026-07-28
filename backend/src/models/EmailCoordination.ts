import { model, models, Schema } from "./mongoose.js";

const emailCoordinationSchema = new Schema(
  {
    _id: { type: String, required: true },
    revision: { type: Number, required: true, min: 1 }
  },
  { versionKey: false }
);

export const EmailCoordinationModel =
  models.EmailCoordination ??
  model("EmailCoordination", emailCoordinationSchema);
