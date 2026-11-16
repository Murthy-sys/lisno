import { model, models, Schema } from "./mongoose.js";
import { PROJECT_INITIATION_DEFAULTS_ID } from "../contracts/project-initiation-defaults.js";

const schema = new Schema({
  _id: { type: String, required: true, enum: [PROJECT_INITIATION_DEFAULTS_ID] },
  projectManagerId: { type: String, required: true, ref: "User" },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  updatedById: { type: String, required: true, ref: "User" },
  updatedAt: { type: Date, required: true }
}, { versionKey: false, strict: "throw" });

export const ProjectInitiationDefaultsModel = models.ProjectInitiationDefaults ?? model("ProjectInitiationDefaults", schema);
