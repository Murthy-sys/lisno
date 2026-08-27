import {
  PROJECT_WORKFLOW_TASK_KINDS,
  PROJECT_WORKFLOW_TASK_STATUSES
} from "../domain/project-workflow.js";
import { ROLE_CODES } from "../domain/roles.js";
import { model, models, Schema } from "./mongoose.js";

const projectWorkflowTaskSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    dedupeKey: { type: String, required: true, immutable: true },
    projectId: { type: String, ref: "Project", required: true, immutable: true },
    estimateId: { type: String, ref: "Estimate", required: true, immutable: true },
    designPlanVersion: { type: Number, required: true, min: 0, immutable: true },
    kind: {
      type: String,
      enum: PROJECT_WORKFLOW_TASK_KINDS,
      required: true,
      immutable: true
    },
    title: { type: String, required: true, trim: true, maxlength: 500 },
    description: { type: String, default: "", maxlength: 2_000 },
    assigneeRole: {
      type: String,
      enum: ROLE_CODES,
      required: true,
      immutable: true
    },
    assigneeUserId: { type: String, ref: "User", default: null },
    sourceSectionId: { type: String, default: null, immutable: true },
    sourceLineItemKey: { type: String, default: null, immutable: true },
    roomName: { type: String, default: null, immutable: true },
    status: {
      type: String,
      enum: PROJECT_WORKFLOW_TASK_STATUSES,
      required: true,
      default: "open"
    },
    progress: { type: Number, required: true, default: 0, min: 0, max: 100 },
    version: { type: Number, required: true, default: 1, min: 1 },
    openedAt: { type: Date, required: true },
    /*
     * Both feed the shared KPI. They default to null so rows created before
     * the KPI rollout still read; the KPI derives a fallback deadline from
     * openedAt and the task kind for those.
     */
    dueAt: { type: Date, default: null },
    plannedEffort: { type: Number, default: null, min: 0 },
    completedAt: { type: Date, default: null }
  },
  { timestamps: true, versionKey: false }
);

projectWorkflowTaskSchema.index({ dedupeKey: 1 }, { unique: true });
projectWorkflowTaskSchema.index({ assigneeUserId: 1, status: 1, openedAt: -1 });
projectWorkflowTaskSchema.index({ assigneeRole: 1, status: 1, openedAt: -1 });
projectWorkflowTaskSchema.index({ projectId: 1, kind: 1, openedAt: -1 });

export const ProjectWorkflowTaskModel =
  models.ProjectWorkflowTask ??
  model("ProjectWorkflowTask", projectWorkflowTaskSchema);
