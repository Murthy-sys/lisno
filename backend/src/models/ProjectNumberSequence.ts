import { model, models, Schema } from "./mongoose.js";

export const PROJECT_NUMBER_SEQUENCE_ID = "project-number";

const projectNumberSequenceSchema = new Schema({
  _id: { type: String, required: true, enum: [PROJECT_NUMBER_SEQUENCE_ID] },
  lastNumber: { type: Number, required: true, min: 0, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger }
}, { versionKey: false });

export const ProjectNumberSequenceModel = models.ProjectNumberSequence ?? model("ProjectNumberSequence", projectNumberSequenceSchema);
