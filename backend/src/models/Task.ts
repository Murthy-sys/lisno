import { model, models, Schema } from "./mongoose.js";

const taskSchema = new Schema(
  {
    _id: { type: String, required: true },
    projectId: { type: String, ref: "Project", required: true },
    floorId: { type: String, ref: "Floor", required: true },
    stageId: { type: String, ref: "DesignStage", required: true },
    title: { type: String, required: true },
    description: { type: String, required: true, default: "" },
    order: { type: Number, required: true, min: 0 },
    ownerId: { type: String, ref: "User", required: true },
    plannedStartAt: { type: Date, required: true },
    originalDeadlineAt: { type: Date, required: true, immutable: true },
    currentDeadlineAt: { type: Date, required: true },
    plannedEffort: { type: Number, default: null, min: 0 },
    progress: { type: Number, required: true, min: 0, max: 100 },
    status: {
      type: String,
      enum: ["not_started", "in_progress", "in_review", "blocked", "completed"],
      required: true
    },
    completedAt: { type: Date, default: null },
    dependencyTaskIds: [{ type: String, ref: "Task" }],
    latestUpdateAt: { type: Date, default: null },
    wasYellow: { type: Boolean },
    approvalVersion: { type: Number, default: null },
    approvalStatus: {
      type: String,
      enum: ["approved", "rejected", "unapproved", null],
      default: null
    },
    revisionCount: { type: Number, default: null, min: 0 },
    hasReview: { type: Boolean },
    updateEvents: [
      {
        _id: false,
        occurredAt: { type: Date, required: true }
      }
    ]
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    versionKey: "__v"
  }
);

taskSchema.index({ projectId: 1, floorId: 1, stageId: 1, order: 1 });
taskSchema.index({ ownerId: 1, status: 1, currentDeadlineAt: 1 });

export const TaskModel = models.Task ?? model("Task", taskSchema);
