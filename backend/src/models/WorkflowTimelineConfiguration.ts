import { model, models, Schema } from "./mongoose.js";
import { WORKFLOW_TIMELINES_ID, WORKFLOW_TIMELINE_BANDS, WORKFLOW_TIMELINE_MAX_DAYS } from "../contracts/workflow-timelines.js";

const workdays = { type: Number, required: true, min: 1, max: WORKFLOW_TIMELINE_MAX_DAYS, validate: Number.isSafeInteger };
const baseSchema = new Schema({
  bandId: { type: String, required: true, enum: WORKFLOW_TIMELINE_BANDS.map(band => band.id) },
  designWorkdays: workdays,
  executionWorkdays: workdays
}, { _id: false, strict: "throw" });

const schema = new Schema({
  _id: { type: String, required: true, enum: [WORKFLOW_TIMELINES_ID] },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  bases: {
    type: [baseSchema], required: true,
    validate: (rows: Array<{ bandId: string }>) => rows.length === WORKFLOW_TIMELINE_BANDS.length &&
      WORKFLOW_TIMELINE_BANDS.every(band => rows.filter(row => row.bandId === band.id).length === 1)
  },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true },
  updatedById: { type: String, required: true, ref: "User" }
}, { versionKey: false, strict: "throw" });

export const WorkflowTimelineConfigurationModel = models.WorkflowTimelineConfiguration ?? model("WorkflowTimelineConfiguration", schema);
