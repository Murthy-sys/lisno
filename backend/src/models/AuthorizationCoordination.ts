import { model, models, Schema } from "./mongoose.js";

const authorizationCoordinationSchema = new Schema(
  {
    _id: {
      type: String,
      required: true,
      immutable: true,
      enum: ["authorization"]
    },
    revision: { type: Number, required: true, min: 1 },
    updatedAt: { type: Date, required: true }
  },
  { versionKey: false }
);

export const AuthorizationCoordinationModel =
  models.AuthorizationCoordination ??
  model("AuthorizationCoordination", authorizationCoordinationSchema);
